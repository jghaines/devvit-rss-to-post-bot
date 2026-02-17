const DEFAULT_TITLE_PREFIX = "[RSS] ";
const DEFAULT_MAX_BODY_CHARS = 12000;

/**
 * @typedef {"link" | "self"} PostKind
 */

/**
 * @typedef {Object} RenderedPost
 * @property {string} title
 * @property {string} bodyText
 * @property {PostKind} postKind
 * @property {string} sourceUrl
 */

/**
 * @param {{ title: string; url: string; descriptionHtml?: string }} entry
 * @param {{ titlePrefix?: string; postKind?: string; maxBodyChars?: number }} options
 * @returns {RenderedPost}
 */
export function renderEntryForReddit(entry, options = {}) {
  const titlePrefix = String(options.titlePrefix ?? DEFAULT_TITLE_PREFIX);
  const postKind = resolvePostKind(options.postKind);
  const maxBodyChars = parsePositiveInt(options.maxBodyChars, DEFAULT_MAX_BODY_CHARS);

  const explicitTitle = buildExplicitTitle(titlePrefix, String(entry.title || "").trim());
  const descriptionMarkdown = htmlToRedditMarkdown(String(entry.descriptionHtml || ""));
  const sourceUrl = String(entry.url || "").trim();

  const bodyParts = [];
  if (sourceUrl) {
    bodyParts.push(`[Original link](${sourceUrl})`);
  }
  if (descriptionMarkdown) {
    bodyParts.push(descriptionMarkdown);
  }
  const bodyText = clipText(bodyParts.join("\n\n"), maxBodyChars);

  return {
    title: explicitTitle || String(entry.title || "").trim(),
    bodyText,
    postKind,
    sourceUrl,
  };
}

/**
 * Convert common HTML fragments from RSS description/content into
 * markdown compatible with Reddit self-post text.
 *
 * @param {string} html
 * @returns {string}
 */
export function htmlToRedditMarkdown(html) {
  let text = String(html || "");
  if (!text.trim()) {
    return "";
  }

  text = stripCdata(text);

  text = text.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => {
    const clean = decodeXmlEntities(stripTags(code)).trim();
    if (!clean) {
      return "";
    }
    return `\n\n\`\`\`\n${clean}\n\`\`\`\n\n`;
  });

  text = text.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, code) => {
    const clean = decodeXmlEntities(stripTags(code)).trim();
    return clean ? `\`${clean}\`` : "";
  });

  text = text.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_, attrs, label) => {
    const href = readAttribute(attrs, "href");
    const cleanedLabel = decodeXmlEntities(stripTags(label)).trim();
    if (!href) {
      return cleanedLabel;
    }
    return `[${cleanedLabel || href}](${href})`;
  });

  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p\b[^>]*>/gi, "")
    .replace(/<\/div>/gi, "\n")
    .replace(/<div\b[^>]*>/gi, "")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<\/?ul\b[^>]*>/gi, "\n")
    .replace(/<\/?ol\b[^>]*>/gi, "\n")
    .replace(/<(strong|b)\b[^>]*>/gi, "**")
    .replace(/<\/(strong|b)>/gi, "**")
    .replace(/<(em|i)\b[^>]*>/gi, "*")
    .replace(/<\/(em|i)>/gi, "*");

  text = decodeXmlEntities(stripTags(text));
  text = normalizeMarkdownWhitespace(text);

  return text.trim();
}

/**
 * @param {unknown} value
 * @returns {PostKind}
 */
export function resolvePostKind(value) {
  const normalized = String(value ?? "self").trim().toLowerCase();
  if (normalized === "link") {
    return "link";
  }
  return "self";
}

/**
 * @param {string} value
 * @returns {string}
 */
function stripCdata(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

/**
 * @param {string} value
 * @returns {string}
 */
function stripTags(value) {
  return value.replace(/<[^>]+>/g, "");
}

/**
 * @param {string} value
 * @returns {string}
 */
function decodeXmlEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * @param {string} attrs
 * @param {string} name
 * @returns {string}
 */
function readAttribute(attrs, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const match = String(attrs || "").match(pattern);
  return match ? String(match[1] || match[2] || "").trim() : "";
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeMarkdownWhitespace(value) {
  const lines = value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .split("\n")
    .map((line) => line.trim());

  const compacted = [];
  for (const line of lines) {
    if (line === "" && compacted[compacted.length - 1] === "") {
      continue;
    }
    compacted.push(line);
  }

  return compacted.join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * @param {string} value
 * @param {number} maxChars
 * @returns {string}
 */
function clipText(value, maxChars) {
  if (value.length <= maxChars) {
    return value;
  }
  const clipped = value.slice(0, Math.max(0, maxChars - 1)).trimEnd();
  return `${clipped}…`;
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
 * @param {string} prefix
 * @param {string} title
 * @returns {string}
 */
function buildExplicitTitle(prefix, title) {
  const cleanTitle = String(title || "").trim();
  const cleanPrefix = String(prefix || "").trim();
  if (!cleanPrefix) {
    return cleanTitle;
  }
  return `${cleanPrefix} ${cleanTitle}`.trim();
}
