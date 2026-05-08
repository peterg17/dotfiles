# Pi configuration

This directory contains dotfiles-managed configuration for [`pi`](https://pi.dev), including skills, prompt templates, agents, and extensions.

## Ticket teammate workflow

The ticket workflow is a pi adaptation of the Claude `parallel-tickets` workflow. It uses the `subagent` extension plus specialized teammate agents to handle technical Jira work end-to-end.

### Installed resources

- Skill: `pi/skills/ticket-workflow/SKILL.md`
- Extension: `pi/extensions/subagent/`
- Agents:
  - `ticket-jira-analyst` — reads/summarizes Jira tickets
  - `ticket-scout` — investigates relevant code/tests/commands
  - `ticket-planner` — creates implementation plans
  - `ticket-implementer` — edits code and runs focused validation
  - `ticket-reviewer` — reviews diffs without editing
  - `ticket-tester` — runs requested validation commands
  - `ticket-validator` — checks acceptance criteria readiness
- Prompt templates:
  - `/plan-ticket`
  - `/ticket`
  - `/tickets`
  - `/review-ticket`

After changing these files, run `/reload` inside pi.

### Common usage

Plan a ticket without editing:

```text
/plan-ticket PROJ-123
```

Work a single ticket end-to-end:

```text
/ticket PROJ-123
```

By default this:

1. Reads the Jira ticket.
2. Runs the teammate planning chain: analyst → scout → planner.
3. Asks before editing unless you explicitly requested autonomous execution.
4. Runs implementation.
5. Runs reviewer, tester, and validator gates.
6. Does not commit, push, or open a PR unless explicitly asked.

Work multiple independent tickets:

```text
/tickets PROJ-123 PROJ-456
```

This is intended for 2–5 independent tickets. It follows a worktree-based flow so each ticket can be implemented independently.

Review the current diff against a ticket:

```text
/review-ticket PROJ-123
```

### Commit / PR behavior

The workflow will not commit, push, or create PRs unless you explicitly ask, e.g.:

```text
/ticket PROJ-123 proceed autonomously and open a draft PR if validation passes
```

When creating PRs, the workflow is instructed to:

- stage specific files only
- use conventional commits
- preserve project-required AI footers from AGENTS.md/CLAUDE.md
- use `git push -u origin <branch>` for new worktree branches
- create draft PRs with `gh pr create --draft`

### Jira workflow bias

This workflow is intentionally biased toward Peter's typical Jira-based workflow:

- uses `jira issue view <KEY> --plain` when possible
- respects AGENTS.md/CLAUDE.md for repo conventions
- assumes Java/Gradle/Spotless conventions when applicable
- delegates project-specific ticket creation to any installed per-project ticket-creation skill

### Troubleshooting

If pi does not show the new commands or skill:

```text
/reload
```

If you see skill frontmatter errors, check YAML quoting in `pi/skills/ticket-workflow/SKILL.md`.

If the `subagent` tool is unavailable, verify these symlinks exist after running `./install`:

```sh
ls ~/.pi/agent/extensions/subagent/index.ts
ls ~/.pi/agent/agents/ticket-planner.md
ls ~/.pi/agent/skills/ticket-workflow/SKILL.md
```
