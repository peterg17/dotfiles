---
name: obsidian-ticket-rebuild
description: 'Use when the user asks you to refresh the generated Agentic Tasks dashboard or backfill missing frontmatter on Obsidian ticket notes. Regenerates `00 Maps/Agentic Tasks.md` from all `type: ticket` notes using the same template pi/extensions/obsidian-tickets writes, so pi and Claude produce identical dashboards. Trigger phrases: "rebuild the tickets dashboard", "refresh Agentic Tasks", "regenerate the ticket board", "backfill ticket frontmatter", "run tickets-rebuild from Claude".'
---

# Rebuild Obsidian Ticket Dashboard

Claude counterpart to pi's `obsidian_ticket_rebuild` tool. Scans the configured ticket folders, backfills missing/legacy frontmatter on `type: ticket` notes, and regenerates the `Agentic Tasks` dashboard at `$OBSIDIAN_TICKETS_DASHBOARD` (default `00 Maps/Agentic Tasks.md`). Also refreshes the Kanban board if it already exists or `$OBSIDIAN_TICKETS_KANBAN` is explicitly set.

Pi's `pi/extensions/obsidian-tickets/index.ts` is the canonical source for the templates and sort rules. Update both sides in lockstep if you change either.

## When to use

- User asks for the Agentic Tasks dashboard to be refreshed after creating/updating tickets from Claude.
- Several tickets were updated via `obsidian-ticket-update` and the dashboard is stale.
- A new project subfolder was added under `01 Projects/Tickets/` and needs to appear on the board.
- Legacy ticket notes need `type: ticket`, `created`, `updated`, `priority`, or `project` filled in.

**When not to use:**
- User just wants the Kanban refreshed — use `obsidian-ticket-kanban-rebuild` (faster, no migration step).
- User wants to *create* or *update* a single ticket — use `obsidian-ticket-create` / `obsidian-ticket-update`.

## Required tools

`Bash`, `Read`, `Write`, `Edit`. No deferred tool loading required.

## Step 1 — Resolve vault config

Same resolution as `obsidian-ticket-list`:

- vault root: `$OBSIDIAN_TICKETS_VAULT` → `$OBSIDIAN_VAULT_ROOT` → `~/Documents/notes`.
- dashboard path: `$OBSIDIAN_TICKETS_DASHBOARD` → `00 Maps/Agentic Tasks.md`.
- kanban path: `$OBSIDIAN_TICKETS_KANBAN` → `00 Maps/Agentic Tasks Kanban.md`.
- ticket dir: `$OBSIDIAN_TICKETS_DIR` → `01 Projects/Tickets`.
- scan dirs: `$OBSIDIAN_TICKETS_SCAN_DIRS` → `[ticket dir]`, plus `ticket-scan-dirs:` from the dashboard's frontmatter (if any), deduplicated.

If `--dry-run` is in the args, do everything except writing files; report what *would* change.

## Step 2 — Walk scan dirs and migrate ticket frontmatter

For every `*.md` in every scan dir (recursive):

