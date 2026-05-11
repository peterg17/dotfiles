---
name: jira-team-ticket
description: 'Spawn a visual agent team in tmux to ship one or more **Jira tickets** end-to-end: one implementer per ticket, shared reviewer and tester, each in their own tmux pane with live inter-agent messaging and automatic PR review polling. Pi equivalent of Claude Code agent teams. **Strictly assumes Jira tickets.** Trigger phrases: "spawn a team for JIRA-123", "team up on JIRA-456 JIRA-789 in parallel", "launch a team for these Jira tickets".'
---

# Jira-Team Workflow (tmux visual teams)

Ship one or more **Jira tickets** end-to-end using a visual agent team in tmux. Each agent runs in its own tmux pane with full interactive UI, communicating via the `send_message` tool.

Supports **1–5 Jira tickets**. Each ticket gets its own implementer in its own git worktree. A single shared reviewer and tester gate all of them. After PRs are opened, `team_watch_pr` polls for review comments — auto-dispatching Codex feedback to the implementer and surfacing human comments to the team-lead.

## How to trigger

- `/skill:jira-team-ticket JIRA-12345`
- `/skill:jira-team-ticket JIRA-12345 JIRA-12346 JIRA-12347`
- "spawn a team for JIRA-12345"
- "tackle JIRA-12345 and JIRA-12346 with a visual team"
- "team up on these Jira tickets"

The `jira-ticket-workflow` skill will also offer team mode when it detects the `team_create` tool is available.

## When to use

- The user explicitly provides **Jira ticket keys** and wants coordinated agents with visual progress.
- **Strictly assumes Jira tickets.** Do not use with GitHub Issues, Linear, or other trackers.
- The repo has a default branch and a way to run tests.
- The tickets are reasonably independent (no overlapping file conflicts).

**When NOT to use:**
- One-line fixes or doc tweaks — just edit inline.
- More than 5 tickets — push back, batch the rest separately.
- When the user explicitly wants headless/fast execution — use `jira-ticket-workflow` in subagent mode.

## Prerequisites

The `team-tmux` extension must be loaded. Verify that `team_create` tool is available. If not, inform the user that `jira-ticket-workflow` in subagent mode is the alternative.

## Step 1 — Gather context

Auto-detect from the project; ask only when detection fails.

| Input | How to detect | Fallback |
|---|---|---|
| **Tickets** | Provided by user (must be Jira format, e.g., `JIRA-123`) | Required |
| **Ticket details** | `jira issue view <KEY> --plain` for each | **Cannot proceed without `jira` CLI** |
| **Repo root** | `git rev-parse --show-toplevel` | Ask |
| **Base branch** | AGENTS.md "Main branch" or `git symbolic-ref refs/remotes/origin/HEAD` or `prod` | Ask |
| **Worktree root** | Convention or ask | Ask |
| **Branch prefix** | AGENTS.md "Feature branches" or recent branches heuristic | Ask |
| **Build/test commands** | AGENTS.md "Common Commands" or detect | Let agents figure it out |
| **PR template** | `.github/pull_request_template.md` | Agents write a sensible default |

Read AGENTS.md / CLAUDE.md once and pass relevant excerpts into all agent tasks.

## Step 2 — Verify preconditions

Refuse to proceed if:
1. Uncommitted changes in the source clone would be picked up by worktree creation.
2. The worktree root doesn't exist or isn't writable.
3. The provided ticket is not a valid Jira key. Ask the user to clarify.
4. More than 5 tickets. Ask to batch.

## Step 3 — Create worktrees

One per ticket:

```bash
cd <repo-root>
git fetch origin <base-branch>
# For each ticket:
git worktree add -b <prefix>/<TICKET>-<kebab-desc> <worktree-root>/<repo>-<TICKET> origin/<base-branch>
```

**Important:** `git worktree add -b … origin/<base>` auto-tracks the base, so each implementer's first push must use `-u origin <branch>`.

## Step 4 — Create the team

```
team_create { name: "jira-ticket-<TICKET-KEY>" }          // single ticket
team_create { name: "jira-tickets-<short-suffix>" }        // multiple tickets
```

This opens a tmux window where agent panes will appear.

## Step 5 — Spawn agents

### Reviewer (1, shared across all tickets)

```
team_spawn {
  name: "reviewer",
  agent: "ticket-reviewer",
  task: "You are the code reviewer for team <team-name>.\n\nTeammates: team-lead, <list of impl-KEY agents>, tester\n\nWorkflow:\n1. Wait for review requests from any implementer.\n2. When asked, cd into the specified worktree and run `git diff origin/<base>...HEAD`.\n3. Review for correctness, conventions, and completeness vs the ticket.\n4. Reply via send_message to the requesting implementer with APPROVED or CHANGES REQUESTED (with file:line refs).\n5. Never edit code yourself.\n\nProject conventions:\n<relevant AGENTS.md excerpts>"
}
```

