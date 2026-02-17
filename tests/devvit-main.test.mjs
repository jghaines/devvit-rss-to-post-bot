import { makeAPIClients } from "@devvit/public-api/apis/makeAPIClients.js";
import { createDevvitTest } from "@devvit/test/server/vitest";
import { expect, vi } from "vitest";
import App, { buildPollingCron } from "../src/main.js";
import { hashText } from "../src/core/bot-core.mjs";

const JOB_NAME = "poll-rss-feed";
const FEED_URL = "https://example.com/feed.xml";
const TARGET_SUBREDDIT = "ExampleSubreddit";
const TITLE_PREFIX = "[Feed]";

const RSS_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <item>
      <title>Item One</title>
      <link>https://example.com/item-one</link>
      <guid>item-1</guid>
      <pubDate>Tue, 17 Feb 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[
        <p>Hello <strong>world</strong>.</p>
        <p>Read <a href="https://example.com/item-one">more</a>.</p>
      ]]></description>
    </item>
  </channel>
</rss>`;

const test = createDevvitTest({
  settings: {
    feedUrl: FEED_URL,
    targetSubreddit: TARGET_SUBREDDIT,
    pollMinutes: 15,
    maxPostsPerRun: 1,
    maxDedupeTrack: 50,
    postKind: "self",
    titlePrefix: TITLE_PREFIX,
    maxBodyChars: 12000,
  },
});

test("buildPollingCron maps 60 minutes to top-of-hour cron", () => {
  expect(buildPollingCron(15)).toBe("*/15 * * * *");
  expect(buildPollingCron(60)).toBe("0 * * * *");
});

test("poll-rss-feed posts once and is idempotent on rerun", async ({ config, mocks }) => {
  const configWithKvStore = {
    ...config,
    use(definition) {
      if (definition.fullName === "devvit.plugin.kvstore.KVStore") {
        return {};
      }
      return config.use(definition);
    },
    uses(definition) {
      if (definition.fullName === "devvit.plugin.kvstore.KVStore") {
        return true;
      }
      return config.uses(definition);
    },
  };

  // Initialize plugin handlers against the @devvit/test mock config.
  // eslint-disable-next-line no-new
  new App(configWithKvStore);

  const onRun = App.scheduledJobHandlers?.get(JOB_NAME);
  expect(onRun).toBeTypeOf("function");

  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(RSS_XML, {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      })
  );

  const submitSpy = vi.spyOn(mocks.reddit.linksAndComments.plugin, "Submit");

  const apiClients = makeAPIClients({ metadata: undefined });
  const context = {
    settings: apiClients.settings,
    redis: apiClients.redis,
    reddit: apiClients.reddit,
    // Compatibility shim for code paths using context.http.fetch.
    http: {
      fetch: (...args) => globalThis.fetch(...args),
    },
  };

  await onRun({ name: JOB_NAME, data: {} }, context);

  expect(submitSpy).toHaveBeenCalledTimes(1);

  const submitRequest = submitSpy.mock.calls[0][0];
  expect(submitRequest.kind).toBe("self");
  expect(submitRequest.sr).toBe(TARGET_SUBREDDIT);
  expect(submitRequest.title).toBe("[Feed] Item One");
  expect(submitRequest.text).toContain("[Original link](https://example.com/item-one)");
  expect(submitRequest.text).toContain("Hello **world**.");

  const stateKey = `rss:state:${TARGET_SUBREDDIT}:${hashText(FEED_URL).slice(0, 16)}`;
  const stateRaw = await context.redis.get(stateKey);
  expect(stateRaw).toBeTruthy();
  const state = JSON.parse(stateRaw);
  expect(state?.checkpoint?.fingerprint).toBe("item-1");

  await onRun({ name: JOB_NAME, data: {} }, context);
  expect(submitSpy).toHaveBeenCalledTimes(1);
});
