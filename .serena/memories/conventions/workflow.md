# Workflow

- Branching, closing and pushing are ruled by AGENTS.md § Git, which wins
  over anything here; this memory only adds what AGENTS.md does not say.
- The branch is opened before the spec is committed; the spec is committed on
  that branch.
- Never work in a git worktree: it disrupts the tooling, Serena first (its
  project, index and memories are bound to the main checkout).
- Implementation runs in subagent mode by default
  (`superpowers:subagent-driven-development`); inline only on request.
- Once the user validates a plan, commit it and start executing it in
  subagent mode right away: no separate go is needed (user's standing
  instruction, 2026-09-29). Gates written into the plan itself still stop.
- The checks AGENTS.md wants green before closing are, here:
  `pnpm exec biome ci`, `pnpm typecheck`, `pnpm build`, `pnpm lint:package`,
  `pnpm test`, `pnpm test:consumers`.
- "Clôturer", said by the user, runs the closing sequence of AGENTS.md without
  a further go: commit what is pending, checks green, memories updated and
  committed on the branch, `git merge --no-ff` into `main`, branch deleted.
  It replaces the options menu of
  `superpowers:finishing-a-development-branch`, whose plain `git merge` would
  fast-forward and lose the merge commit that marks the piece of work.
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