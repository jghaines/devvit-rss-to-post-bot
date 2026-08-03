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

## Fetch domains

The `http.domains` allowlist in `devvit.json` is the source of truth for which hostnames
the app may fetch. Whenever you add, remove, or change an entry there, update the
`Fetch Domains` list in `README.md` to match in the same change.
