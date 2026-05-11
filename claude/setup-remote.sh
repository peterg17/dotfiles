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

# Symlink shared and Claude-only skills into ~/.claude/skills/. Per-skill
# (not whole dir) so host-installed skills (e.g. plugin-shipped) are left alone.
link_skill_dir() {
  local source_root="$1"
  local label="$2"
  [ -d "$source_root" ] || return 0
  for skill_dir in "$source_root"/*/; do
    [ -d "$skill_dir" ] || continue
    skill_name=$(basename "$skill_dir")
    ln -sfn "$skill_dir" "$HOME/.claude/skills/$skill_name"
    echo "Linked $label skill: $skill_name"
  done
}

mkdir -p "$HOME/.claude/skills"
link_skill_dir "$DOTFILES_DIR/agents/skills" "shared"
link_skill_dir "$DOTFILES_DIR/claude/skills" "Claude-only"
