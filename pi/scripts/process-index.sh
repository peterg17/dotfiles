#!/usr/bin/env zsh
set -euo pipefail

VAULT="/Users/peterg17/Documents/notes"
PI_TIMEOUT_SECONDS=${PI_TIMEOUT_SECONDS:-600}
PI_PID=""
WATCHDOG_PID=""

cd "$VAULT"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export PI_OFFLINE=1

log() {
  # macOS /bin/date does not support GNU `date -Is`.
  printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*"
}

cleanup_child() {
  if [[ -n "${WATCHDOG_PID:-}" ]] && kill -0 "$WATCHDOG_PID" 2>/dev/null; then
    kill "$WATCHDOG_PID" 2>/dev/null || true
  fi
  if [[ -n "${PI_PID:-}" ]] && kill -0 "$PI_PID" 2>/dev/null; then
    log "Stopping lingering pi process $PI_PID..."
    kill -TERM "$PI_PID" 2>/dev/null || true
    sleep 2
    kill -KILL "$PI_PID" 2>/dev/null || true
  fi
}
trap cleanup_child EXIT INT TERM

mkdir -p .pi/logs .pi/backups

if [[ ! -f Index.md ]]; then
  log "Index.md not found; exiting."
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
  log "Index.md inbox is empty; exiting."
  exit 0
fi

STAMP=$(date +%Y%m%d-%H%M%S)
cp Index.md ".pi/backups/Index.$STAMP.md"

log "Processing Index.md with pi..."

pi -p --no-session --skill ".pi/skills/obsidian-inbox-cleanup" \
  "Use /skill:obsidian-inbox-cleanup. Process Index.md now. File captured links/notes into the vault, update MOCs, preserve uncertain items under Needs review, and verify unresolved links. Be concise." &
PI_PID=$!

(
  sleep "$PI_TIMEOUT_SECONDS"
  if kill -0 "$PI_PID" 2>/dev/null; then
    log "pi process $PI_PID exceeded ${PI_TIMEOUT_SECONDS}s timeout."
    kill -TERM "$PI_PID" 2>/dev/null || true
    sleep 2
    kill -KILL "$PI_PID" 2>/dev/null || true
  fi
) &
WATCHDOG_PID=$!

set +e
wait "$PI_PID"
PI_STATUS=$?
set -e

if [[ -n "${WATCHDOG_PID:-}" ]] && kill -0 "$WATCHDOG_PID" 2>/dev/null; then
  kill "$WATCHDOG_PID" 2>/dev/null || true
fi
WATCHDOG_PID=""
PI_PID=""

if (( PI_STATUS != 0 )); then
  log "pi exited with status $PI_STATUS."
  exit "$PI_STATUS"
fi

log "Done."
