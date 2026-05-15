#!/bin/zsh
set -euo pipefail

# Rebuild the generated Obsidian Kanban ticket board through Pi's
# obsidian-tickets extension command. This is deterministic: the slash command
# is handled by the extension and does not require an LLM turn.

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
export OBSIDIAN_TICKETS_VAULT="${OBSIDIAN_TICKETS_VAULT:-$HOME/Documents/notes}"
export OBSIDIAN_VAULT_ROOT="${OBSIDIAN_VAULT_ROOT:-$OBSIDIAN_TICKETS_VAULT}"

PI_BIN="${PI_BIN:-/opt/homebrew/bin/pi}"

mkdir -p "$OBSIDIAN_TICKETS_VAULT/.pi/logs"
cd "$OBSIDIAN_TICKETS_VAULT"

exec "$PI_BIN" -p "/tickets-kanban-rebuild"
