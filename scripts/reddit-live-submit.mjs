/**
 * @param {NodeJS.ProcessEnv} env
 */
export function validateLiveCredentials(env) {
  const missing = [];
  if (!env.REDDIT_CLIENT_ID) {
    missing.push("REDDIT_CLIENT_ID");
  }
  if (!env.REDDIT_CLIENT_SECRET) {
    missing.push("REDDIT_CLIENT_SECRET");
  }
  if (!env.REDDIT_REFRESH_TOKEN) {
    missing.push("REDDIT_REFRESH_TOKEN");
  }
  if (!env.REDDIT_USER_AGENT) {
    missing.push("REDDIT_USER_AGENT");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required live credentials: ${missing.join(", ")}`);
  }
}

/**
 * @param {{ env: NodeJS.ProcessEnv }} params
 * @returns {Promise<string>}
 */
export async function fetchAccessToken({ env }) {
  validateLiveCredentials(env);

  const auth = Buffer.from(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: String(env.REDDIT_REFRESH_TOKEN),
  });

  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": String(env.REDDIT_USER_AGENT),
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch access token (${response.status}): ${text}`);
  }

  const json = await response.json();
  if (!json?.access_token) {
    throw new Error("No access_token returned by Reddit OAuth endpoint.");
  }

  return String(json.access_token);
}

/**
 * @param {{ accessToken: string; subreddit: string; title: string; url: string; userAgent: string }} params
 */
export async function submitLinkPost(params) {
  const body = new URLSearchParams({
    api_type: "json",
    kind: "link",
    sr: params.subreddit,
    title: params.title,
    url: params.url,
  });

  const response = await fetch("https://oauth.reddit.com/api/submit", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": params.userAgent,
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
