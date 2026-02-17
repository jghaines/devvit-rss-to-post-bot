import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_MAX_DEDUPE,
  DEFAULT_MAX_POSTS_PER_RUN,
  applyPostedEntry,
  chooseEntriesToPost,
  parseState,
  serializeState,
} from "../src/core/bot-core.mjs";
import { renderEntryForReddit, resolvePostKind } from "../src/core/post-render.mjs";
import { parseFeedXml } from "../src/core/rss-parse.mjs";
import { loadEnvFile } from "./load-env.mjs";
import { getDevvitAccessToken, submitRedditPost } from "./reddit-live-submit.mjs";

const flags = new Set(process.argv.slice(2));
const liveMode = flags.has("--live");
const dryRun = flags.has("--dry-run") || !liveMode;

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  if (isDevvitTokenError(message)) {
    console.error('Auth tip: run "npx devvit login" to refresh ~/.devvit/token, or set DEVVIT_TOKEN_FILE.');
  }
  process.exit(1);
});

async function main() {
  const envFile = process.env.ENV_FILE || ".env";
  loadEnvFile(envFile);

  const feedUrl = normalizeString(process.env.FEED_URL);
  const targetSubreddit = normalizeString(process.env.TARGET_SUBREDDIT);
  const stateFile = path.resolve(process.cwd(), normalizeString(process.env.STATE_FILE) || ".local-state.json");
  const maxPostsPerRun = parsePositiveInt(process.env.MAX_POSTS_PER_RUN, DEFAULT_MAX_POSTS_PER_RUN);
  const maxDedupeTrack = parsePositiveInt(process.env.MAX_DEDUPE_TRACK, DEFAULT_MAX_DEDUPE);
  const postKind = resolvePostKind(process.env.POST_KIND);
  const titlePrefix = normalizeString(process.env.TITLE_PREFIX) || "[RSS] ";
  const maxBodyChars = parsePositiveInt(process.env.MAX_BODY_CHARS, 12000);

  if (!feedUrl || !targetSubreddit) {
    throw new Error("FEED_URL and TARGET_SUBREDDIT are required.");
  }

  const xml = await loadXml(feedUrl);
  const entries = parseFeedXml(xml);

  if (entries.length === 0) {
    console.log("No feed entries parsed.");
    return;
  }

  const state = readStateFile(stateFile);
  const selected = chooseEntriesToPost({
    entries,
    checkpoint: state.checkpoint,
    dedupe: state.dedupe,
    maxPostsPerRun,
  });

  if (selected.length === 0) {
    console.log("No new entries to post.");
    return;
  }

  let accessToken = "";
  let tokenType = "Bearer";
  if (!dryRun) {
    const session = getDevvitAccessToken({ env: process.env });
    accessToken = session.accessToken;
    tokenType = session.tokenType;
    console.log(`Using Devvit auth token from ${session.tokenFile}`);
    console.log(`Token expires at ${new Date(session.expiresAt).toISOString()}`);
  }

  let nextState = state;
  for (const item of selected) {
    const rendered = renderEntryForReddit(item.entry, {
      postKind,
      titlePrefix,
      maxBodyChars,
    });

    if (dryRun) {
      console.log(`[DRY RUN] Would submit ${rendered.postKind} post`);
      console.log(`  title: ${rendered.title}`);
      console.log(`  url: ${rendered.sourceUrl || "(none)"}`);
      if (rendered.bodyText) {
        const preview = rendered.bodyText.length > 300 ? `${rendered.bodyText.slice(0, 300)}...` : rendered.bodyText;
        console.log(`  body preview:\n${indentBlock(preview, "    ")}`);
      }
    } else {
      await submitRedditPost({
        accessToken,
        tokenType,
        subreddit: targetSubreddit,
        title: rendered.title,
        postKind: rendered.postKind,
        url: rendered.sourceUrl,
        text: rendered.bodyText,
        userAgent: String(process.env.REDDIT_USER_AGENT || ""),
      });
      console.log(`Submitted ${rendered.postKind}: "${rendered.title}"`);
    }

    nextState = applyPostedEntry(nextState, item, maxDedupeTrack);
  }

  writeStateFile(stateFile, nextState, maxDedupeTrack);
  console.log(`State updated: ${stateFile}`);
  console.log(`Checkpoint fingerprint: ${nextState.checkpoint?.fingerprint || "(none)"}`);
}

/**
 * @param {string} source
 * @returns {Promise<string>}
 */
async function loadXml(source) {
  if (source.startsWith("https://") || source.startsWith("http://")) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Feed request failed (${response.status})`);
    }
    return response.text();
  }

  const filePath = path.resolve(process.cwd(), source);
  return fs.readFileSync(filePath, "utf8");
}

/**
 * @param {string} filePath
 */
function readStateFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { checkpoint: null, dedupe: [] };
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return parseState(raw);
}

/**
 * @param {string} filePath
 * @param {{ checkpoint: unknown; dedupe: string[] }} state
 * @param {number} maxDedupeTrack
 */
function writeStateFile(filePath, state, maxDedupeTrack) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${serializeState(state, maxDedupeTrack)}\n`, "utf8");
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeString(value) {
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

/**
 * @param {string} value
 * @param {string} prefix
 * @returns {string}
 */
function indentBlock(value, prefix) {
  return String(value || "")
    .split(/\r?\n/g)
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

/**
 * @param {string} message
 * @returns {boolean}
 */
function isDevvitTokenError(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("devvit token") || text.includes("access token is expired");
}
