# Workflow

- Every piece of work happens on a feat-branch, opened before its spec is
  committed; the spec is committed on that branch.
- Never work in a git worktree: it disrupts the tooling, Serena first (its
  project, index and memories are bound to the main checkout).
- Implementation runs in subagent mode by default
  (`superpowers:subagent-driven-development`); inline only on request.
- Before delivering a branch: `pnpm exec biome ci`, `pnpm typecheck`,
  `pnpm build`, `pnpm lint:package`, `pnpm test`, `pnpm test:consumers` all
  green.
- After the merge: update these Serena memories to match what shipped.