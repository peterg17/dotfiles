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

# Symlink portable skills into ~/.claude/skills/. Per-skill (not whole dir) so
# host-installed skills (e.g. plugin-shipped) are left alone.
mkdir -p "$HOME/.claude/skills"
for skill_dir in "$DOTFILES_DIR/claude/skills"/*/; do
  [ -d "$skill_dir" ] || continue
  skill_name=$(basename "$skill_dir")
  ln -sfn "$skill_dir" "$HOME/.claude/skills/$skill_name"
  echo "Linked skill: $skill_name"
done
