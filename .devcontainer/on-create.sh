#!/usr/bin/env bash
# onCreateCommand: agent tooling. Project setup goes in post-create.sh.
set -euo pipefail

sudo chown -R node:node /ai-tools

# remoteEnv does not reach lifecycle scripts (see devcontainer.json).
export PATH="$HOME/.local/bin:$PATH"

uv tool install -p 3.13 "serena-agent==1.7.0"
uv tool install mempalace

# The hooks call serena-hooks by name through remoteEnv's PATH: if uv installs
# elsewhere, they silently no-op. Checked by path, since `command -v` sees the
# export above.
[ -x "$HOME/.local/bin/serena-hooks" ] || {
	echo "serena-hooks is not in ~/.local/bin; check the PATH entry in devcontainer.json" >&2
	exit 1
}

claude plugin marketplace add anthropics/claude-plugins-official
claude plugin install superpowers@claude-plugins-official --scope user

claude plugin marketplace add MemPalace/mempalace
claude plugin install mempalace@mempalace --scope user

claude mcp remove serena --scope user 2>/dev/null || true
claude mcp add serena --scope user -- serena start-mcp-server --context=claude-code --project-from-cwd

# Created before post-create's `serena project index` or the MCP server does:
# either would generate it from the only code present, the shell scripts, and
# start bash alone. typescript because helper scripts are TypeScript (scripts/).
if [ ! -e .serena/project.yml ]; then
	serena project create --language typescript --language bash "$PWD"
fi

# chromadb caches its 79 MB ONNX model in ~/.cache/chroma, hardcoded and off the
# persisted volume. The home is fresh at on-create: nothing to migrate.
mkdir -p /ai-tools/.cache/chroma "$HOME/.cache"
ln -sfn /ai-tools/.cache/chroma "$HOME/.cache/chroma"
