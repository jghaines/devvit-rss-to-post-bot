import { Devvit } from "@devvit/public-api";
import {
  DEFAULT_MAX_DEDUPE,
  DEFAULT_MAX_POSTS_PER_RUN,
  applyPostedEntry,
  chooseEntriesToPost,
  hashText,
  parseState,
  serializeState,
} from "./core/bot-core.mjs";
import { renderEntryForReddit } from "./core/post-render.mjs";
import { parseFeedXml } from "./core/rss-parse.mjs";

const JOB_NAME = "poll-rss-feed";

Devvit.configure({
  redis: true,
  http: {
    domains: [
      "feeds.acast.com",
      "feeds.megaphone.fm",
      "feeds.npr.org",
      "feeds.simplecast.com",
      "rss.buzzsprout.com",
      "www.omnycontent.com",
      "www.relay.fm",
      "www.theguardian.com"
    ],
  },
  redditAPI: true,
  scheduler: true,
});

Devvit.addSettings([
  {
    name: "feedUrl",
    label: "Feed URL",
    type: "string",
    scope: "installation",
    isSecret: false,
  },
  {
    name: "targetSubreddit",
    label: "Target subreddit",
    type: "string",
    scope: "installation",
    isSecret: false,
  },
  {
    name: "pollMinutes",
    label: "Poll interval (minutes)",
    type: "number",
    scope: "installation",
    isSecret: false,
  },
  {
    name: "maxPostsPerRun",
    label: "Max posts per run",
    type: "number",
    scope: "installation",
    isSecret: false,
  },
  {
    name: "maxDedupeTrack",
    label: "Remember this many post fingerprints",
    type: "number",
    scope: "installation",
    isSecret: false,
  },
  {
    name: "postKind",
    label: "Post kind: self or link",
    type: "string",
    scope: "installation",
    isSecret: false,
  },
  {
    name: "titlePrefix",
    label: "Explicit title prefix",
    type: "string",
    scope: "installation",
    isSecret: false,
  },
  {
    name: "maxBodyChars",
    label: "Maximum body length for self-post",
    type: "number",
    scope: "installation",
    isSecret: false,
  },
]);

Devvit.addTrigger({
  event: "AppInstall",
  onEvent: async (_, context) => {
    await schedulePollingJob(context);
  },
});

Devvit.addTrigger({
  event: "AppUpgrade",
  onEvent: async (_, context) => {
    await schedulePollingJob(context);
  },
});

Devvit.addSchedulerJob({
  name: JOB_NAME,
  onRun: async (_, context) => {
    const feedUrl = normalizeString(await context.settings.get("feedUrl"));
    const targetSubreddit = normalizeSubredditName(await context.settings.get("targetSubreddit"));
    const maxPostsPerRun = parsePositiveInt(await context.settings.get("maxPostsPerRun"), DEFAULT_MAX_POSTS_PER_RUN);
    const maxDedupeTrack = parsePositiveInt(await context.settings.get("maxDedupeTrack"), DEFAULT_MAX_DEDUPE);
    const postKind = normalizeString(await context.settings.get("postKind")) || "self";
    const titlePrefix = normalizeString(await context.settings.get("titlePrefix")) || "[RSS] ";
    const maxBodyChars = parsePositiveInt(await context.settings.get("maxBodyChars"), 12000);

    console.log(
      `[${JOB_NAME}] run started target=${targetSubreddit || "(empty)"} maxPostsPerRun=${maxPostsPerRun} postKind=${postKind}`
    );

    if (!feedUrl || !targetSubreddit) {
      console.log(`[${JOB_NAME}] Missing feedUrl or targetSubreddit setting. Skipping run.`);
      return;
    }

    const stateKey = buildStateKey(feedUrl, targetSubreddit);
    const rawState = await context.redis.get(stateKey);
    let state = parseState(rawState || "");

    const response = await fetchFeed(context, feedUrl);
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
        await context.reddit.submitPost({
          subredditName: targetSubreddit,
          title: rendered.title,
          url: rendered.sourceUrl,
        });
      } else {
        await context.reddit.submitPost({
          subredditName: targetSubreddit,
          title: rendered.title,
          text: rendered.bodyText,
        });
      }

      state = applyPostedEntry(state, item, maxDedupeTrack);
      await context.redis.set(stateKey, serializeState(state, maxDedupeTrack));
      console.log(`[${JOB_NAME}] Posted fingerprint=${item.fingerprint}`);
    }
  },
});

async function schedulePollingJob(context) {
  const pollMinutes = clamp(parsePositiveInt(await context.settings.get("pollMinutes"), 15), 1, 60);
  const cron = buildPollingCron(pollMinutes);
  console.log(`[${JOB_NAME}] Scheduling with cron=${cron}`);
  await context.scheduler.runJob({
    name: JOB_NAME,
    cron,
  });
  const warmupAt = new Date(Date.now() + 15_000);
  await context.scheduler.runJob({
    name: JOB_NAME,
    runAt: warmupAt,
  });
  console.log(`[${JOB_NAME}] Scheduled warm-up run at ${warmupAt.toISOString()}`);
}

function buildStateKey(feedUrl, subreddit) {
  return `rss:state:${subreddit}:${hashText(feedUrl).slice(0, 16)}`;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeString(value) {
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

function normalizeSubredditName(value) {
  let text = normalizeString(value);
  if (!text) {
    return "";
  }

  text = text.replace(/^\/?r\//i, "");

  const userMatch = text.match(/^\/?u\/(.+)$/i);
  if (userMatch) {
    text = `u_${String(userMatch[1] || "").trim()}`;
  }

  return text.trim();
}

export function buildPollingCron(pollMinutes) {
  if (pollMinutes >= 60) {
    return "0 * * * *";
  }
  return `*/${pollMinutes} * * * *`;
}

async function fetchFeed(context, url) {
  const httpFetch = context?.http?.fetch;
  if (typeof httpFetch === "function") {
    return httpFetch(url);
  }
  return fetch(url);
}

export default Devvit;