### Tester (1, shared across all tickets)

```
team_spawn {
  name: "tester",
  agent: "ticket-tester",
  task: "You are the tester for team <team-name>.\n\nTeammates: team-lead, <list of impl-KEY agents>, reviewer\n\nWorkflow:\n1. Wait for test requests from any implementer.\n2. cd into the specified worktree and run the exact command provided.\n3. Reply via send_message to the requesting implementer with PASS or FAIL (with key excerpts).\n4. Don't invent tests — only run what the implementer asks.\n5. Never edit code."
}
```

### Implementers (1 per ticket)

For each ticket, spawn an implementer:

```
team_spawn {
  name: "impl-<KEY>",
  agent: "ticket-implementer",
  task: "You are the implementer for Jira ticket <KEY>: <title>.\n\nTeammates: team-lead, reviewer, tester<, other impl agents if multi-ticket>\nWorktree: <path>\nBranch: <branch>\nBase: origin/<base>\n\nStrict workflow:\n1. cd into the worktree.\n2. Read AGENTS.md for conventions.\n3. Investigate the relevant code before editing.\n4. Implement the minimal fix. Run formatter.\n5. Plan tests.\n6. Code review loop: send_message reviewer with worktree path + summary. Loop until APPROVED.\n7. Test loop: send_message tester with worktree path + exact test command. Loop until PASS.\n8. Commit + push + draft PR (only after APPROVED + PASS):\n   - Stage specific files, never `git add -A`\n   - Conventional Commits + Co-Authored-By footer\n   - Never --no-gpg-sign, --no-verify, --amend, or force-push\n   - First push: `git push -u origin <branch>`\n   - `gh pr create --draft --title '[<KEY>]: <desc>'`\n   - Post `@codex review` as PR comment\n9. Report PR URL to team-lead via send_message.\n\nPause-and-ask: if scope balloons, send_message team-lead before proceeding.\n\nTicket details:\n<full ticket body>"
}
```

## Step 6 — Monitor and coordinate

After spawning, **go idle**. Messages from teammates arrive automatically. The widget above the editor shows live agent status.

For **multi-ticket teams**: implementers work in parallel on independent tickets. The shared reviewer and tester handle requests from all of them. Expect interleaved messages.

You can:
- Switch to the team tmux window (`Ctrl-b w`) to watch agents work
- Switch back (`Ctrl-b p`) to see messages
- Use `team_status` to check agent states
- Use `team_send` to send instructions to specific agents

## Step 7 — Set up PR comment watching

After each implementer reports its PR URL, set up comment polling:

```
team_watch_pr {
  pr: "<PR-URL-or-number>",
  implementer: "impl-<KEY>"
}
```

This polls the PR every 5 minutes with these rules:
1. **Codex / AI reviewer** comments → auto-dispatched to the implementer to fix as a new commit
2. **Human teammate** comments → surfaced to team-lead (you). Don't auto-fix or auto-reply.
3. **Bots** (devflow, dependabot, etc.) → skipped silently

For multi-ticket teams, call `team_watch_pr` once per PR with the matching implementer.

Tell the user:
- PR watching is active and session-bound (stops when pi exits or team is destroyed)
- Codex comments will be auto-handled
- Human comments will be surfaced for their review

## Step 8 — Hand off

When all implementers have reported PR URLs:
1. Verify each PR: `gh pr view <url>`
2. Report to the user:
   - Per-ticket: PR URL, branch, summary of changes
   - Active PR watchers
3. Go idle — messages from agents and PR polling arrive automatically
4. When done, `team_destroy` cleans up everything (tmux window, agents, PR watchers)

## Anti-patterns

- **Don't** use this skill with non-Jira tickets (e.g., `PROJ-1234`, `GH-567`).
- **Don't** skip the reviewer/tester — the quality gate is the point.
- **Don't** send the initial task AND a duplicate team_send — team_spawn handles the first prompt.
- **Don't** destroy the team while agents are still working.
- **Don't** spawn more than ~5 agents total — tmux panes get too small.
- **Don't** silently expand scope — pause and message team-lead.
- **Don't** auto-fix or auto-reply to human PR comments — surface them.
- **Don't** use `--no-gpg-sign` or force-push.
- **Don't** forget `team_watch_pr` after PRs are opened — it's what keeps Codex feedback flowing.

## Variant: language-specific overrides

| Project | Formatter | Test runner | Lint check |
|---|---|---|---|
| Gradle/Java | `./gradlew spotlessApply` | `./gradlew :module:test --tests "Class.method"` | `./gradlew spotlessCheck` |
| Go | `go fmt ./...` | `go test ./module/...` | `go vet ./...` |
| Rust | `cargo fmt` | `cargo test -p crate test_name` | `cargo clippy` |
| Node.js | `npx prettier --write .` | `npm test -- --testNamePattern` | `npm run lint` |
| Python | `ruff format .` | `pytest path/to/test.py::test_name` | `ruff check` |
