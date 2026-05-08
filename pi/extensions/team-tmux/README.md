# team-tmux

Visual agent teams in tmux for pi — the equivalent of [Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams).

Each agent runs in its own tmux pane with full interactive UI. Agents communicate via a `send_message` tool backed by file-based IPC. The team lead (your main pi session) coordinates via `team_create`, `team_spawn`, `team_send`, `team_watch_pr`, and `team_status` tools.

Supports **1–5 tickets in parallel**: one implementer per ticket (each in its own worktree), shared reviewer and tester, with automatic PR review comment polling that dispatches Codex feedback to implementers and surfaces human comments to the team lead.

## Visual Layout

When already in tmux, `team_create` opens a **new window** (tab) and switches to it automatically — you see agents boot up live:

```
┌────────────── Your tmux session ──────────────┐
│                                                │
│  Window 0: team-lead (your pi session)         │
│                                                │
│  Window 1: pi-team-ticket-proj-12345           │
│  ┌──────────────────────────────────────────┐  │
│  │  @reviewer                               │  │
│  ├──────────────────────────────────────────┤  │
│  │  @impl-proj-12345                        │  │
│  ├──────────────────────────────────────────┤  │
│  │  @impl-proj-12346                        │  │
│  ├──────────────────────────────────────────┤  │
│  │  @tester                                 │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  Switch: Ctrl-b w (window picker)              │
│          Ctrl-b p (previous window)            │
└────────────────────────────────────────────────┘
```

When not in tmux, a detached session is created and you attach with `tmux attach -t <name>`.

## How It Works

### Architecture

1. **Team lead** (your pi session) registers orchestration tools
2. **tmux window** (or detached session) hosts visual panes for each agent
3. **File-based IPC** in `/tmp/pi-team-<name>/` provides messaging
4. **Teammate extension** gives each agent a `send_message` tool + inbox polling
5. **PR watcher** polls GitHub PRs for review comments, classifies and routes them

### Message Flow

```
team-lead ──team_send──► /tmp/.../inbox/reviewer/msg.json
                                  │
                                  ▼
                         reviewer pi instance
                         (polls inbox every 2s)
                                  │
                         send_message tool
                                  │
                                  ▼
/tmp/.../inbox/team-lead/msg.json ◄──────────────
                    │
                    ▼
           team-lead pi instance
           (arrives as team-message)
```

### PR Comment Flow

```
team_watch_pr ──(every 5 min)──► gh pr view --json comments
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
              Codex / AI          Human reviewer         Bot noise
              comment             comment                 
                    │                   │                   │
                    ▼                   ▼                   ▼
          send_message to       surface to             skip silently
          implementer           team-lead
          "AUTO-HANDLE: fix     "review and decide
           as new commit"        how to respond"
```

## Tools

| Tool | Side | Description |
|------|------|-------------|
| `team_create` | Team lead | Create a team + tmux window/session |
| `team_spawn` | Team lead | Spawn an agent in a new tmux pane |
| `team_send` | Team lead | Send a message to an agent |
| `team_status` | Team lead | Show live team status |
| `team_watch_pr` | Team lead | Poll a PR for review comments — auto-handle Codex, surface human |
| `team_unwatch_pr` | Team lead | Stop polling a specific PR |
| `team_destroy` | Team lead | Tear down team: kill tmux, agents, PR watchers, cleanup |
| `send_message` | Teammate | Send a message to any team member |

## Commands

| Command | Description |
|---------|-------------|
| `/team` | Quick team status overview |

## Usage

### Single Ticket

```
Spawn a team for PROJ-12345
```

or explicitly:

```
/skill:team-ticket PROJ-12345
```

### Multiple Tickets (Parallel)

```
Tackle PROJ-12345 and PROJ-12346 with a visual team
```

or:

```
/skill:team-ticket PROJ-12345 PROJ-12346 PROJ-12347
```

Each ticket gets its own implementer + worktree. Reviewer and tester are shared.

### With Agent Definitions

Agent definitions from `~/.pi/agent/agents/` provide system prompts, model, and tool configuration:

