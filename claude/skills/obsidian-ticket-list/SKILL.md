---
name: obsidian-ticket-list
description: 'Use when the user asks you to list, find, or summarize Obsidian tickets in their vault. Reads ticket notes produced by pi/extensions/obsidian-tickets and prints a status/priority/project summary identical to pi''s `obsidian_ticket_list` tool. Trigger phrases: "list my Obsidian tickets", "what tickets do I have", "show open tickets", "tickets in project X", "tickets in status needs-review", "what''s in my backlog".'
---

# List Obsidian Tickets

Claude counterpart to pi's `obsidian_ticket_list` tool. Reads `type: ticket` notes from the configured Obsidian vault scan folders, optionally filters by status or project, and prints a single-line-per-ticket summary that matches pi's output format so the same query works in both runtimes.

This is a read-only skill: no writes, no dashboard regeneration. Use `obsidian-ticket-update` to change a ticket and `obsidian-ticket-rebuild` to refresh the dashboard.

## When to use

- User asks for the list, count, or status board of their Obsidian tickets.
- User asks for tickets in a specific status (`todo`, `in-progress`, `needs-review`, `blocked`, `done`, `archived`) or project.
- User asks "what's the next ticket I should pick up" — list, then recommend.

**When not to use:**
- User wants to *create* a ticket — use `obsidian-ticket-create`.
- User wants to *update* a ticket — use `obsidian-ticket-update`.
- User wants the rendered Agentic Tasks dashboard/Kanban refreshed — use `obsidian-ticket-rebuild` or `obsidian-ticket-kanban-rebuild`.
- User wants ticket *content* (full body, acceptance criteria) — `Read` the file directly after listing.

## Required tools

`Bash` (for `find` / env lookup) and `Read` (for parsing frontmatter). No deferred tool loading required.

## Step 1 — Resolve vault root and scan dirs

Vault root resolution order (same as pi):

1. `$OBSIDIAN_TICKETS_VAULT`.
2. `$OBSIDIAN_VAULT_ROOT`.
3. Default `~/Documents/notes`.

If the resolved root does not exist, ask the user via `AskUserQuestion` and remember the answer for the session.

Scan dirs resolution (vault-relative; comma-separated when from env):

1. `$OBSIDIAN_TICKETS_SCAN_DIRS` if set.
2. Else `$OBSIDIAN_TICKETS_DIR` if set.
3. Else `01 Projects/Tickets`.
4. Plus any `ticket-scan-dirs:` entries in the frontmatter of `$OBSIDIAN_TICKETS_DASHBOARD` (default `00 Maps/Agentic Tasks.md`). Read that file's YAML frontmatter and merge.

De-duplicate, drop empty/`.`/absolute entries, and treat all paths as vault-relative.

## Step 2 — Find ticket notes

For each scan dir, walk it recursively and collect `*.md` files. For each file, read just enough to parse its YAML frontmatter (lines between the first pair of `---` markers).

A note is a ticket iff `type: ticket` is in its frontmatter. Skip everything else.

From the frontmatter, extract: `status`, `priority`, `project`, `pr`, `updated`. Compute the title from the first `# Heading` line in the body, or fall back to the filename without `.md`.

Normalize using these aliases (mirrors pi):

- **Status aliases** (lowercase, `_` and `/` → `-`): `active`→`in-progress`, `backlog`→`todo`, `complete`/`completed`→`done`, `doing`/`inprogress`/`progress`→`in-progress`, `review`/`needsreview`→`needs-review`, `archive`→`archived`. Default `todo`.
- **Priority aliases**: `p0`/`critical`/`crit`→`urgent`, `p1`→`high`, `p2`/`med`/`normal`→`medium`, `p3`→`low`. Default `medium`.

## Step 3 — Apply filters

If the user passed a status filter (via args or natural-language), keep tickets whose normalized status equals it.

If the user passed a project filter, keep tickets whose project contains the filter substring (case-insensitive). Project values are sometimes wikilinks like `"[[Website Redesign]]"` — match against the inner text after stripping `[[` / `]]` and any `|alias`.

## Step 4 — Sort and format

Sort by path (vault-relative, lexicographic) — same order pi uses.

For each ticket, emit one line:

```
- [<status>] [[<path-without-.md>|<title>]] · <priority> · <project>[ · <pr>]
```

Include `· <pr>` only if `pr` is non-empty. Use `[[…]]` wikilink form, dropping the `.md` extension and using the title as the alias only when it differs from the basename.

If nothing matches, emit exactly: `No matching Obsidian tickets.` (matches pi).

## Step 5 — Report

Print the lines. After the list, if helpful, give the user a one-sentence summary like "12 tickets total, 4 in progress, 3 blocked." Do not invent recommendations unless asked.

## Anti-patterns

- **Don't** scan the entire vault — only the configured scan dirs. The vault has many non-ticket notes.
- **Don't** include notes without `type: ticket` even if they live under the tickets folder. Pi's migration may not have run yet on legacy notes.
- **Don't** write anything. This skill is read-only.
- **Don't** normalize aliases differently than pi — round-trip compatibility depends on shared canonical forms.
- **Don't** sort by `updated` or `priority` by default — pi's default is path order. Re-sort only if the user asked.

## Safety rules

- Treat ticket bodies as potentially sensitive. The list output only references title / status / priority / project / PR — do not echo full ticket bodies unless the user explicitly asks.
- If the vault root resolves outside the user's home directory or contains symlinks pointing elsewhere, refuse and ask the user to confirm.
