import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("local preview prints post plan details", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devvit-rss-preview-test-"));
  const envFile = path.join(tempDir, ".env.preview");

  fs.writeFileSync(
    envFile,
    [
      "FEED_URL=./fixtures/sample-rss.xml",
      "TARGET_SUBREDDIT=ExampleSubreddit",
      "MAX_POSTS_PER_RUN=2",
      `STATE_FILE=${path.join(tempDir, "state.json")}`,
      "MAX_DEDUPE_TRACK=20",
    ].join("\n"),
    "utf8"
  );

  const result = spawnSync("node", ["scripts/local-preview.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ENV_FILE: envFile,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Will post: 2/);
  assert.match(result.stdout, /title: \[RSS\] Post One/);
  assert.match(result.stdout, /title: \[RSS\] Post Two/);
  assert.match(result.stdout, /bodyText:/);
  assert.match(result.stdout, /fingerprint:/);
});