```
Spawn a team for PROJ-12345 using the ticket-implementer, ticket-reviewer, and ticket-tester agents.
```

### Viewing Agents

```bash
# In tmux (usual case): use the window picker
Ctrl-b w

# Or switch to previous window
Ctrl-b p

# If not in tmux:
tmux attach -t pi-team-<name>
```

Each pane shows the agent name in the border: `@reviewer`, `@impl-proj-12345`, etc.

### PR Comment Watching

After an implementer opens a PR and posts `@codex review`:

```
team_watch_pr { pr: "https://github.com/org/repo/pull/123", implementer: "impl-proj-12345" }
```

Comment classification:
- **Codex / AI** (`codex`, `chatgpt*`, `copilot*`) → dispatched to implementer to fix as a new commit
- **Human** (any non-bot) → surfaced to team-lead. No auto-fix, no auto-reply.
- **Bots** (`[bot]`, `devflow`, `dependabot`, approvals) → skipped

Stop watching: `team_unwatch_pr { pr: "..." }` or `team_destroy` (stops all).

### Skill Integration

Use the `team-ticket` skill for a fully guided workflow:

```
/skill:team-ticket PROJ-12345: fix the timeline endpoint for native profiles
```

The skill handles: context gathering → worktree creation → team creation → agent spawning → monitoring → PR watching → cleanup.

## Complete Ticket Flow

```
1. team_create { name: "ticket-proj-12345" }
2. team_spawn { name: "reviewer", ... }
3. team_spawn { name: "tester", ... }
4. team_spawn { name: "impl-proj-12345", ... }    # one per ticket
5. (agents self-coordinate: implement → review → test → commit → PR)
6. team_watch_pr { pr: "<PR-URL>", implementer: "impl-proj-12345" }
7. (Codex comments auto-fixed, human comments surfaced)
8. team_destroy    # when done
```

## File Structure

```
~/.pi/agent/extensions/team-tmux/
├── index.ts        # Team lead extension (tools + commands + PR watcher)
├── teammate.ts     # Teammate extension (send_message + inbox polling)
├── ipc.ts          # File-based IPC utilities
└── README.md
```

## Requirements

- **tmux 3.2+** (`brew install tmux` / `apt install tmux`)
- **pi** (the coding agent)
- **gh** CLI (for `team_watch_pr` PR comment polling)

## IPC Directory Layout

```
/tmp/pi-team-<name>-<id>/
├── meta.json                  # Team name, members, tmux target info
├── inbox/<agent>/*.json       # Pending messages (consumed on read)
├── status/<agent>.json        # Agent state (starting/idle/working/done/error)
├── prompts/<agent>.md         # System prompt files
├── tasks/<agent>.md           # Initial tasks (consumed on startup)
└── scripts/<agent>.sh         # Launch scripts
```

## Differences from Claude Code Agent Teams

| Feature | Claude Code | team-tmux |
|---------|-------------|-----------|
| Agent runtime | Built-in subprocess | pi interactive in tmux pane |
| Visibility | Embedded in Claude Code TUI | tmux window in current session |
| Communication | Native `SendMessage` | File-based IPC + `send_message` tool |
| PR polling | `CronCreate` (hourly) | `team_watch_pr` (every 5 min, configurable) |
| Task tracking | `TaskCreate`/`TaskUpdate` | Conversation-based |
| Multi-ticket | One implementer per ticket | Same — one implementer per ticket, shared reviewer/tester |
| Background mode | `run_in_background: true` | Always visual in tmux |
| Session lifecycle | Session-bound | Session-bound (same) |

## Tips

- **Widget**: The team lead shows a status widget above the editor with agent states
- **Message rendering**: Incoming team messages render with `@sender → @team-lead` header
- **Session restore**: If pi restarts, it re-discovers the team from session state
- **tmux integration**: When in tmux, teams open as a new window — no separate session to manage
- **PR polling**: Seeds existing comments so only NEW ones trigger actions
- **Cleanup**: `team_destroy` kills the tmux window, all agent processes, and all PR watchers
