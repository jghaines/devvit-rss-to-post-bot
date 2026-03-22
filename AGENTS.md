# Agent Instructions

## Testing

Run tests with `npm test` (uses vitest). All tests must pass before committing.

## Deployment workflow

Always test and commit before publishing (`devvit publish`).
Publishing requires a clean git state (no uncommitted or untracked changes).

1. Run `npm test` and ensure all tests pass
2. Commit changes
3. Verify clean git state (`git status` shows nothing to commit)
4. Then publish
