import { reddit } from "@devvit/reddit";
import { redis } from "@devvit/redis";
import { scheduler } from "@devvit/scheduler";
import { settings } from "@devvit/settings";
import {
  DEFAULT_MAX_DEDUPE,
  DEFAULT_MAX_POSTS_PER_RUN,
  applyPostedEntry,
  chooseEntriesToPost,
  hashText,
  parseState,
  serializeState,
} from "../core/bot-core.mjs";
import { renderEntryForReddit } from "../core/post-render.mjs";
import { parseFeedXml } from "../core/rss-parse.mjs";
import {
  buildPollingCron,
  clamp,
  normalizeString,
  normalizeSubredditName,
  parsePositiveInt,
} from "../core/schedule.mjs";

/**
 * Task name shared between the scheduler declaration in `devvit.json`
 * (`scheduler.tasks.poll-rss-feed`) and the runtime `scheduler.runJob` calls.
 */
export const JOB_NAME = "poll-rss-feed";

/**
 * Poll the configured RSS feed once and submit any new entries as Reddit posts.
 * Invoked by the `/internal/scheduler/poll-rss-feed` endpoint on each cron tick
 * (and the warm-up run scheduled at install/upgrade).
 */
export async function runPollJob() {
  const feedUrl = normalizeString(await settings.get("feedUrl"));
  const targetSubreddit = normalizeSubredditName(await settings.get("targetSubreddit"));
  const maxPostsPerRun = parsePositiveInt(await settings.get("maxPostsPerRun"), DEFAULT_MAX_POSTS_PER_RUN);
  const maxDedupeTrack = parsePositiveInt(await settings.get("maxDedupeTrack"), DEFAULT_MAX_DEDUPE);
  const postKind = normalizeString(await settings.get("postKind")) || "self";
  const titlePrefix = normalizeString(await settings.get("titlePrefix")) || "[RSS] ";
  const maxBodyChars = parsePositiveInt(await settings.get("maxBodyChars"), 12000);

  console.log(
    `[${JOB_NAME}] run started target=${targetSubreddit || "(empty)"} maxPostsPerRun=${maxPostsPerRun} postKind=${postKind}`
  );

  if (!feedUrl || !targetSubreddit) {
    console.log(`[${JOB_NAME}] Missing feedUrl or targetSubreddit setting. Skipping run.`);
    return;
  }

  const stateKey = buildStateKey(feedUrl, targetSubreddit);
  const rawState = await redis.get(stateKey);
  let state = parseState(rawState || "");

  const response = await fetch(feedUrl);
  if (!response.ok) {
    throw new Error(`Feed request failed with status ${response.status}`);
  }

  const xml = await response.text();
  const entries = parseFeedXml(xml);
  console.log(`[${JOB_NAME}] Parsed entries=${entries.length}`);
  const selected = chooseEntriesToPost({
    entries,
    checkpoint: state.checkpoint,
    dedupe: state.dedupe,
    maxPostsPerRun,
  });
  console.log(`[${JOB_NAME}] Selected entries=${selected.length}`);

  for (const item of selected) {
    const rendered = renderEntryForReddit(item.entry, {
      postKind,
      titlePrefix,
      maxBodyChars,
    });

    if (rendered.postKind === "link") {
      await reddit.submitPost({
        subredditName: targetSubreddit,
        title: rendered.title,
        url: rendered.sourceUrl,
      });
    } else {
      await reddit.submitPost({
        subredditName: targetSubreddit,
        title: rendered.title,
        text: rendered.bodyText,
      });
    }

    state = applyPostedEntry(state, item, maxDedupeTrack);
    await redis.set(stateKey, serializeState(state, maxDedupeTrack));
    console.log(`[${JOB_NAME}] Posted fingerprint=${item.fingerprint}`);
  }
}

/**
 * (Re)register the recurring polling cron and a one-off warm-up run. Invoked by
 * the `/internal/on-app-install` and `/internal/on-app-upgrade` triggers so the
 * cron interval tracks the per-installation `pollMinutes` setting.
 */
export async function schedulePollingJob() {
  const pollMinutes = clamp(parsePositiveInt(await settings.get("pollMinutes"), 15), 1, 60);
  const cron = buildPollingCron(pollMinutes);
  console.log(`[${JOB_NAME}] Scheduling with cron=${cron}`);
  await scheduler.runJob({ name: JOB_NAME, cron });

  const warmupAt = new Date(Date.now() + 15_000);
  await scheduler.runJob({ name: JOB_NAME, runAt: warmupAt });
  console.log(`[${JOB_NAME}] Scheduled warm-up run at ${warmupAt.toISOString()}`);
}

/**
 * @param {string} feedUrl
 * @param {string} subreddit
 * @returns {string}
 */
function buildStateKey(feedUrl, subreddit) {
  return `rss:state:${subreddit}:${hashText(feedUrl).slice(0, 16)}`;
}

/**
 * Raw Node request handler passed to `createServer`. Routes the Devvit-internal
 * endpoints declared in `devvit.json` (scheduler task + install/upgrade triggers).
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} rsp
 */
export async function serverOnRequest(req, rsp) {
  try {
    await routeRequest(req, rsp);
  } catch (err) {
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    console.error(`server error; ${message}`);
    writeJson(rsp, 500, { status: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} rsp
 */
async function routeRequest(req, rsp) {
  const path = (req.url ?? "").split("?")[0];

  switch (path) {
    case "/internal/scheduler/poll-rss-feed":
      await runPollJob();
      return writeJson(rsp, 200, { status: "ok" });
    case "/internal/on-app-install":
    case "/internal/on-app-upgrade":
      await schedulePollingJob();
      return writeJson(rsp, 200, { status: "ok" });
    default:
      return writeJson(rsp, 404, { status: "error", message: `not found: ${path}` });
  }
}

/**
 * @param {import("node:http").ServerResponse} rsp
 * @param {number} status
 * @param {Record<string, unknown>} json
 */
function writeJson(rsp, status, json) {
  const body = JSON.stringify(json);
  rsp.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  rsp.end(body);
}
