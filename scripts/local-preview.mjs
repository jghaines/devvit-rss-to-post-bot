import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_MAX_DEDUPE,
  DEFAULT_MAX_POSTS_PER_RUN,
  chooseEntriesToPost,
  fingerprintEntry,
  parseState,
} from "../src/core/bot-core.mjs";
import { parseFeedXml } from "../src/core/rss-parse.mjs";
import { loadEnvFile } from "./load-env.mjs";

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
const jsonOutput = flags.has("--json");

const envFile = getArgValue(argv, "--env") || process.env.ENV_FILE || ".env";
loadEnvFile(envFile);

const feedUrl = normalizeString(getArgValue(argv, "--feed") || process.env.FEED_URL);
const targetSubreddit = normalizeString(process.env.TARGET_SUBREDDIT) || "(unset)";
const stateFile = path.resolve(process.cwd(), normalizeString(getArgValue(argv, "--state") || process.env.STATE_FILE) || ".local-state.json");
const maxPostsPerRun = parsePositiveInt(getArgValue(argv, "--max-posts") || process.env.MAX_POSTS_PER_RUN, DEFAULT_MAX_POSTS_PER_RUN);
const maxDedupeTrack = parsePositiveInt(process.env.MAX_DEDUPE_TRACK, DEFAULT_MAX_DEDUPE);

if (!feedUrl) {
  console.error("Missing FEED_URL. Set it in env or pass --feed <path-or-url>.");
  process.exit(1);
}

const state = readStateFile(stateFile);
const xml = await loadXml(feedUrl);
const entries = parseFeedXml(xml);
const selected = chooseEntriesToPost({
  entries,
  checkpoint: state.checkpoint,
  dedupe: state.dedupe,
  maxPostsPerRun,
});

const plan = selected.map((item, index) => ({
  index: index + 1,
  title: item.entry.title,
  url: item.entry.url,
  id: item.entry.id || null,
  publishedAt: item.entry.publishedAt || null,
  fingerprint: item.fingerprint || fingerprintEntry(item.entry),
}));

if (jsonOutput) {
  console.log(
    JSON.stringify(
      {
        feedUrl,
        targetSubreddit,
        stateFile,
        maxPostsPerRun,
        maxDedupeTrack,
        parsedEntries: entries.length,
        checkpoint: state.checkpoint,
        dedupeCount: state.dedupe.length,
        willPostCount: plan.length,
        willPost: plan,
      },
      null,
      2
    )
  );
  process.exit(0);
}

console.log(`Feed source: ${feedUrl}`);
console.log(`Target subreddit: ${targetSubreddit}`);
console.log(`State file: ${stateFile}`);
console.log(`Entries parsed: ${entries.length}`);
console.log(`Checkpoint: ${state.checkpoint?.fingerprint || "(none)"}`);
console.log(`Dedupe entries tracked: ${state.dedupe.length}`);
console.log(`Max posts per run: ${maxPostsPerRun}`);
console.log(`Will post: ${plan.length}`);

if (plan.length === 0) {
  console.log("No new entries would be posted.");
  process.exit(0);
}

for (const post of plan) {
  console.log("");
  console.log(`#${post.index} ${post.title}`);
  console.log(`  url: ${post.url}`);
  console.log(`  id: ${post.id || "(none)"}`);
  console.log(`  publishedAt: ${post.publishedAt || "(none)"}`);
  console.log(`  fingerprint: ${post.fingerprint}`);
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
 * @param {string[]} args
 * @param {string} name
 * @returns {string}
 */
function getArgValue(args, name) {
  const idx = args.indexOf(name);
  if (idx < 0 || idx + 1 >= args.length) {
    return "";
  }
  return String(args[idx + 1]);
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
