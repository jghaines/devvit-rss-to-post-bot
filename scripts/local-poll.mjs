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
import { parseFeedXml } from "../src/core/rss-parse.mjs";
import { loadEnvFile } from "./load-env.mjs";
import { fetchAccessToken, submitLinkPost, validateLiveCredentials } from "./reddit-live-submit.mjs";

const flags = new Set(process.argv.slice(2));
const liveMode = flags.has("--live");
const dryRun = flags.has("--dry-run") || !liveMode;

const envFile = process.env.ENV_FILE || ".env";
loadEnvFile(envFile);

const feedUrl = normalizeString(process.env.FEED_URL);
const targetSubreddit = normalizeString(process.env.TARGET_SUBREDDIT);
const stateFile = path.resolve(process.cwd(), normalizeString(process.env.STATE_FILE) || ".local-state.json");
const maxPostsPerRun = parsePositiveInt(process.env.MAX_POSTS_PER_RUN, DEFAULT_MAX_POSTS_PER_RUN);
const maxDedupeTrack = parsePositiveInt(process.env.MAX_DEDUPE_TRACK, DEFAULT_MAX_DEDUPE);

if (!feedUrl || !targetSubreddit) {
  console.error("FEED_URL and TARGET_SUBREDDIT are required.");
  process.exit(1);
}

const xml = await loadXml(feedUrl);
const entries = parseFeedXml(xml);

if (entries.length === 0) {
  console.log("No feed entries parsed.");
  process.exit(0);
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
  process.exit(0);
}

let accessToken = "";
if (!dryRun) {
  validateLiveCredentials(process.env);
  accessToken = await fetchAccessToken({ env: process.env });
}

let nextState = state;
for (const item of selected) {
  if (dryRun) {
    console.log(`[DRY RUN] Would submit: "${item.entry.title}" -> ${item.entry.url}`);
  } else {
    await submitLinkPost({
      accessToken,
      subreddit: targetSubreddit,
      title: item.entry.title,
      url: item.entry.url,
      userAgent: String(process.env.REDDIT_USER_AGENT),
    });
    console.log(`Submitted: "${item.entry.title}" -> ${item.entry.url}`);
  }

  nextState = applyPostedEntry(nextState, item, maxDedupeTrack);
}

writeStateFile(stateFile, nextState, maxDedupeTrack);
console.log(`State updated: ${stateFile}`);
console.log(`Checkpoint fingerprint: ${nextState.checkpoint?.fingerprint || "(none)"}`);

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
