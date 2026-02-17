import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_TOKEN_FILE = "~/.devvit/token";
const DEFAULT_USER_AGENT = "devvit-rss-to-post-bot/0.1";

/**
 * @param {{ env: NodeJS.ProcessEnv; nowMs?: number }} params
 * @returns {{ accessToken: string; tokenType: string; expiresAt: number; scope: string; tokenFile: string }}
 */
export function getDevvitAccessToken(params) {
  const env = params.env || process.env;
  const nowMs = Number.isFinite(params.nowMs) ? Number(params.nowMs) : Date.now();
  const tokenFileRaw = String(env.DEVVIT_TOKEN_FILE || DEFAULT_TOKEN_FILE);
  const tokenFile = resolveUserPath(tokenFileRaw);

  if (!fs.existsSync(tokenFile)) {
    throw new Error(
      `Devvit token file not found at ${tokenFile}. Run "npx devvit login" or set DEVVIT_TOKEN_FILE.`
    );
  }

  const raw = fs.readFileSync(tokenFile, "utf8");
  /** @type {{ token?: string }} */
  let wrapper;
  try {
    wrapper = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in Devvit token file: ${tokenFile}`);
  }

  const encoded = String(wrapper?.token || "").trim();
  if (!encoded) {
    throw new Error(`Devvit token file does not contain a token value: ${tokenFile}`);
  }

  const decoded = decodeDevvitTokenEnvelope(encoded);
  const accessToken = String(decoded.accessToken || "").trim();
  const tokenType = String(decoded.tokenType || "bearer").trim() || "bearer";
  const expiresAt = Number(decoded.expiresAt || 0);
  const scope = String(decoded.scope || "").trim();

  if (!accessToken) {
    throw new Error(`Devvit token file is missing accessToken: ${tokenFile}`);
  }
  if (!Number.isFinite(expiresAt) || expiresAt < nowMs + 30_000) {
    throw new Error(
      `Devvit access token is expired or near expiry. Re-run "npx devvit login" to refresh ~/.devvit/token.`
    );
  }

  return {
    accessToken,
    tokenType,
    expiresAt,
    scope,
    tokenFile,
  };
}

/**
 * @param {{
 *   accessToken: string;
 *   tokenType?: string;
 *   subreddit: string;
 *   title: string;
 *   url?: string;
 *   text?: string;
 *   postKind: "link" | "self";
 *   userAgent?: string;
 * }} params
 */
export async function submitRedditPost(params) {
  const body = new URLSearchParams({
    api_type: "json",
    kind: params.postKind,
    sr: params.subreddit,
    title: params.title,
  });

  if (params.postKind === "link") {
    if (!params.url) {
      throw new Error("Link post requested without url.");
    }
    body.set("url", params.url);
  } else {
    body.set("text", String(params.text || ""));
  }

  const response = await fetch("https://oauth.reddit.com/api/submit", {
    method: "POST",
    headers: {
      Authorization: `${normalizeTokenType(params.tokenType)} ${params.accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": String(params.userAgent || DEFAULT_USER_AGENT),
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Submit failed (${response.status}): ${text}`);
  }

  const json = await response.json();
  const errors = json?.json?.errors || [];
  if (Array.isArray(errors) && errors.length > 0) {
    throw new Error(`Reddit submit errors: ${JSON.stringify(errors)}`);
  }
}

/**
 * @param {string} encoded
 * @returns {{ accessToken?: string; tokenType?: string; expiresAt?: number; scope?: string; refreshToken?: string }}
 */
function decodeDevvitTokenEnvelope(encoded) {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const decodedRaw = Buffer.from(padded, "base64").toString("utf8");

  try {
    return JSON.parse(decodedRaw);
  } catch {
    throw new Error("Could not decode token payload from ~/.devvit/token. Try re-running `npx devvit login`.");
  }
}

/**
 * @param {string | undefined} tokenType
 * @returns {string}
 */
function normalizeTokenType(tokenType) {
  const normalized = String(tokenType || "bearer").trim();
  if (!normalized) {
    return "bearer";
  }
  return normalized.toLowerCase() === "bearer" ? "Bearer" : normalized;
}

/**
 * @param {string} value
 * @returns {string}
 */
function resolveUserPath(value) {
  const raw = String(value || "").trim();
  if (raw === "~") {
    return os.homedir();
  }
  if (raw.startsWith("~/")) {
    return path.join(os.homedir(), raw.slice(2));
  }
  return path.resolve(raw);
}
