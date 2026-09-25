#!/usr/bin/env bash
# postCreateCommand: project setup. Agent tooling goes in on-create.sh.
set -euo pipefail

# remoteEnv does not reach lifecycle scripts (see devcontainer.json).
export PATH="$HOME/.local/bin:$PATH"

# There is no top-level `serena index` and no `--project-root` flag. When it
# creates .serena/project.yml, `project index` asks about each extra language it
# detects, with no non-interactive flag, and fails on a closed stdin with an
# empty error: the n's decline (the default). printf, not yes: yes dies of
# SIGPIPE, which pipefail turns into a failure.
printf 'n\n%.0s' {1..100} | serena project index "$PWD"

# package.json ships a placeholder name; the first build replaces it with the
# folder name, so tools reading it see the project, not the template. A real
# name stays, and so does the template's own placeholder.
case "$(git remote get-url origin 2>/dev/null || true)" in
	*[/:]lalexdotcom/claude-scaffold | *[/:]lalexdotcom/claude-scaffold.git) ;;
	*)
		if [ "$(npm pkg get name)" = '"<project_name>"' ]; then
			npm pkg set "name=$(basename "$PWD" | tr '[:upper:]' '[:lower:]')"
		fi
		;;
esac

# pnpm follows the `packageManager` pin by itself. Seed it only when missing;
# once set, `pnpm self-update` moves it.
if [ "$(npm pkg get packageManager)" = "{}" ]; then
	npm pkg set "packageManager=pnpm@$(pnpm --version)"
fi

pnpm install

# Chromium only: all three browsers cost ~200 MB per rebuild. `pnpm exec`, not
# `dlx`: dlx fetches the latest Playwright, whose browsers the pinned one cannot
# launch.
pnpm exec playwright install --with-deps chromium

# --auto-mine fills the palace (--yes alone still prompts, and a closed stdin
# declines); re-runs skip files already mined. --no-llm: no Ollama here.
mempalace init --yes --auto-mine --no-llm "$PWD"

