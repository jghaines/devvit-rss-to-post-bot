import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("local poll dry-run writes state checkpoint", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devvit-rss-local-test-"));
  const stateFile = path.join(tempDir, "state.json");
  const envFile = path.join(tempDir, ".env.test");

  fs.writeFileSync(
    envFile,
    [
      "FEED_URL=./fixtures/sample-rss.xml",
      "TARGET_SUBREDDIT=ExampleSubreddit",
      "MAX_POSTS_PER_RUN=2",
      `STATE_FILE=${stateFile}`,
      "MAX_DEDUPE_TRACK=20",
    ].join("\n"),
    "utf8"
  );

  const result = spawnSync("node", ["scripts/local-poll.mjs", "--dry-run"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ENV_FILE: envFile,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(stateFile), true, "state file should be created");

  const stateRaw = fs.readFileSync(stateFile, "utf8");
  const state = JSON.parse(stateRaw);
  assert.equal(Boolean(state?.checkpoint?.fingerprint), true);
  assert.equal(Array.isArray(state?.dedupe), true);
  assert.equal(state.dedupe.length, 2);
});
