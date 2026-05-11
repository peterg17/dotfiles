---
name: obsidian-ticket-team
description: Use a visual tmux Pi agent team to ship implementation work from Obsidian Markdown ticket notes. Use when asked to team up on an Obsidian ticket, spawn a team for a note, ship a task from a local vault note path or wikilink, or continue work from an obsidian-tickets generated note.
---

# Obsidian Ticket Team

Use this skill to coordinate implementation work described by Obsidian Markdown ticket notes. It is the Obsidian-specific companion to the `obsidian-tickets` extension and the generic `team-tmux` runtime.

Keep this workflow portable: do not assume a personal vault path, repository path, branch naming scheme, or worktree directory. Discover those from the ticket note, environment variables, the current repository, or a short clarification from the user.

## Prerequisites

- The `team-tmux` extension must be loaded; verify that `team_create` and `team_spawn` are available.
- The ticket note should describe implementation work and, when code changes are needed, identify a repository via frontmatter (`repo:`), context text, the current working directory, or user clarification.
- Prefer the `obsidian_ticket_create`, `obsidian_ticket_list`, `obsidian_ticket_update`, and `obsidian_ticket_rebuild` tools when they are available. If they are unavailable, use normal file tools to read and minimally update Markdown notes.
- If the target vault or repository has `AGENTS.md`, `CLAUDE.md`, or similar instructions, read and follow the relevant parts before spawning agents.

If `team_create` is unavailable, tell the user to install or reload the `team-tmux` package instead of silently switching to a Jira-specific workflow.

## Ticket note format

Support flexible Markdown. New tickets created by the `obsidian-tickets` extension usually look like this:

```md
---
type: ticket
status: todo
priority: medium
project: Example
repo: /path/or/url/to/repo
branch: feature/example-ticket
pr:
tags:
  - status/todo
  - project/active
---

# Ticket title

## Problem

## Acceptance Criteria

- [ ] Observable outcome

## Context

## Work Log

## PR
```

Do not require every field. Infer what you can and ask only for information required to proceed safely, especially the target repository or unclear acceptance criteria.

## Resolve ticket input

The user may provide:

- an absolute Markdown path,
- a path relative to the configured vault,
- a wiki link such as `[[Ticket Title]]`,
- a Markdown link to a local note,
- a ticket title listed by `obsidian_ticket_list`,
- or pasted ticket Markdown.

Resolution order:

1. If an Obsidian ticket tool can resolve the ticket, use it.
2. If a Markdown path is provided, read that file after confirming it is in the intended vault/workspace.
3. For wiki links, search likely vault roots from `OBSIDIAN_TICKETS_VAULT`, `OBSIDIAN_VAULT_ROOT`, the current working directory, and user-provided paths.
4. If multiple notes match, ask the user to choose.
5. If only pasted Markdown is available, proceed from that content but ask before writing updates anywhere.

## Workflow

### 1. Read and summarize the ticket

Extract:

- title and note path,
- status, priority, project, repo, branch, and PR frontmatter,
- problem statement,
- acceptance criteria,
- context links or related notes that look important,
- open questions or missing prerequisites.

Keep summaries concise and avoid exposing sensitive note content beyond what is necessary for the coding task.

### 2. Prepare the note

Before spawning agents, make minimal additive updates when appropriate:

- set `status: in-progress`,
- ensure `type: ticket`, `updated`, `## Work Log`, and `## PR` exist,
- append a work-log entry that a visual team was started.

Prefer `obsidian_ticket_update` for status and work-log changes. Do not rewrite the user's problem statement or unrelated note content.

### 3. Prepare repository context

Determine the target repo and working strategy:

- Use the ticket's `repo:` value when present.
- If `repo:` is missing but the current working directory is a git repository and appears to match the task, ask for confirmation before using it.
- Prefer a separate git worktree for background team work when changes are non-trivial or the source clone is dirty.
- Use the ticket's `branch:` value when present; otherwise derive a short feature branch from the ticket title.
- Detect the base branch from `origin/HEAD`, local project instructions, or user clarification.

Do not run destructive git commands, force-push, or discard user changes without explicit permission.

### 4. Create the visual team

Create one team per batch of related Obsidian tickets:

```text
team_create { name: "obsidian-<short-ticket-slug>" }
```

Use a short, tmux-safe slug from the ticket title or project.

### 5. Spawn agents

Use one shared reviewer and one shared tester/validator. For multiple independent notes, spawn one implementer per note.

#### Reviewer

Spawn with `agent: "ticket-reviewer"` and instructions to:

- wait for review requests from implementers,
- inspect the specified repo/worktree diff against the base branch,
- check correctness against the Obsidian ticket problem and acceptance criteria,
- reply via `send_message` with `APPROVED` or `CHANGES REQUESTED` plus concise file/line references,
- never edit code unless explicitly instructed.

#### Tester

Spawn with `agent: "ticket-tester"` and instructions to:

- wait for test requests,
- run only the exact commands requested by the implementer,
- report `PASS` or `FAIL` with concise evidence,
- never edit code.

#### Implementer

Spawn with `agent: "ticket-implementer"` and include:

- ticket title and note path,
- repo/worktree path,
- branch and base branch,
- problem summary,
- acceptance criteria,
- relevant context excerpts,
- project instructions from `AGENTS.md`/`CLAUDE.md`,
- teammate names and communication workflow.

The implementer must:

1. `cd` into the repo/worktree.
2. Inspect existing code before editing.
3. Implement the smallest correct change.
4. Run formatting or static checks expected by the project.
5. Ask the reviewer for a diff review via `send_message` and loop until approved.
6. Ask the tester to run focused validation commands and loop until pass.
7. Commit only after review and validation pass, and only if the user expects commits.
8. Push/open or update a PR only when requested or clearly part of the ticket workflow.
9. Report status, changed files, validation, commit hash, and PR URL to the team lead.

Prefer that the team lead updates the Obsidian note. Implementers should not edit the note unless explicitly asked, to avoid concurrent note rewrites.

### 6. Track progress in Obsidian

As messages arrive, append concise work-log entries, for example:

```md
- YYYY-MM-DD HH:mm — Status: in-progress. Spawned visual team `obsidian-example`.
- YYYY-MM-DD HH:mm — Review: approved by reviewer.
- YYYY-MM-DD HH:mm — Tests: PASS `npm test -- path/to/test`.
```

When a PR exists:

- set/update the `pr:` frontmatter field,
- add the PR URL under `## PR`,
- optionally call `team_watch_pr` so Codex/AI comments are routed back to the implementer and human comments surface to the team lead.

When complete, mark acceptance criteria as checked only when actually satisfied and set status to `done`, or set status to `blocked` with a short reason.

## Multiple Obsidian tickets

For 2–5 independent notes:

- create one team,
- spawn one shared reviewer,
- spawn one shared tester,
- spawn one implementer per note,
- give each implementer only its note-specific context plus awareness of teammates,
- update each note separately.

If tickets overlap heavily, ask whether to merge them into one workflow.

## Safety rules

- Never delete, move, or rename notes unless the user asks.
- Avoid broad vault rewrites; make minimal frontmatter/work-log updates.
- Treat note content, local paths, secrets, and work details as sensitive.
- Do not expose more note content in chat or PRs than the task requires.
- Do not run destructive git commands, force-push, or bypass hooks without explicit approval.
- Do not auto-reply to human PR reviewers; surface their comments to the user/team lead.

## Final response

Report:

- ticket note path(s),
- team name and agents spawned,
- repo/worktree and branch used,
- files changed,
- validation run,
- ticket note updates made,
- PR URL if any,
- remaining follow-ups or blockers.
