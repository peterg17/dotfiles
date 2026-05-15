---
name: obsidian-ticket-update
description: 'Use when the user asks you to change the status of an Obsidian ticket, attach a PR URL, or append a work-log entry. Edits the ticket''s YAML frontmatter and body in place using the same schema pi/extensions/obsidian-tickets writes, so updates round-trip between pi''s `obsidian_ticket_update` tool and Claude. Trigger phrases: "mark ticket X as done", "set [[ticket]] to in-progress", "append work log to ticket Y", "attach PR https://... to ticket Z", "update ticket status".'
---

# Update Obsidian Ticket

Claude counterpart to pi's `obsidian_ticket_update` tool. Mutates a single ticket note's frontmatter (status, pr, updated, status/* tag) and optionally appends a `## Work Log` entry and a `## PR` line. Does **not** regenerate the Agentic Tasks dashboard or Kanban board — that is `obsidian-ticket-rebuild` / `obsidian-ticket-kanban-rebuild` on Claude, or `obsidian_ticket_rebuild` / `obsidian_ticket_kanban_rebuild` on pi.

The ticket file remains the source of truth; the dashboards are a generated projection.

## When to use

- User wants to move a ticket between status columns (`todo`, `in-progress`, `needs-review`, `blocked`, `done`, `archived`).
- User wants to attach a PR URL to a ticket they just opened.
- User wants to append a progress note to the ticket's `## Work Log`.
- An agent team finishes a milestone and wants to record it on the ticket.

**When not to use:**
- User wants to *create* a new ticket — use `obsidian-ticket-create`.
- User wants to *list* tickets — use `obsidian-ticket-list`.
- User wants to rewrite the problem description, acceptance criteria, or context — use ordinary `Edit` on the note (those sections are user-authored, not managed by this skill).
- User wants the rendered dashboard refreshed — chain with `obsidian-ticket-rebuild` after.

## Required tools

`Read`, `Edit`, `Bash` (for `find` / vault-root resolution and current timestamp). No deferred tool loading required.

## Step 1 — Gather inputs

Required:

- **ticket** — identifier. Accept any of:
  - vault-relative path (`01 Projects/Tickets/Website Redesign/add user settings table migration.md`)
  - absolute path (must resolve inside the vault)
  - wikilink (`[[add user settings table migration]]` or `[[…|alias]]`)
  - bare title (`add user settings table migration`)

Optional (at least one must be present, otherwise this is a no-op):

- **status** — new status. Normalize via the same alias map as pi (see `obsidian-ticket-list` SKILL.md).
- **pr** — PR URL to record on the ticket.
- **workLog** — free-text entry to append under `## Work Log`.

If the user supplied none of `status` / `pr` / `workLog`, ask via `AskUserQuestion` which they want — don't silently bump `updated` only.

## Step 2 — Resolve the ticket file

Use the same vault root + scan dirs resolution as `obsidian-ticket-list` (env vars → defaults → dashboard frontmatter merge).

Resolve the identifier in this order (matches pi's `resolveTicket`):

1. If it's a wikilink, strip `[[ ]]` and any `|alias`.
2. If it ends in `.md` and resolves inside the vault, use that absolute path's relative form.
3. List all tickets via the same scan; first exact match on (a) path-without-`.md` or (b) title.
4. Fall back to case-insensitive match on basename or title.

If nothing resolves, error out — never create a new ticket as a side effect of update.

## Step 3 — Apply frontmatter updates

Parse the YAML frontmatter block (lines between the first pair of `---` markers). Preserve unknown keys and any user-added keys (`aliases`, `source`, `links`, etc.) — pi only manages the keys: `type`, `status`, `priority`, `project`, `created`, `updated`, `repo`, `branch`, `pr`, `tags`.

Apply changes:

- If `status` provided: set `status: <normalized>`. Update the `tags:` list so the single `status/<old>` entry is replaced by `status/<new>` — preserve order otherwise. If no `status/*` tag exists, prepend `status/<new>`.
- If `pr` provided: set `pr: "<url>"` (always quoted; URLs contain `:`).
- Always: set `updated: <today YYYY-MM-DD>` (UTC; use `date -u +%Y-%m-%d` or equivalent).
- Always: ensure `type: ticket` is present at the top.

Render the new frontmatter in this exact key order (matches pi for clean diffs):

```yaml
---
type: ticket
status: <status>
priority: <priority>
project: <project or "Unassigned">
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
repo: <repo or empty>
branch: <branch>
pr: <pr or empty>
tags:
  - status/<status>
  - <other tags…>
<preserved extra keys at the end>
---
```

Quote any YAML scalar that contains `:` or `#`, starts with `-`/`?`/`!`/`&`/`*`/`[`/`{`/whitespace, or equals `true`/`false`/`null`/`yes`/`no`/`on`/`off` (case-insensitive).

## Step 4 — Apply body updates

Read the body (everything after the frontmatter):

- If `workLog` provided: ensure a `## Work Log` heading exists (append at end of file if missing). Insert a new bullet immediately after the heading line:
  ```
  - YYYY-MM-DD HH:mm — <workLog text>
  ```
  Use UTC time (`date -u "+%Y-%m-%d %H:%M"`).

- If `pr` provided: ensure a `## PR` heading exists (append at end if missing). If the PR URL is not already present anywhere in the body, replace the literal `## PR` line with:
  ```
  ## PR

  - <pr url>
  ```

Do **not** rewrite the `## Problem`, `## Acceptance Criteria`, `## Context`, or `## Agent Instructions` sections — those are user-authored.

## Step 5 — Write and report

Write the updated file (`Edit` preferred to keep the diff small; full rewrite via `Write` only if frontmatter restructuring is unavoidable).

Tell the user:

- absolute path of the ticket,
- vault-relative path,
- a one-line summary of what changed (`status: todo → in-progress`, `pr attached`, `work log appended`),
- a nudge that the dashboard is **not** auto-refreshed — they can ask Claude to run `obsidian-ticket-rebuild` or ask pi to run `obsidian_ticket_rebuild` / `/tickets-rebuild`. The Kanban refresh is `obsidian-ticket-kanban-rebuild` (Claude) or `obsidian_ticket_kanban_rebuild` / `/tickets-kanban-rebuild` (pi).

## Anti-patterns

- **Don't** create a new ticket if the identifier doesn't resolve. Error instead.
- **Don't** touch the dashboard or Kanban file from this skill — that's the rebuild skills.
- **Don't** clobber unknown frontmatter keys. Preserve everything the user has added.
- **Don't** rewrite user-authored body sections.
- **Don't** strip status from existing tags before adding the new one — replace the single `status/*` entry, keep all others.
- **Don't** call this skill recursively or from inside the team skills. The team skill should call this skill's behavior via natural-language ticket edits or its own internal logic.

## Safety rules

- Refuse to write outside the resolved vault root. Refuse to follow symlinks.
- Treat ticket bodies as potentially sensitive — never echo more than the path, title, and one-line change summary to the user, and never paste full ticket content into PR descriptions or remote logs.
- Do not delete tickets here. Archival = status `archived`. Hard deletes are a manual action.
