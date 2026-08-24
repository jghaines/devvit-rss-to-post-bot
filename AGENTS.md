# Agent Instructions

## Testing

Run tests with `npm test` (uses vitest). All tests must pass before committing.

## Deployment workflow

This app is owned and deployed by the Reddit account `hardforkbot`. Devvit CLI auth
(`npx devvit login`) for playtest, upload, and publish must be logged in as `hardforkbot`
(the CLI should print `Logged in as hardforkbot`).

Always test and commit before publishing (`devvit publish`).
Publishing requires a clean git state (no uncommitted or untracked changes).

1. Run `npm test` and ensure all tests pass
2. Commit changes
3. Verify clean git state (`git status` shows nothing to commit)
4. Then publish

Prefer `npm run release:prod` for production releases. It runs `npm test`, then
`scripts/devvit-publish-and-tag.mjs`, which enforces a clean worktree, publishes
with `--public` (App Directory listing request; pass `--no-public` to cut an
unlisted release), and creates + pushes a `devvit/prod/v<version>` git tag.

**`devvit upload` and `devvit publish` are NOT dry-runs.** The 0.13.x CLI runs
straight through build → version-bump → upload/publish with no confirmation prompt,
and each invocation auto-increments the app's build number. Never run either "just to
validate" the config — there is no local-only validation via these commands.

## Server imports

Import `reddit`, `redis`, `scheduler`, and `settings` from their individual
`@devvit/*` packages (declared as direct dependencies in `package.json`), not from the
`@devvit/web/server` barrel. Importing through the barrel makes bundlers resolve
`@devvit/redis` transitively, which fails with `Could not resolve "@devvit/redis"`.

## Fetch domains

The `http.domains` allowlist in `devvit.json` is the source of truth for which hostnames
the app may fetch. Whenever you add, remove, or change an entry there, update the
`Fetch Domains` list in `README.md` to match in the same change.
