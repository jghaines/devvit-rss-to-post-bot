import crypto from "node:crypto";

export const DEFAULT_MAX_POSTS_PER_RUN = 3;
export const DEFAULT_MAX_DEDUPE = 500;

/**
 * @typedef {Object} FeedEntry
 * @property {string | undefined} id
 * @property {string} title
 * @property {string} url
 * @property {string | undefined} publishedAt
 * @property {string | undefined} descriptionHtml
 */

/**
 * @typedef {Object} BotCheckpoint
 * @property {string} fingerprint
 * @property {string | undefined} publishedAt
 * @property {string} urlHash
 */

/**
 * @typedef {Object} BotState
 * @property {BotCheckpoint | null} checkpoint
 * @property {string[]} dedupe
 */

/**
 * @param {string} value
 * @returns {string}
 */
export function hashText(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

/**
 * @param {FeedEntry} entry
 * @returns {string}
 */
export function fingerprintEntry(entry) {
  const idPart = normalizeString(entry.id);
  if (idPart) {
    return idPart;
  }

  const urlPart = normalizeString(entry.url);
  if (urlPart) {
    return `url:${hashText(urlPart)}`;
  }

  return `fallback:${hashText(`${normalizeString(entry.title)}|${normalizeString(entry.publishedAt)}`)}`;
}

/**
 * @param {unknown[]} entries
 * @returns {FeedEntry[]}
 */
export function normalizeEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  /** @type {FeedEntry[]} */
  const result = [];

  for (const item of entries) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const title = normalizeString(item.title);
    const url = normalizeString(item.url);
    if (!title || !url) {
      continue;
    }

    result.push({
      id: normalizeString(item.id) || undefined,
      title,
      url,
      publishedAt: normalizeString(item.publishedAt) || undefined,
      descriptionHtml: normalizeString(item.descriptionHtml) || undefined,
    });
  }

  return result;
}

/**
 * @param {FeedEntry[]} entries
 * @returns {FeedEntry[]}
 */
export function sortOldestFirst(entries) {
  return entries
    .map((entry, idx) => ({ entry, idx, publishedMs: toMs(entry.publishedAt) }))
    .sort((a, b) => {
      if (a.publishedMs == null && b.publishedMs == null) {
        return a.idx - b.idx;
      }
      if (a.publishedMs == null) {
        return -1;
      }
      if (b.publishedMs == null) {
        return 1;
      }
      if (a.publishedMs === b.publishedMs) {
        return a.idx - b.idx;
      }
      return a.publishedMs - b.publishedMs;
    })
    .map((item) => item.entry);
}

/**
 * @param {FeedEntry} entry
 * @returns {BotCheckpoint}
 */
export function buildCheckpoint(entry) {
  return {
    fingerprint: fingerprintEntry(entry),
    publishedAt: normalizeString(entry.publishedAt) || undefined,
    urlHash: hashText(normalizeString(entry.url)),
  };
}

/**
 * @param {{ entries: unknown[]; checkpoint: BotCheckpoint | null; dedupe: string[]; maxPostsPerRun?: number }} params
 * @returns {{ entry: FeedEntry; fingerprint: string }[]}
 */
export function chooseEntriesToPost(params) {
  const entries = sortOldestFirst(normalizeEntries(params.entries));
  const checkpoint = params.checkpoint ?? null;
  const dedupeSet = new Set(Array.isArray(params.dedupe) ? params.dedupe : []);
  const maxPostsPerRun = parsePositiveInt(params.maxPostsPerRun, DEFAULT_MAX_POSTS_PER_RUN);
  const startIndex =
    checkpoint == null ? Math.max(0, entries.length - maxPostsPerRun) : findStartIndex(entries, checkpoint);

  /** @type {{ entry: FeedEntry; fingerprint: string }[]} */
  const selected = [];
  for (let i = startIndex; i < entries.length; i += 1) {
    const entry = entries[i];
    const fingerprint = fingerprintEntry(entry);
    if (dedupeSet.has(fingerprint)) {
      continue;
    }

    selected.push({ entry, fingerprint });
    dedupeSet.add(fingerprint);
    if (selected.length >= maxPostsPerRun) {
      break;
    }
  }

  return selected;
}

/**
 * @param {BotState} state
 * @param {{ entry: FeedEntry; fingerprint?: string }} posted
 * @param {number | undefined} maxDedupe
 * @returns {BotState}
 */
export function applyPostedEntry(state, posted, maxDedupe) {
  const max = parsePositiveInt(maxDedupe, DEFAULT_MAX_DEDUPE);
  const fingerprint = posted.fingerprint || fingerprintEntry(posted.entry);
  const dedupe = [fingerprint, ...state.dedupe.filter((item) => item !== fingerprint)].slice(0, max);

  return {
    checkpoint: buildCheckpoint(posted.entry),
    dedupe,
  };
}

/**
 * @param {string | null | undefined} raw
 * @returns {BotState}
 */
export function parseState(raw) {
  if (!raw) {
    return { checkpoint: null, dedupe: [] };
  }

  try {
    const parsed = JSON.parse(raw);
    const checkpoint = parseCheckpoint(parsed?.checkpoint);
    const dedupe = Array.isArray(parsed?.dedupe)
      ? parsed.dedupe.map((value) => normalizeString(value)).filter(Boolean)
      : [];

    return {
      checkpoint,
      dedupe: Array.from(new Set(dedupe)),
    };
  } catch {
    return { checkpoint: null, dedupe: [] };
  }
}

/**
 * @param {BotState} state
 * @param {number | undefined} maxDedupe
 * @returns {string}
 */
export function serializeState(state, maxDedupe) {
  const max = parsePositiveInt(maxDedupe, DEFAULT_MAX_DEDUPE);
  const checkpoint = state.checkpoint
    ? {
        fingerprint: normalizeString(state.checkpoint.fingerprint),
        publishedAt: normalizeString(state.checkpoint.publishedAt) || undefined,
        urlHash: normalizeString(state.checkpoint.urlHash),
      }
    : null;
  const dedupe = Array.from(new Set((state.dedupe || []).map((value) => normalizeString(value)).filter(Boolean))).slice(
    0,
    max
  );

  return JSON.stringify({ checkpoint, dedupe });
}

/**
 * @param {FeedEntry[]} entries
 * @param {BotCheckpoint | null} checkpoint
 * @returns {number}
 */
function findStartIndex(entries, checkpoint) {
  if (!checkpoint) {
    return 0;
  }

  if (checkpoint.fingerprint) {
    const idx = entries.findIndex((entry) => fingerprintEntry(entry) === checkpoint.fingerprint);
    if (idx >= 0) {
      return idx + 1;
    }
  }

  const checkpointMs = toMs(checkpoint.publishedAt);
  if (checkpointMs == null) {
    return 0;
  }

  for (let i = 0; i < entries.length; i += 1) {
    const entryMs = toMs(entries[i].publishedAt);
    if (entryMs != null && entryMs > checkpointMs) {
      return i;
    }
  }

  return entries.length;
}

/**
 * @param {unknown} value
 * @returns {BotCheckpoint | null}
 */
function parseCheckpoint(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const fingerprint = normalizeString(value.fingerprint);
  const urlHash = normalizeString(value.urlHash);
  if (!fingerprint || !urlHash) {
    return null;
  }

  return {
    fingerprint,
    urlHash,
    publishedAt: normalizeString(value.publishedAt) || undefined,
  };
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
 * @param {string | undefined} value
 * @returns {number | null}
 */
function toMs(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
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
