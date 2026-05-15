---
name: obsidian-ticket-update
description: 'Use when the user asks you to change the status of an Obsidian ticket, attach a PR URL, or append a work-log entry. Edits the ticket''s YAML frontmatter and body in place using the same schema pi/extensions/obsidian-tickets writes, so updates round-trip between pi''s `obsidian_ticket_update` tool and Claude. Trigger phrases: "mark ticket X as done", "set [[ticket]] to in-progress", "append work log to ticket Y", "attach PR https://... to ticket Z", "update ticket status".'
---

# Update Obsidian Ticket

Claude counterpart to pi's `obsidian_ticket_update` tool. Mutates a single ticket note's frontmatter (status, pr, updated, status/* tag) and optionally appends a `## Work Log` entry and a `## PR` line. After the write, it shells out to `pi -p "/tickets-rebuild"` so the Agentic Tasks dashboard and Kanban stay in sync — matching pi's `obsidian_ticket_update` behavior. If `pi` isn't on `PATH`, the refresh is skipped (best-effort) and the user is told to run `obsidian-ticket-rebuild` manually.

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
- User wants to refresh dashboards without modifying a ticket — use `obsidian-ticket-rebuild` directly.

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

## Step 5 — Write

Write the updated file (`Edit` preferred to keep the diff small; full rewrite via `Write` only if frontmatter restructuring is unavoidable). Do not regenerate the dashboard or Kanban inline — Step 6 delegates that to pi.

## Step 6 — Refresh the dashboard via pi

Pi's `obsidian_ticket_update` always refreshes the Agentic Tasks dashboard (and the Kanban when it exists) at the end. Mirror that by shelling out to pi:

```bash
if command -v pi >/dev/null 2>&1; then
    pi -p "/tickets-rebuild"
fi
```

This invokes the same code path pi runs internally, so dashboards stay consistent regardless of whether pi or Claude updated the ticket. The shell-out is best-effort:

- If `pi` is not on `PATH`, skip silently and tell the user in Step 7 that the dashboard is stale and can be refreshed via the `obsidian-ticket-rebuild` Claude skill.
- If `pi` exits non-zero, surface the stderr in your report but **do not roll back the ticket update** — the ticket is the source of truth and a failed dashboard refresh is recoverable.

Vault env vars (`OBSIDIAN_TICKETS_VAULT`, `OBSIDIAN_VAULT_ROOT`, etc.) propagate from the parent shell into pi automatically — no need to re-export them.

## Step 7 — Report

Tell the user:

- absolute path of the ticket,
- vault-relative path,
- a one-line summary of what changed (`status: todo → in-progress`, `pr attached`, `work log appended`),
- one of: "dashboard + Kanban refreshed via pi", "pi not installed — run `obsidian-ticket-rebuild` to refresh", or "pi refresh failed: \<error\>".

## Anti-patterns

- **Don't** create a new ticket if the identifier doesn't resolve. Error instead.
- **Don't** regenerate the dashboard/Kanban inline in markdown — always delegate to pi via Step 6. The standalone `obsidian-ticket-rebuild` Claude skill exists as a fallback when pi isn't available.
- **Don't** clobber unknown frontmatter keys. Preserve everything the user has added.
- **Don't** rewrite user-authored body sections.
- **Don't** strip status from existing tags before adding the new one — replace the single `status/*` entry, keep all others.
- **Don't** call this skill recursively or from inside the team skills. The team skill should call this skill's behavior via natural-language ticket edits or its own internal logic.

## Safety rules

- Refuse to write outside the resolved vault root. Refuse to follow symlinks.
- Treat ticket bodies as potentially sensitive — never echo more than the path, title, and one-line change summary to the user, and never paste full ticket content into PR descriptions or remote logs.
- Do not delete tickets here. Archival = status `archived`. Hard deletes are a manual action.
