import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "vitest";
import { getDevvitAccessToken } from "../scripts/reddit-live-submit.mjs";

test("getDevvitAccessToken returns decoded token details", () => {
  const nowMs = Date.parse("2026-02-17T12:00:00.000Z");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devvit-token-test-"));
  const tokenFile = path.join(tempDir, "token.json");

  const payload = {
    accessToken: "access-token-value",
    tokenType: "bearer",
    expiresAt: nowMs + 120_000,
    scope: "submit read",
    refreshToken: "refresh-token-value",
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  fs.writeFileSync(tokenFile, JSON.stringify({ token: encoded }, null, 2), "utf8");

  const session = getDevvitAccessToken({
    env: {
      DEVVIT_TOKEN_FILE: tokenFile,
    },
    nowMs,
  });

  assert.equal(session.accessToken, payload.accessToken);
  assert.equal(session.tokenType, payload.tokenType);
  assert.equal(session.expiresAt, payload.expiresAt);
  assert.equal(session.scope, payload.scope);
  assert.equal(session.tokenFile, tokenFile);
});

test("getDevvitAccessToken throws if token file is missing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devvit-token-missing-test-"));
  const missingFile = path.join(tempDir, "missing-token.json");

  assert.throws(
    () =>
      getDevvitAccessToken({
        env: {
          DEVVIT_TOKEN_FILE: missingFile,
        },
        nowMs: Date.parse("2026-02-17T12:00:00.000Z"),
      }),
    /Devvit token file not found/
  );
});

test("getDevvitAccessToken throws if token is expired or near expiry", () => {
  const nowMs = Date.parse("2026-02-17T12:00:00.000Z");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "devvit-token-expired-test-"));
  const tokenFile = path.join(tempDir, "token.json");

  const payload = {
    accessToken: "access-token-value",
    tokenType: "bearer",
    expiresAt: nowMs + 10_000,
    scope: "submit",
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  fs.writeFileSync(tokenFile, JSON.stringify({ token: encoded }, null, 2), "utf8");

  assert.throws(
    () =>
      getDevvitAccessToken({
        env: {
          DEVVIT_TOKEN_FILE: tokenFile,
        },
        nowMs,
      }),
    /expired or near expiry/
  );
});
