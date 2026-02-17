import { test } from "vitest";
import assert from "node:assert/strict";
import { htmlToRedditMarkdown, renderEntryForReddit, resolvePostKind } from "../src/core/post-render.mjs";

test("htmlToRedditMarkdown converts common tags to markdown", () => {
  const html = `
    <![CDATA[
      <p>Hello <strong>world</strong>.</p>
      <p>See <a href="https://example.com/x">details</a><br/>next line.</p>
      <ul><li>One</li><li>Two</li></ul>
    ]]>
  `;

  const md = htmlToRedditMarkdown(html);
  assert.match(md, /Hello \*\*world\*\*\./);
  assert.match(md, /\[details\]\(https:\/\/example.com\/x\)/);
  assert.match(md, /- One/);
  assert.match(md, /- Two/);
});

test("renderEntryForReddit builds explicit title and body", () => {
  const rendered = renderEntryForReddit(
    {
      title: "Patch Notes",
      url: "https://example.com/notes",
      descriptionHtml: "<p>Changes are available.</p>",
    },
    {
      postKind: "self",
      titlePrefix: "[DevFeed] ",
      maxBodyChars: 1000,
    }
  );

  assert.equal(rendered.title, "[DevFeed] Patch Notes");
  assert.equal(rendered.postKind, "self");
  assert.match(rendered.bodyText, /\[Original link\]\(https:\/\/example.com\/notes\)/);
  assert.match(rendered.bodyText, /Changes are available\./);
});

test("resolvePostKind defaults unsupported values to self", () => {
  assert.equal(resolvePostKind("link"), "link");
  assert.equal(resolvePostKind("self"), "self");
  assert.equal(resolvePostKind("weird"), "self");
});
