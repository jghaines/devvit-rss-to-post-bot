/**
 * @typedef {Object} ParsedFeedEntry
 * @property {string | undefined} id
 * @property {string} title
 * @property {string} url
 * @property {string | undefined} publishedAt
 */

/**
 * Parse RSS 2.0 or Atom XML into a normalized entry list.
 *
 * @param {string} xml
 * @returns {ParsedFeedEntry[]}
 */
export function parseFeedXml(xml) {
  const source = String(xml || "");
  if (!source.trim()) {
    return [];
  }

  const atomEntries = parseAtomEntries(source);
  if (atomEntries.length > 0) {
    return atomEntries;
  }

  return parseRssItems(source);
}

/**
 * @param {string} xml
 * @returns {ParsedFeedEntry[]}
 */
function parseRssItems(xml) {
  const blocks = matchBlocks(xml, "item");
  /** @type {ParsedFeedEntry[]} */
  const entries = [];

  for (const block of blocks) {
    const title = cleanup(readTagText(block, "title"));
    const guid = cleanup(readTagText(block, "guid"));
    const link = cleanup(readTagText(block, "link"));
    const pubDate = cleanup(readTagText(block, "pubDate"));
    const dcDate = cleanup(readTagText(block, "dc:date"));
    const publishedAt = pubDate || dcDate || undefined;

    if (!title || !link) {
      continue;
    }

    entries.push({
      id: guid || undefined,
      title,
      url: link,
      publishedAt,
    });
  }

  return entries;
}

/**
 * @param {string} xml
 * @returns {ParsedFeedEntry[]}
 */
function parseAtomEntries(xml) {
  const blocks = matchBlocks(xml, "entry");
  /** @type {ParsedFeedEntry[]} */
  const entries = [];

  for (const block of blocks) {
    const title = cleanup(readTagText(block, "title"));
    const id = cleanup(readTagText(block, "id"));
    const updated = cleanup(readTagText(block, "updated"));
    const published = cleanup(readTagText(block, "published"));
    const publishedAt = updated || published || undefined;
    const link = findAtomLink(block);

    if (!title || !link) {
      continue;
    }

    entries.push({
      id: id || undefined,
      title,
      url: cleanup(link),
      publishedAt,
    });
  }

  return entries;
}

/**
 * @param {string} block
 * @returns {string}
 */
function findAtomLink(block) {
  const linkTags = [...block.matchAll(/<link\b([^>]*)\/?>/gi)];
  for (const match of linkTags) {
    const attrs = String(match[1] || "");
    const href = readAttribute(attrs, "href");
    const rel = readAttribute(attrs, "rel");
    if (!href) {
      continue;
    }
    if (!rel || rel === "alternate") {
      return href;
    }
  }
  return "";
}

/**
 * @param {string} attrs
 * @param {string} name
 * @returns {string}
 */
function readAttribute(attrs, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const match = attrs.match(pattern);
  if (!match) {
    return "";
  }
  return match[1] || match[2] || "";
}

/**
 * @param {string} xml
 * @param {string} tag
 * @returns {string[]}
 */
function matchBlocks(xml, tag) {
  const pattern = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "gi");
  return [...xml.matchAll(pattern)].map((match) => match[0]);
}

/**
 * @param {string} block
 * @param {string} tag
 * @returns {string}
 */
function readTagText(block, tag) {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, "i");
  const match = block.match(pattern);
  return match ? match[1] : "";
}

/**
 * @param {string} value
 * @returns {string}
 */
function cleanup(value) {
  return decodeXmlEntities(stripCdata(stripTags(String(value || "")))).trim();
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
