# RSS Post Bot

RSS Post Bot polls one RSS/Atom feed on a schedule and publishes new entries to Reddit.

It keeps a checkpoint and dedupe history so feed reorder/edits do not repost old content.

## What moderators can use it for

- Auto-post your podcast/news/blog feed into a subreddit.
- Post as link posts or self posts.
- Control cadence and safety limits per installation.

## Setup (moderators)

1. Install the app.
1. Open installation settings.
1. Configure:
   - `feedUrl`: RSS/Atom URL to poll.
   - `targetSubreddit`: destination subreddit (or `u_<username>` for profile posts).
   - `pollMinutes`: polling interval in minutes (`60` = hourly).
   - `maxPostsPerRun`: max entries posted in one run (`1` recommended to start).
   - `maxDedupeTrack`: number of recent fingerprints remembered to avoid duplicates.
   - `postKind`: `self` or `link`.
   - `titlePrefix`: text prefixed to each post title.
   - `maxBodyChars`: max self-post body length before clipping.
1. Save settings and wait for the first scheduled run.

## Posting behavior

- First run posts only the newest entries up to `maxPostsPerRun` (not full backfill).
- Checkpoint state is updated after each successful post for crash safety.
- Titles are explicit and clipped to Reddit-safe limits.
- Body text is derived from feed content and converted from HTML to Reddit markdown.

## Domain exceptions limitation (important)

Devvit fetch permissions are restricted to exact, pre-approved hostnames per app release.
Moderators cannot override this from subreddit settings.

If your `feedUrl` hostname is not in the list below, polling will fail until the app is updated.

When you hit a domain exception:

1. Check the hostname in your `feedUrl` (example: `feeds.example.com`).
1. Compare it to the `Fetch Domains` list in this README.
1. If it is missing, contact the maintainer with:
   - the requested hostname
   - a sample feed URL
1. After the maintainer ships an update that includes that hostname, reinstall/upgrade the app and re-save settings.

## Fetch Domains

This app currently fetches from:

- `feeds.acast.com`
- `feeds.megaphone.fm`
- `feeds.npr.org`
- `feeds.simplecast.com`
- `mondoweiss.net`
- `rss.buzzsprout.com`
- `thecleanpaper.com`
- `www.omnycontent.com`
- `www.relay.fm`
- `www.swr.de`
- `www.theguardian.com`

This list is generated from the `permissions.http.domains` array in [`devvit.json`](./devvit.json) by `npm run sync:readme`. Do not edit it by hand; `npm test` fails if the two drift apart.

## Developer documentation

The previous technical/developer README has moved to [DEVELOPER.md](./DEVELOPER.md).

## Support

- Repo and issues: [github.com/jghaines/devvit-rss-to-post-bot](https://github.com/jghaines/devvit-rss-to-post-bot)
