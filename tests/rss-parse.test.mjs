import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { parseFeedXml } from "../src/core/rss-parse.mjs";

test("parseFeedXml parses sample RSS fixture", () => {
  const fixturePath = path.resolve(process.cwd(), "fixtures/sample-rss.xml");
  const xml = fs.readFileSync(fixturePath, "utf8");
  const entries = parseFeedXml(xml);

  assert.equal(entries.length, 3);
  assert.equal(entries[0].id, "post-one");
  assert.equal(entries[0].title, "Post One");
  assert.equal(entries[0].url, "https://example.com/post-one");
  assert.match(entries[0].descriptionHtml || "", /<strong>update<\/strong>/);
});

test("parseFeedXml parses Atom links with href attributes", () => {
  const atom = `
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>alpha</id>
        <title>Alpha Title</title>
        <updated>2026-02-15T13:00:00Z</updated>
        <link rel="alternate" href="https://example.com/alpha" />
      </entry>
    </feed>
  `;

  const entries = parseFeedXml(atom);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "alpha");
  assert.equal(entries[0].title, "Alpha Title");
  assert.equal(entries[0].url, "https://example.com/alpha");
  assert.equal(entries[0].descriptionHtml, undefined);
});
