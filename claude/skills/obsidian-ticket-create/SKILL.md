---
name: obsidian-ticket-create
description: 'Use when the user asks you to capture a new task / ticket / agentic project work item in their Obsidian vault. Writes a Markdown ticket note matching the schema produced by pi/extensions/obsidian-tickets so the same notes are discoverable from both pi and Claude. Trigger phrases: "create an Obsidian ticket", "add a ticket for X to my vault", "make a ticket note", "capture this as a ticket", "new vault ticket for ...".'
---

# Create Obsidian Ticket

Claude counterpart to pi's `obsidian_ticket_create` tool. Writes a single Markdown ticket note into the configured Obsidian vault using the same frontmatter + section layout the pi `obsidian-tickets` extension produces, so the note is consumable by `obsidian_ticket_list` / `obsidian_ticket_update` / `obsidian_ticket_rebuild` on the pi side and by `obsidian-ticket-claude-team` on the Claude side.

This is a small, single-action skill: no team setup, no PR, no cron. Use it when the user wants a captured ticket, not when they want the work shipped (use `obsidian-ticket-claude-team` for that).

## When to use

- The user wants a new ticket note created from a description, a chat capture, or a plain title.
- The user is in the middle of other work and says "remember to do X" or "make me a ticket for Y".

**When not to use:**
- The user wants you to *do* the work — that's `single-jira-ticket-team` / `parallel-jira-tickets` (Jira) or `obsidian-ticket-claude-team` (Obsidian).
- The user wants to *list* existing tickets — use `obsidian-ticket-list`.
- The user wants to *update* an existing ticket (status, PR, work log) — use `obsidian-ticket-update`, or ask pi to run `obsidian_ticket_update`.
- The user wants to *refresh* the generated dashboard or Kanban — use `obsidian-ticket-rebuild` or `obsidian-ticket-kanban-rebuild`.
- The user wants to capture a link/idea into the inbox MOC — use `obsidian-inbox-cleanup` instead.

## Required tools

Just `Read`, `Write`, `Bash` (for `mkdir -p` and uniqueness check), and `AskUserQuestion` for the rare clarification. No deferred tool loading required.

## Step 1 — Gather inputs

Required:

- **title** — short, descriptive (the filename comes from this).

Optional but valuable; ask via `AskUserQuestion` only when ambiguity blocks proceeding:

- **description** — problem / goal statement. If absent, write `TODO: describe the problem or desired outcome.`
- **acceptance criteria** — list of observable outcomes. If absent, write `- [ ] TODO: define done.`
- **project** — project name, epic name, or `[[wikilink]]`. Drives the subfolder and the `project:` frontmatter.
- **repo** — repository path or URL for downstream implementation work.
- **branch** — suggested feature branch. Default: `feature/<kebab-slug-of-title>`.
- **priority** — `low`, `medium`, `high`, `urgent`. Default: `medium`.
- **status** — `todo`, `in-progress`, `needs-review`, `blocked`, `done`, `archived`. Default: `todo`.
- **folder** — vault-relative folder. Default per resolution below.

Don't over-prompt. If the user gave a single-sentence ask, that's enough — generate the note with sensible defaults and TODO placeholders.

## Step 2 — Resolve the vault root and ticket folder

Vault root resolution order:

1. `$OBSIDIAN_TICKETS_VAULT` (preferred).
2. `$OBSIDIAN_VAULT_ROOT`.
3. If the user passed an absolute path to a vault, use it.
4. If neither is set and there's no path hint, ask the user via `AskUserQuestion` and remember the answer for the rest of the session.

Ticket folder resolution order (relative to vault root):

1. Explicit `folder` argument from the user.
2. If `project` is set: `<TICKETS_DIR>/<sanitized-project>/`.
3. `$OBSIDIAN_TICKETS_DIR` (defaults to `01 Projects/Tickets` to match the pi extension).

Refuse to write outside the vault root. Refuse to overwrite an existing file — use a `-2`/`-3` suffix instead (`mkdir -p` then probe with `test -e`).

## Step 3 — Sanitize and slug

Match the pi extension's helpers so notes round-trip through both runtimes:

