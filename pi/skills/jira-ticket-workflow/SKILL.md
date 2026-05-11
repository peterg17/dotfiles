---
name: jira-ticket-workflow
description: "Orchestrates end-to-end technical ticket work in pi using teammate subagents or visual tmux teams: **Jira** reading/creation guidance, planning, implementation, tests, review, validation, commits, and PRs. **Strictly assumes Jira tickets.** Supports two modes: headless subagent chains (fast, inline) and visual team mode (tmux panes with inter-agent messaging). Use for single Jira tickets, multiple parallel tickets, or ticket planning/review workflows. Uses `jira` CLI commands by default; refuses to work with non-Jira trackers (e.g., Linear, GitHub Issues)."
---

# Jira Ticket Workflows

Use this skill when the user asks to work on **Jira tickets**, create/triage implementation plans for Jira, run a teammate workflow, implement a single ticket end-to-end, or tackle multiple Jira tickets in parallel.

This skill assumes the `subagent` pi extension is installed and these user agents exist:
- `ticket-jira-analyst`
- `ticket-scout`
- `ticket-planner`
- `ticket-implementer`
- `ticket-reviewer`
- `ticket-tester`
- `ticket-validator`

If the `subagent` tool is unavailable, tell the user to run `/reload` and try again.

## Choosing execution mode

This skill supports two execution modes. **Pick the right one before starting.**

| Signal | Mode | How |
|--------|------|---|
| User says "spawn a team", "visual team", "team up", or wants to watch agents work | **Team mode** (tmux) | Use `team_create` + `team_spawn` tools |
| User says "work on", "implement", "tackle", or wants headless/fast execution | **Subagent mode** (headless) | Use `subagent` tool chains |
| The `team_create` tool is available AND the task is non-trivial (multi-file, needs review) | **Offer team mode** | Ask: "Want me to spawn a visual team for this, or handle it inline?" |
| Only `subagent` is available (no team-tmux extension) | **Subagent mode** | Only option |

### Team mode

When using team mode, follow the `jira-team-ticket` skill instructions (in `~/.pi/agent/skills/jira-team-ticket/SKILL.md`). The key difference: agents run in **visible tmux panes** with inter-agent `send_message` communication, and the team-lead (this session) coordinates via `team_send` / incoming team messages.

Team mode workflow: `team_create` → `team_spawn` reviewer, tester, implementer → agents self-coordinate → implementer reports PR → `team_destroy`.

### Subagent mode

When using subagent mode, follow the existing subagent chain/parallel patterns below. Agents run headlessly and return results to this session.

## Operating constraints

- Support **single Jira tickets** end-to-end. Do not skip the teammate gates just because there is only one ticket.
- For multiple independent Jira tickets, prefer isolated git worktrees and run ticket analysis/planning in parallel.
- **Strictly assume Jira conventions:**
  - Prefer `jira issue view <KEY> --plain` for reading tickets.
  - Prefer any existing project-specific ticket-creation skill when the user asks to create a ticket in that project's Jira project.
  - Prefer Gradle/Java conventions and `./gradlew spotlessApply` when the repo indicates them.
  - Respect AGENTS.md / CLAUDE.md for branch names, test commands, PR templates, and AI footer conventions.
- Never silently expand scope. Ask the user if scope balloons, acceptance criteria are missing, or tickets conflict.
- Do not create planning markdown files in the repo unless explicitly asked. Keep orchestration state in the conversation.

## Entry modes

### Plan only
Use when the user asks to plan/research a Jira ticket without implementation.

1. Run a `subagent` chain:
   - `ticket-jira-analyst`: read and summarize the Jira ticket(s).
   - `ticket-scout`: investigate the repo for relevant files/tests/commands.
   - `ticket-planner`: produce a concrete implementation plan.
2. Present the plan and blockers to the user.
3. Do not edit code.

### Single ticket end-to-end
Use when the user asks to implement or complete one Jira ticket.

1. Confirm/detect repo root:
   - `git rev-parse --show-toplevel`
   - `git status -sb`
2. Refuse to proceed if there are unrelated dirty changes that implementation could overwrite. Ask the user how to handle them.
3. Run the planning chain:
   - `ticket-jira-analyst`
   - `ticket-scout`
   - `ticket-planner`
4. If the plan says user clarification is needed, stop and ask.
5. Unless the user has asked for autonomous execution, summarize the plan and ask before editing.
6. Run `ticket-implementer` with the Jira analysis + recon + plan.
7. Run review and test gates:
   - `ticket-reviewer` against the diff.
   - `ticket-tester` with exact commands from implementer/plan.