1. Parse the frontmatter block (between the first pair of `---` markers).
2. Skip if `type` exists and is **not** `ticket`. Treat missing `type` as a ticket candidate (matches pi's `isTicketMigrationCandidate`).
3. Build the canonical `TicketMeta`:
   - **title**: first `# Heading` in body, else filename without `.md`.
   - **status**: normalize (default `todo`).
   - **priority**: normalize (default `medium`).
   - **project**: explicit `project:` from frontmatter, else derive from path. If the file lives under `<ticket dir>/<Project Name>/...`, use that subfolder as the project; else `Unassigned`.
   - **created**: existing `created:` if valid `YYYY-MM-DD`, else filesystem birthtime (`stat -f %SB -t %Y-%m-%d`), else today.
   - **updated**: existing `updated:` if valid, else filesystem mtime, else `created`. Do **not** bump on migration unless content actually changed.
   - **repo**, **branch**, **pr**: copy through (strings; empty string if absent).
   - **tags**: existing tags minus any old `status/*` entries, then prepend `status/<status>`. If no `project/*` tag exists, append `project/active`. Deduplicate while preserving order.

4. Rewrite the file with the canonical frontmatter in this key order:
   ```yaml
   ---
   type: ticket
   status: <status>
   priority: <priority>
   project: <project>
   created: <created>
   updated: <updated>
   repo: <repo>
   branch: <branch>
   pr: <pr>
   tags:
     - status/<status>
     - <other tags…>
   <preserved extra keys>
   ---
   ```
   Preserve every frontmatter key that isn't in pi's managed set (`type`, `status`, `priority`, `project`, `created`, `updated`, `repo`, `branch`, `pr`, `tags`) — append them at the bottom of the YAML block.
   Preserve the body unchanged.

5. Track which files actually changed (`migration.updated`) and which were inspected (`migration.checked`). Skip writes when content is byte-identical.

## Step 3 — List tickets (post-migration)

Re-read all scan dirs to gather the canonical ticket list. For each ticket capture: relative path, title, full meta.

Sort tickets by path (vault-relative, lexicographic) — matches pi.

## Step 4 — Render the dashboard

Write to `<vault>/<dashboard path>`. Build the content exactly as below (this matches pi's `renderTaskMoc`).

### Dashboard frontmatter

```yaml
---
type: dashboard
dashboard: agentic-tasks
updated: <today YYYY-MM-DD>
tags:
  - agentic/tasks
ticket-scan-dirs:
  - <scan dir 1>
  - <scan dir 2>
---
```

Each scan dir is quoted only if YAML would otherwise misparse it.

### Body

````md
# Agentic Tasks

Tasks/tickets created for agentic project work in Pi. Ticket frontmatter is the source of truth; this dashboard is generated by the `obsidian-tickets` Pi extension.

> Dataview sections require the Obsidian Dataview community plugin. Keep the Plain Markdown fallback below for non-Dataview environments.

## Board by Status

```dataview
TABLE rows.file.link AS Tickets, rows.priority AS Priority, rows.project AS Project, rows.repo AS Repo, rows.branch AS Branch, rows.pr AS PR, rows.updated AS Updated
FROM <SOURCE>
WHERE type = "ticket"
GROUP BY status
SORT choice(key = "in-progress", 0, choice(key = "needs-review", 1, choice(key = "blocked", 2, choice(key = "todo", 3, choice(key = "done", 4, 5))))) ASC
```

## Backlog by Priority

```dataview
TABLE status AS Status, priority AS Priority, project AS Project, repo AS Repo, branch AS Branch, pr AS PR, updated AS Updated
FROM <SOURCE>
WHERE type = "ticket" AND status != "done" AND status != "archived"
SORT choice(priority = "urgent", 0, choice(priority = "high", 1, choice(priority = "medium", 2, 3))) ASC, updated DESC
```

## Grouped by Project/Epic

```dataview
TABLE rows.file.link AS Tickets, rows.status AS Status, rows.priority AS Priority, rows.updated AS Updated, rows.pr AS PR
FROM <SOURCE>
WHERE type = "ticket"
GROUP BY default(project, "Unassigned")
SORT key ASC
```

## Recently Updated Tickets

```dataview
TABLE status AS Status, priority AS Priority, project AS Project, repo AS Repo, branch AS Branch, pr AS PR, updated AS Updated
FROM <SOURCE>
WHERE type = "ticket"
SORT updated DESC
LIMIT 25
```

## Plain Markdown fallback

For environments without the Dataview plugin enabled, this generated summary mirrors the status board.

<!-- obsidian-tickets-fallback:start -->

### <status>

- [[<path-without-.md>|<title>]] · priority: <priority> · project: <project> · updated: <updated>[ · PR: <pr>]
…

<!-- obsidian-tickets-fallback:end -->
````

Where:

- `<SOURCE>` is the scan dirs joined with ` OR `, each quoted: `"01 Projects/Tickets" OR "01 Projects/Other"`. Escape any `"` inside a path with `\"`.
- Fallback section ordering by status: `in-progress`, `needs-review`, `blocked`, `todo`, `done`, `archived`, then any unknown statuses alphabetically. Include every status that has at least one ticket; emit `_None_` only inside present-but-empty statuses (rare, but matches pi). Within a status, sort by priority order (`urgent`, `high`, `medium`, `low`, others last), then by `updated` descending.

## Step 5 — Optionally refresh the Kanban

Refresh the Kanban iff either is true:

- `$OBSIDIAN_TICKETS_KANBAN` is set and non-empty, OR
- A regular (non-symlink) file already exists at the kanban path.

If yes, invoke the logic from `obsidian-ticket-kanban-rebuild` to render it from the same ticket list (do not re-walk the vault — pass the list through if possible). If no, **do not create** the Kanban file; tell the user it'll start auto-refreshing once they create the board file once via `obsidian-ticket-kanban-rebuild`.

## Step 6 — Report

Tell the user, in one short block:

- the dashboard path that was (re)written,
- the kanban path and whether it was rebuilt or skipped (and why),
- `tickets checked: <N>`, `tickets needing backfill: <M>` (M==0 if everything was already canonical),
- if `--dry-run`, prefix with "Previewed" and list which files *would* receive backfill.

## Anti-patterns

- **Don't** write outside the vault root. Refuse symlink targets that resolve outside.
- **Don't** drop frontmatter keys you don't recognize. Preserve them.
- **Don't** sort tickets by `updated` or `priority` at the top level — pi's canonical order is by path.
- **Don't** auto-create the Kanban file if it doesn't exist and `OBSIDIAN_TICKETS_KANBAN` isn't set. That matches pi's "wait until first explicit kanban rebuild" behavior.
- **Don't** edit the user's hand-written ticket body sections during migration — only the YAML frontmatter changes.
- **Don't** call this skill recursively from `obsidian-ticket-update`. The user runs them in sequence when they want both.

## Safety rules

- Treat the vault path and note bodies as sensitive — only report counts and paths.
- Refuse if the vault root resolves outside the user's home directory unless they explicitly confirmed it earlier in the session.
- Always treat the pi extension at `~/dev/dotfiles/pi/extensions/obsidian-tickets/index.ts` (functions `renderTaskMoc`, `migrateTickets`, `buildTicketMeta`, `normalizeTags`) as the canonical reference. If pi changes the template, mirror the change here.