- **sanitize filename**: strip `\\/:*?"<>|#^[]`, collapse whitespace, trim, max 100 chars.
- **slug** (used for `branch` default): sanitize → replace spaces with `-` → lowercase → max 80 chars; fall back to `ticket` if empty.

## Step 4 — Compose the note

Use this layout exactly — the pi extension parses it and the `obsidian-ticket-claude-team` skill reads from the same fields.

```md
---
type: ticket
status: <status>
priority: <priority>
project: <project or "Unassigned">
created: YYYY-MM-DD
updated: YYYY-MM-DD
repo: <repo or empty>
branch: <branch or feature/<slug>>
pr:
tags:
  - status/<status>
  - project/active
---

# <Title>

## Problem

<description or "TODO: describe the problem or desired outcome.">

## Acceptance Criteria

- [ ] <criterion 1>
- [ ] <criterion 2>
  …
(or "- [ ] TODO: define done." if none given)

## Context

Project: <project>            (only if provided)
Repo: `<repo>`                (only if provided)

## Agent Instructions

Ask Claude to run `obsidian-ticket-claude-team` (background worktree + reviewer/tester team), or ask pi to run `obsidian-ticket-team` (visual tmux team), when ready to ship this ticket.

## Work Log

- YYYY-MM-DD HH:mm — Created ticket via Claude.

## PR
```

Notes on the frontmatter:

- `created` and `updated` are today's date in `YYYY-MM-DD` (use `date +%Y-%m-%d` via `Bash` if you need it).
- `tags` always include `status/<status>` and `project/active`; preserve any additional tags the user supplies.
- Leave `pr:` empty — it's set later by `obsidian-ticket-claude-team` or `obsidian_ticket_update`.
- `repo` and `branch` are quoted YAML scalars; quote anything that contains `:` or starts with a number.

## Step 5 — Write the file

Write the file via `Write`. Do not regenerate the dashboard or Kanban inline — Step 6 delegates that to pi so the output is byte-identical to a pi-side create.

## Step 6 — Refresh the dashboard via pi

Pi's `obsidian_ticket_create` always refreshes the Agentic Tasks dashboard (and the Kanban when it exists) at the end. Mirror that by shelling out to pi:

```bash
if command -v pi >/dev/null 2>&1; then
    pi -p "/tickets-rebuild"
fi
```

This invokes the same code path pi runs internally, so dashboards stay consistent regardless of whether pi or Claude wrote the ticket. The shell-out is best-effort:

- If `pi` is not on `PATH`, skip silently and tell the user in Step 7 that the dashboard is stale and can be refreshed via the `obsidian-ticket-rebuild` Claude skill.
- If `pi` exits non-zero, surface the stderr in your report but **do not roll back the ticket file** — the ticket is the source of truth and a failed dashboard refresh is recoverable on the next rebuild.

If the user has a non-default vault, the relevant env vars (`OBSIDIAN_TICKETS_VAULT`, `OBSIDIAN_VAULT_ROOT`, etc.) propagate from the parent shell into pi automatically — no need to re-export them.

## Step 7 — Report

Tell the user:

- absolute path of the new note,
- vault-relative path,
- the `[[wikilink]]` form,
- one of: "dashboard + Kanban refreshed via pi", "pi not installed — run `obsidian-ticket-rebuild` to refresh", or "pi refresh failed: \<error\>".

That's the end of the skill. No commits, no PRs.

## Anti-patterns

- **Don't** overwrite an existing note. Append a `-2`/`-3` suffix instead.
- **Don't** write outside the resolved vault root.
- **Don't** invent acceptance criteria when none were given — write the `TODO: define done.` placeholder so the user knows to fill it in.
- **Don't** call this skill recursively or as part of `obsidian-ticket-claude-team`. The team skill reads existing notes; ticket *creation* is a separate, explicit user action.
- **Don't** regenerate the dashboard/Kanban inline in markdown — always delegate to pi via Step 6. The standalone `obsidian-ticket-rebuild` Claude skill exists as a fallback when pi isn't available.

## Safety rules

- Treat the vault path and note content as sensitive — don't echo more than the path + wikilink to the user, and never paste full ticket content into PR descriptions or remote logs.
- Confirm the vault root if neither env var is set rather than guessing from `~/Documents` or similar paths.
