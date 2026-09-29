# Workflow

- Every piece of work happens on a feat-branch, opened before its spec is
  committed; the spec is committed on that branch.
- Never work in a git worktree: it disrupts the tooling, Serena first (its
  project, index and memories are bound to the main checkout).
- Implementation runs in subagent mode by default
  (`superpowers:subagent-driven-development`); inline only on request.
- Once the user validates a plan, commit it and start executing it in
  subagent mode right away: no separate go is needed (user's standing
  instruction, 2026-09-29). Gates written into the plan itself still stop.
- Before delivering a branch: `pnpm exec biome ci`, `pnpm typecheck`,
  `pnpm build`, `pnpm lint:package`, `pnpm test`, `pnpm test:consumers` all
  green.
- A feat-branch is merged into `main` with `git merge --no-ff`, so the merge
  commit marks where the piece of work starts and ends in the history. This
  overrides `superpowers:finishing-a-development-branch`, whose plain
  `git merge` fast-forwards when it can.
- After the merge: update these Serena memories to match what shipped.
- During a dedicated documentation pass, do not commit each edit: wording and
  verbosity usually take several back-and-forths. Commit once the user
  validates the pass.
- Throwaway code (spikes, probes, one-off experiments) goes in `.scratchpad/`
  at the repo root, git-ignored, never in `src/`, `tests/` or `scripts/`.
- When the user says the session is running out of tokens: persist everything
  worth keeping (current task, state, decisions, next steps, open questions)
  in a throwaway `.scratchpad/handoff.md` whose first line reads
  "À supprimer après lecture." (the handoff itself carries the instruction,
  whatever the first message says), then give the user the exact first
  message to type in the fresh session, e.g.
  "Lis .scratchpad/handoff.md, reprends à partir de là, puis supprime-le."
  The next session deletes the handoff once read; anything durable belongs in
  these memories, not in the handoff.