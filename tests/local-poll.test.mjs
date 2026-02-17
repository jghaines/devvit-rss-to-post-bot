import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
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

test("local poll live-mode exits with clear auth error when token is missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devvit-rss-local-live-auth-test-"));
  const stateFile = path.join(tempDir, "state.json");
  const envFile = path.join(tempDir, ".env.test");
  const missingTokenFile = path.join(tempDir, "missing-token.json");

  fs.writeFileSync(
    envFile,
    [
      "FEED_URL=./fixtures/sample-rss.xml",
      "TARGET_SUBREDDIT=ExampleSubreddit",
      "POST_KIND=self",
      "MAX_POSTS_PER_RUN=1",
      `STATE_FILE=${stateFile}`,
    ].join("\n"),
    "utf8"
  );

  const result = spawnSync("node", ["scripts/local-poll.mjs", "--live"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ENV_FILE: envFile,
      DEVVIT_TOKEN_FILE: missingTokenFile,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stderr, /Devvit token file not found/);
  assert.match(result.stderr, /Auth tip: run "npx devvit login"/);
});

test("local poll live-mode exits with clear auth error when token is expired", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devvit-rss-local-live-expired-test-"));
  const stateFile = path.join(tempDir, "state.json");
  const envFile = path.join(tempDir, ".env.test");
  const tokenFile = path.join(tempDir, "token.json");

  fs.writeFileSync(
    envFile,
    [
      "FEED_URL=./fixtures/sample-rss.xml",
      "TARGET_SUBREDDIT=ExampleSubreddit",
      "POST_KIND=self",
      "MAX_POSTS_PER_RUN=1",
      `STATE_FILE=${stateFile}`,
    ].join("\n"),
    "utf8"
  );

  const encoded = Buffer.from(
    JSON.stringify({
      accessToken: "expired-token",
      tokenType: "bearer",
      expiresAt: Date.now() + 5_000,
      scope: "submit",
    }),
    "utf8"
  ).toString("base64url");
  fs.writeFileSync(tokenFile, JSON.stringify({ token: encoded }), "utf8");

  const result = spawnSync("node", ["scripts/local-poll.mjs", "--live"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ENV_FILE: envFile,
      DEVVIT_TOKEN_FILE: tokenFile,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stderr, /expired or near expiry/);
  assert.match(result.stderr, /Auth tip: run "npx devvit login"/);
});
