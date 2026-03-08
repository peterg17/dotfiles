#!/bin/bash
# Merges claude/settings-remote.json into ~/.claude/settings.json
# Safe to run multiple times — won't clobber existing settings.

DOTFILES_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_SETTINGS="$DOTFILES_DIR/claude/settings-remote.json"
TARGET="$HOME/.claude/settings.json"

mkdir -p "$HOME/.claude"

if [ ! -f "$TARGET" ]; then
  cp "$REMOTE_SETTINGS" "$TARGET"
  echo "Created $TARGET"
else
  merged=$(jq -s '.[0] * .[1]' "$TARGET" "$REMOTE_SETTINGS")
  echo "$merged" > "$TARGET"
  echo "Merged remote settings into $TARGET"
fi
