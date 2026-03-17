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
- In `POST_KIND=self`, Reddit only receives title + URL (preview still shows converted body text)
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

## Manual publish process

Do the actual Devvit publish from a developer machine using the exact commit you want to release.

Optional: keep helper branches such as `env/playtest` and `env/prod` if you want named refs for coordination, but they are not required for the publish itself.

Recommended flow:

1. Confirm you can run the current Devvit CLI:

```bash
npx devvit@latest --version
```

1. Check out the exact commit you want to publish:

```bash
git checkout <commit-ish>
```

1. Install dependencies and run tests:

```bash
npm ci
npm test
```

1. Authenticate with Devvit CLI:

```bash
npx devvit login
```

1. For playtest work:

```bash
npm run devvit:playtest
```

This starts a playtest session and Devvit creates pre-release versions with a fourth segment such as `0.0.1.6`.

1. For an installable production release:

```bash
npm run release:prod
```

This runs the test suite, executes `devvit upload`, parses the uploaded version from CLI output, creates `devvit/prod/v<version>`, and pushes that tag to `origin`.

If you need to pass extra flags through to `devvit upload`, append them after `--`:

```bash
npm run release:prod -- --bump patch
```

If the upload succeeds but the helper cannot determine the version, it stops before tagging so you can tag the release manually using the version printed by Devvit CLI.

Manual fallback if needed:

```bash
git tag -a "devvit/prod/v<version>" -m "Devvit prod deployment <version>"
git push origin "refs/tags/devvit/prod/v<version>"
```

Playtest stays manual:

```bash
npm run devvit:playtest
```

Playtest versions are usually too noisy to tag automatically. If you explicitly want to preserve a particular pre-release, tag it manually after the playtest run.

## Why we are not automating Devvit publish in GitHub Actions

As of 2026-03-16, Devvit documentation still describes authentication as an interactive `npx devvit login` flow that writes credentials to `~/.devvit/token`.

We are not using GitHub-hosted Actions for unattended Devvit publish because:

- Devvit does not document a service-account, API-key, or OIDC-style publish credential for CI.
- The CLI token is a user session artifact, not a documented machine credential.
- Devvit says CLI tokens are auto-refreshed, but GitHub-hosted runners are ephemeral, so refreshed state is not durable across jobs.
- In practice this means a copied token may work temporarily, but it is not a reliable long-lived credential model for unattended publishing.

Until Devvit documents a proper non-interactive publish credential, treat Devvit publish as a manual step on a logged-in developer machine or on a persistent self-hosted runner that you control.

Before upload, verify `devvit-rss-to-post-bot/devvit.json`:

- `name` is globally unique and at most 16 characters
- `permissions.http.domains` includes your RSS host (exact hostname, no protocol)

Set runtime values after install/playtest in app installation settings:

- `feedUrl`
- `targetSubreddit`
- `pollMinutes` (set `60` for hourly)
- `maxPostsPerRun` (set `1` for safer initial rollout)

## Posting from RSS feed to a subreddit (developer)

Use this when you want to post feed entries into a real subreddit (`r/<name>`) rather than a user profile (`u_<name>`).

### Option A: local CLI (single run)

1. Authenticate once with Devvit CLI:

```bash
npx devvit login
```

1. Preview exactly what will be posted:

```bash
POST_KIND=self \
FEED_URL=https://feeds.simplecast.com/your-feed-id \
TARGET_SUBREDDIT=YourSubreddit \
MAX_POSTS_PER_RUN=1 \
STATE_FILE=.tmp/subreddit-preview-state.json \
npm run local:preview
```

1. Submit one live post to the subreddit:

```bash
POST_KIND=self \
FEED_URL=https://feeds.simplecast.com/your-feed-id \
TARGET_SUBREDDIT=YourSubreddit \
MAX_POSTS_PER_RUN=1 \
STATE_FILE=.tmp/subreddit-live-state.json \
npm run local:live
```

Notes:

- Use `TARGET_SUBREDDIT=YourSubreddit` (no `r/` prefix).
- Keep a dedicated `STATE_FILE` per feed/subreddit pair so checkpoints do not collide.
- Start with `MAX_POSTS_PER_RUN=1` to avoid accidental backfill bursts.

### Option B: deployed Devvit app (scheduled posting)

1. Ensure the feed hostname is listed in `devvit.json` under `permissions.http.domains`.
1. Upload/install the app and open installation settings.
1. Set:
   - `feedUrl=https://...`
   - `targetSubreddit=YourSubreddit`
   - `postKind=link` or `self`
   - `pollMinutes=60` (or your preferred interval)
   - `maxPostsPerRun=1` for initial rollout
1. Save settings and wait for scheduled execution.
1. Verify posts in the target subreddit and review logs for failures.

If the feed hostname is not in `permissions.http.domains`, fetch will fail with a domain exception until the app is updated.

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
