# devvit-rss-to-post-bot

Devvit bot that polls an RSS/Atom feed and submits new entries as Reddit link posts.

It tracks the "last post" checkpoint plus a dedupe window so feed reorder/edit noise does not repost old items.

## Project layout

- `src/main.js`: Devvit app entrypoint (scheduler + Reddit submit + Redis-backed state)
- `src/core/bot-core.mjs`: pure posting/checkpoint logic (unit tested)
- `src/core/rss-parse.mjs`: RSS/Atom parser
- `scripts/local-poll.mjs`: local CLI harness for dry-run or live submission
- `tests/*.test.mjs`: local tests

## Local setup

1. Copy env template:

```bash
cp .env.example .env
```

2. Edit `.env`:
- Set `FEED_URL`
- Set `TARGET_SUBREDDIT`
- Keep `DRY_RUN=true` for initial validation

3. Run local tests:

```bash
npm test
```

4. Run local CLI dry-run:

```bash
npm run local:test
```

5. Run with deterministic test env:

```bash
npm run local:test:env
```

## .env credential injection

For local live submit testing (`npm run local:live`), set:

- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_REFRESH_TOKEN`
- `REDDIT_USER_AGENT`

The harness exchanges the refresh token for an access token and submits link posts through Reddit OAuth API.

## Devvit CLI testing

If Devvit CLI is not installed:

```bash
npm install
npx devvit login
```

Then run:

```bash
npm run devvit:playtest
```

and upload with:

```bash
npm run devvit:upload
```

## Notes

- Local state is saved to `STATE_FILE` (default `.local-state.json`).
- On each successful post, checkpoint state is updated immediately for crash safety.
