#!/usr/bin/env zsh
set -euo pipefail

VAULT="/Users/peterg17/Documents/notes"
cd "$VAULT"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

mkdir -p .pi/logs .pi/backups

if [[ ! -f Index.md ]]; then
  echo "$(date -Is) Index.md not found; exiting."
  exit 0
fi

HAS_INBOX_CONTENT=$(python3 - <<'PY'
from pathlib import Path
text = Path('Index.md').read_text(errors='ignore')
marker = '## Inbox'
if marker not in text:
    print('yes' if text.strip() else 'no')
else:
    rest = text.split(marker, 1)[1]
    # Ignore an empty Needs review heading if present, but count any actual bullets/text.
    lines = []
    for line in rest.splitlines():
        s = line.strip()
        if not s or s in {'## Needs review'}:
            continue
        lines.append(s)
    print('yes' if lines else 'no')
PY
)

if [[ "$HAS_INBOX_CONTENT" != "yes" ]]; then
  echo "$(date -Is) Index.md inbox is empty; exiting."
  exit 0
fi

STAMP=$(date +%Y%m%d-%H%M%S)
cp Index.md ".pi/backups/Index.$STAMP.md"

echo "$(date -Is) Processing Index.md with pi..."

pi -p --skill ".pi/skills/obsidian-inbox-cleanup" \
  "Use /skill:obsidian-inbox-cleanup. Process Index.md now. File captured links/notes into the vault, update MOCs, preserve uncertain items under Needs review, and verify unresolved links. Be concise."

echo "$(date -Is) Done."
