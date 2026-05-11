# obsidian-tickets Pi extension

Dataview-first Obsidian ticket dashboard support for Pi agentic work.

## What it manages

- `obsidian_ticket_create` creates Markdown ticket notes.
- `obsidian_ticket_update` updates ticket status, PR metadata, work log, status tags, and dashboard.
- `obsidian_ticket_rebuild` backfills legacy ticket frontmatter and regenerates the dashboard.
- `/ticket-create`, `/tickets`, and `/tickets-rebuild` provide interactive equivalents.

Ticket note frontmatter is the source of truth. Generated tickets include Dataview-friendly fields:

```yaml
type: ticket
status: todo
priority: medium
project: Example Project
created: 2026-01-01
updated: 2026-01-01
repo: ""
branch: feature/example-ticket
pr: ""
tags:
  - status/todo
  - project/active
```

## Configuration

The extension has portable defaults and can be configured with environment variables before launching `pi`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `OBSIDIAN_TICKETS_VAULT` | `~/Documents/notes` | Obsidian vault root. |
| `OBSIDIAN_VAULT_ROOT` | unset | Fallback vault root if `OBSIDIAN_TICKETS_VAULT` is unset. |
| `OBSIDIAN_TICKETS_DIR` | `01 Projects/Tickets` | Vault-relative ticket folder for new tickets. |
| `OBSIDIAN_TICKETS_SCAN_DIRS` | same as `OBSIDIAN_TICKETS_DIR` | Comma-separated vault-relative folders to scan for `type: ticket` notes. |
| `OBSIDIAN_TICKETS_DASHBOARD` | `00 Maps/Agentic Tasks.md` | Vault-relative dashboard path. |

## Dataview setup

1. Install and enable the Obsidian Dataview community plugin.
2. Keep ticket notes under the configured scan folder(s).
3. Run `/tickets-rebuild` or ask Pi to call `obsidian_ticket_rebuild` after installing the extension.
4. Open `00 Maps/Agentic Tasks.md` (or your configured dashboard path).

The generated dashboard includes:

- Board by Status
- Backlog by Priority
- Grouped by Project/Epic
- Recently Updated Tickets
- Plain Markdown fallback for environments without Dataview

## Migration/backfill

Run a dry run first:

```text
/tickets-rebuild --dry-run
```

Then rebuild for real:

```text
/tickets-rebuild
```

The migration path treats Markdown files under the configured ticket scan folder(s) as ticket candidates unless they have an explicit non-ticket `type`. It adds missing `type: ticket`, `created`, `updated`, `priority`, and `project` fields, normalizes status/priority values, refreshes `status/<status>` tags, preserves unrelated frontmatter where possible, and regenerates the dashboard.

## Kanban

Kanban plugin sync is intentionally deferred. Use the Dataview board as the canonical generated view for now.