8. If reviewer requests changes or tests fail, run `ticket-implementer` again with the feedback, then repeat review/test. Limit to 3 loops before asking the user.
9. Run `ticket-validator` with all prior outputs.
10. If validated and the user requested commit/PR:
    - Stage specific files only.
    - Commit with a conventional commit and required project footer if present.
    - Push with correct upstream; for worktrees created from `origin/<base>`, use `git push -u origin <branch>`.
    - Create draft PR with `gh pr create --draft`, using PR template if present.
    - If project convention requires AI review, add the appropriate PR comment (e.g. `@codex review`).
11. Report summary, changed files, tests, validation, commit SHA, and PR URL.

### Multiple tickets in parallel
Use when the user gives 2-5 independent **Jira** tickets and wants them tackled as a batch.

Preconditions:
- Refuse or ask to batch smaller if more than 5 tickets.
- Ensure source repo is clean enough for worktree creation.
- Detect base branch from AGENTS.md/CLAUDE.md, `origin/HEAD`, or `main`/`master`/`prod` heuristic.
- Ask for worktree root if not obvious.

Worktree setup:
```bash
cd <repo-root>
git fetch origin <base-branch>
git worktree add -b <branch-prefix>/<TICKET>-<kebab-title> <worktree-root>/<repo-name>-<TICKET> origin/<base-branch>
```

For each ticket, run its own single-ticket workflow in its own worktree. Use `subagent` parallel mode for independent steps where practical, but keep each ticket's review/test/validation gate ordered.

Commit/PR rules mirror the single-ticket flow.

### Ticket creation
If the user asks to create/file a **Jira ticket**:
1. Use/read any project-specific ticket-creation skill if one is installed for that Jira project.
2. Ensure the ticket has a parent epic. If ambiguous, ask.
3. After creation, optionally run this workflow's plan-only mode on the new ticket.

## Recommended subagent calls

Planning chain template:
```json
{
  "chain": [
    {"agent": "ticket-jira-analyst", "task": "Analyze ticket(s): <Jira ticket keys/URLs>. Include Jira text, scope, acceptance criteria, risks, and recommendation."},
    {"agent": "ticket-scout", "task": "Using the Jira analysis below, investigate this repo for relevant implementation files, tests, and commands.\n\n{previous}"},
    {"agent": "ticket-planner", "task": "Create an implementation plan from the Jira analysis and codebase recon below.\n\n{previous}"}
  ]
}
```

<!-- REFAC: Extract this block to `ticket-analyst` subagent definition later -->
Implementation call template:
```json
{
  "agent": "ticket-implementer",
  "cwd": "<repo-or-worktree-root>",
  "task": "Implement this Jira ticket using the analysis/recon/plan below. Do not commit or push.\n\n<analysis + recon + plan>"
}
```

Review call template:
```json
{
  "agent": "ticket-reviewer",
  "cwd": "<repo-or-worktree-root>",
  "task": "Review the current diff against Jira ticket <KEY>, base branch <base>, and this plan/result. Return APPROVED or CHANGES REQUESTED.\n\n<context>"
}
```

Tester call template:
```json
{
  "agent": "ticket-tester",
  "cwd": "<repo-or-worktree-root>",
  "task": "Run these validation commands and report PASS/FAIL: <commands>. Context: <Jira ticket + implementation summary>"
}
```

Validator call template:
```json
{
  "agent": "ticket-validator",
  "cwd": "<repo-or-worktree-root>",
  "task": "Validate final readiness for Jira ticket <KEY> using Jira analysis, plan, implementation result, review result, and test result below.\n\n<context>"
}
```

## Output to user

At the end of any workflow, provide:
- Ticket key(s) and current status.
- Which teammates ran and their gate results.
- Changed files, if any.
- Commands run and pass/fail.
- Open blockers or risks.
- Commit/PR URL if created.

## Anti-patterns

- **Don't** use this skill with non-Jira tickets (e.g., `PROJ-1234`, `GH-567`).
- **Don't** implement before fetching/understanding the Jira ticket.
- **Don't** skip tests or claim tests without running them.
- **Don't** skip review/validation gates for single tickets.
- **Don't** auto-fix human PR review comments by default; surface them to the user.
- **Don't** create many worktrees/branches without checking repo cleanliness and base branch.
- **Don't** let subagents write persistent planning files unless the user asked.
Updated trigger docs for Jira ticket keys
