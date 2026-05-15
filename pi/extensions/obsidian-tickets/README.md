# obsidian-tickets Pi extension

Dataview-first Obsidian ticket dashboard support for Pi agentic work.

## What it manages

- `obsidian_ticket_create` creates Markdown ticket notes.
- `obsidian_ticket_update` updates ticket status, PR metadata, work log, status tags, and dashboard.
- `obsidian_ticket_rebuild` backfills legacy ticket frontmatter and regenerates the Dataview dashboard; it also regenerates the Kanban board when `OBSIDIAN_TICKETS_KANBAN` is explicitly set.
- `obsidian_ticket_kanban_rebuild` regenerates only the mobile-friendly Kanban board.
- `/ticket-create`, `/tickets`, `/tickets-rebuild`, and `/tickets-kanban-rebuild` provide interactive equivalents.

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
| `OBSIDIAN_TICKETS_DASHBOARD` | `00 Maps/Agentic Tasks.md` | Vault-relative Dataview dashboard path. |
| `OBSIDIAN_TICKETS_KANBAN` | `00 Maps/Agentic Tasks Kanban.md` | Vault-relative generated Obsidian Kanban board path. Set this to force automatic Kanban refresh during ticket create/update/rebuild; otherwise auto-refresh starts after the board file exists. |
| `OBSIDIAN_TICKETS_KANBAN_DONE_LIMIT` | `20` | Number of recently updated done/archived cards to show for mobile readability. |

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

Use the Kanban-only command/tool below once to create the board. After the board file exists, ticket create/update/rebuild refreshes it automatically. You can also set `OBSIDIAN_TICKETS_KANBAN` before launching Pi to force automatic Kanban refresh even before the board exists.

## Kanban

Install and enable the Obsidian Kanban community plugin, then open `00 Maps/Agentic Tasks Kanban.md` or your configured `OBSIDIAN_TICKETS_KANBAN` path.

The Kanban board is generated from ticket frontmatter and is optimized for mobile readability:

- Columns are generated from ticket statuses and use readable headings.
- Cards use compact ticket wikilinks with priority, project, updated date, and PR metadata on a secondary line.
- Done/archived columns are limited by `OBSIDIAN_TICKETS_KANBAN_DONE_LIMIT`.

Ticket notes remain the source of truth. Manual Kanban card moves are overwritten on the next rebuild.

Rebuild on demand:

```text
/tickets-kanban-rebuild
```

Or ask Pi to call `obsidian_ticket_kanban_rebuild`.
