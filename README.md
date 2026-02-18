# devvit-rss-to-post-bot

[![CI](https://github.com/jghaines/devvit-rss-to-post-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/jghaines/devvit-rss-to-post-bot/actions/workflows/ci.yml)

Devvit bot that polls an RSS/Atom feed and submits new entries to Reddit.

It tracks the "last post" checkpoint plus a dedupe window so feed reorder/edit noise does not repost old items.

## Project layout

- `src/main.js`: Devvit app entrypoint (scheduler + Reddit submit + Redis-backed state)
- `src/core/bot-core.mjs`: pure posting/checkpoint logic (unit tested)
- `src/core/rss-parse.mjs`: RSS/Atom parser
- `src/core/post-render.mjs`: title/body rendering and HTML->Reddit Markdown conversion
- `scripts/local-poll.mjs`: local CLI harness for dry-run or live submission
- `tests/*.test.mjs`: local tests

## Local setup

1. Install dependencies:

```bash
npm install
```

1. Copy env template:

```bash
cp .env.example .env
```

1. Edit `.env`:

- Set `FEED_URL`
- Set `TARGET_SUBREDDIT` (for profile posts, use `u_<your_username>`)
- Set `POST_KIND` (`self` or `link`)
- Set `TITLE_PREFIX` for explicit titles
- Keep `DRY_RUN=true` for initial validation

1. Run local tests:

```bash
npm test
```

1. Run local CLI dry-run:

```bash
npm run local:test
```

1. Run with deterministic test env:

```bash
npm run local:test:env
```

1. Preview exactly what would be posted (no submit):

```bash
npm run local:preview:env
```

or with your own file/URL:

```bash
npm run local:preview -- --feed ./fixtures/sample-rss.xml
npm run local:preview -- --feed https://example.com/feed.xml
```

For machine-readable output:

```bash
npm run local:preview -- --json
```

## Title and body behavior

- Title is always explicit: `TITLE_PREFIX + <rss item title>`
- Title is automatically clipped for Reddit-safe submission (300 chars by default)
- Body text comes from RSS `<description>` (or Atom `summary`/`content`)
- Description HTML is converted into Reddit-compatible Markdown
- In `POST_KIND=self`, body is submitted as post text (this is post format, not destination)
- In `POST_KIND=link`, Reddit only receives title + URL (preview still shows converted body text)
- Destination always comes from `TARGET_SUBREDDIT` (`MySubreddit` or `u_<your_username>`)

## .env credential injection

For local live submit testing (`npm run local:live`), authenticate with Devvit CLI:

```bash
npx devvit login
```

The local runner reads access credentials from `~/.devvit/token` (or `DEVVIT_TOKEN_FILE`).
Optional env vars:

- `DEVVIT_TOKEN_FILE` (default `~/.devvit/token`)
- `REDDIT_USER_AGENT` (optional override)

If the token file is missing or expired, `npm run local:live` exits with a clear auth error and a login hint.

## Devvit CLI testing

Prepare config from template:

```bash
cp devvit.json.example devvit.json
```

Install dependencies:

```bash
npm install
```

Authenticate with Reddit through Devvit CLI:

```bash
npx devvit login
```

The login flow opens a Reddit auth URL in your browser. After approval, you should see output like:

- `Your Devvit authentication token has been saved to /Users/<you>/.devvit/token`
- `Logged in as <your_reddit_username>`

Then run:

```bash
npm run devvit:playtest
```

and upload with:

```bash
npm run devvit:upload
```

Before upload, verify `devvit-rss-to-post-bot/devvit.json`:

- `name` is globally unique and at most 16 characters
- `permissions.http.domains` includes your RSS host (exact hostname, no protocol)

Set runtime values after install/playtest in app installation settings:

- `feedUrl`
- `targetSubreddit`
- `pollMinutes` (set `60` for hourly)
- `maxPostsPerRun` (set `1` for safer initial rollout)

## Local feed -> self-post test

Preview exactly what would be posted (no Reddit submit):

```bash
POST_KIND=self \
FEED_URL=./fixtures/6HKOhNgS.rss.xml \
TARGET_SUBREDDIT=u_yourusername \
STATE_FILE=.tmp/selfpost-test.json \
MAX_POSTS_PER_RUN=1 \
npm run local:preview
```

Submit a real self-post to Reddit (uses `~/.devvit/token` from Devvit CLI login):

```bash
POST_KIND=self \
FEED_URL=./fixtures/6HKOhNgS.rss.xml \
TARGET_SUBREDDIT=u_yourusername \
STATE_FILE=.tmp/selfpost-live-test.json \
MAX_POSTS_PER_RUN=1 \
npm run local:live
```

Recommended: use a dedicated test subreddit and a fresh `STATE_FILE` for each live test run.

## Notes

- Local state is saved to `STATE_FILE` (default `.local-state.json`).
- On first run (no checkpoint yet), the bot posts only the newest `MAX_POSTS_PER_RUN` entries, not the entire feed history.
- On each successful post, checkpoint state is updated immediately for crash safety.
- Use `MAX_BODY_CHARS` to clip long description bodies before submit.

## Fetch Domains

The app requests the following external HTTP fetch domain:

- `feeds.simplecast.com` - reads the configured RSS feed for polling and post generation.
