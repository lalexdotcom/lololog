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
- A feat-branch is merged into `main` with `git merge --no-ff`, so the merge
  commit marks where the piece of work starts and ends in the history. This
  overrides `superpowers:finishing-a-development-branch`, whose plain
  `git merge` fast-forwards when it can.
- After the merge: update these Serena memories to match what shipped.
- Throwaway code (spikes, probes, one-off experiments) goes in `.scratchpad/`
  at the repo root, git-ignored, never in `src/`, `tests/` or `scripts/`.
- When the user says the session is running out of tokens: persist everything
  worth keeping (current task, state, decisions, next steps, open questions)
  in a throwaway `.scratchpad/handoff.md`, then give the user the command
  that resumes in a fresh session:
  `claude "Read .scratchpad/handoff.md, resume from it, then delete it"`.
  The next session deletes the handoff once read; anything durable belongs in
  these memories, not in the handoff.