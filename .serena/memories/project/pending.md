# Pending before delivery

- Branch `feat/limit`: commit `chore(debug): TEMP print each limit key when it
  is first counted` adds `LOLOLOG_DEBUG_KEYS` (a `console.log` in
  `RootLoggerImpl.admit`, and its env read at the top of
  `scripts/playground/demo.ts`). The user asked for it to be thrown away when
  the branch is delivered: remove it with a follow-up commit (not a history
  rewrite), check `grep -rn LOLOLOG_DEBUG_KEYS src scripts tests` is empty,
  then delete this memory.
