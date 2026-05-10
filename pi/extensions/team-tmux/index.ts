/**
 * team-tmux — Pi extension for visual agent teams in tmux.
 *
 * Registers tools that let the LLM (or the user) orchestrate a team of
 * pi agents, each running in its own tmux pane with full interactive UI.
 *
 * Tools:
 *   team_create   – create a team + tmux session
 *   team_spawn    – spawn an agent in a new tmux pane
 *   team_send     – send a message to an agent
 *   team_status   – show live team status
 *   team_destroy  – tear down the team
 *
 * Commands:
 *   /team          – quick team status overview
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getAgentDir, parseFrontmatter, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import {
	createTeamDir,
	ensureInbox,
	pollMessages,
	readAllStatus,
	readMeta,
	sendMessage,
	writeMeta,
	writeStatus,
	type AgentStatus,
	type TeamMeta,
	type TmuxTarget,
} from "./ipc.js";

// ── Constants ──────────────────────────────────────────────────────

const POLL_MS = 2000;
const WIDGET_REFRESH_MS = 3000;

// Path to the teammate extension that gets loaded into each spawned pi.
// Try multiple approaches since jiti's import.meta.url support varies.
const EXTENSION_DIR = (() => {
	// 1. Try import.meta.url (ESM / newer jiti)
	try {
		const { fileURLToPath } = require("node:url");
		const dir = path.dirname(fileURLToPath(import.meta.url));
		if (fs.existsSync(path.join(dir, "teammate.ts"))) return dir;
	} catch { /* fallthrough */ }
	// 2. Try __dirname (CJS / jiti CJS mode)
	try {
		if (typeof __dirname === "string" && fs.existsSync(path.join(__dirname, "teammate.ts"))) {
			return __dirname;
		}
	} catch { /* fallthrough */ }
	// 3. Well-known path (auto-discovered extensions location)
	return path.join(os.homedir(), ".pi", "agent", "extensions", "team-tmux");
})();
const TEAMMATE_EXT = path.join(EXTENSION_DIR, "teammate.ts");

// ── Agent color palette for tmux pane borders ──────────────────────

const AGENT_COLORS: string[] = [
	"colour45",   // turquoise
	"colour82",   // bright green
	"colour213",  // hot pink
	"colour147",  // lavender
	"colour203",  // coral/salmon
	"colour228",  // light yellow
	"colour87",   // cyan
	"colour214",  // amber/gold
];
const DASHBOARD_COLOR = "colour117"; // sky blue for team-lead dashboard

/**
 * Build a tmux pane-border-format string that assigns a different color
 * to each pane based on its index.  Uses nested #{?...} conditionals.
 */
function buildPaneBorderFormat(paneColors: Map<number, string>): string {
	const DEFAULT_COLOR = "colour250";
	let inner = `#[fg=${DEFAULT_COLOR}]`;
	// Build inside-out: innermost = default, wrap with conditionals
	const entries = Array.from(paneColors.entries()).sort((a, b) => b[0] - a[0]);
	for (const [idx, color] of entries) {
		inner = `#{?#{==:#{pane_index},${idx}},#[fg=${color}],${inner}}`;
	}
	return ` ${inner}#[bold]#{pane_title}#[default] `;
}

/** Apply the current pane color border format to the team window.
 *  Uses `#{@agent_name}` (per-pane user option) instead of `#{pane_title}`
 *  because pi overwrites the terminal title which tmux uses for pane_title. */
function applyBorderFormat(team: TeamState): void {
	const borderFmt = buildPaneBorderFormat(team.paneColors);
	// Swap #{pane_title} for #{@agent_name} so pi can't override the label
	const fmt = borderFmt.replace(/#{pane_title}/g, "#{@agent_name}");
	const windowTarget = team.meta.tmuxTarget?.windowId ?? `${team.meta.tmuxSession}:0`;
	try {
		execSync(
			`tmux set-window-option -t ${shellEscape(windowTarget)} pane-border-format "${fmt}"`,
			{ stdio: "pipe" },
		);
	} catch {
		// Fallback: simple format
		try {
			execSync(
				`tmux set-window-option -t ${shellEscape(windowTarget)} pane-border-format " #[bold]#{@agent_name}#[default] "`,
				{ stdio: "ignore" },
			);
		} catch { /* give up */ }
	}
}

/** Set the agent name label on a tmux pane (uses @agent_name user option). */
function setPaneLabel(paneId: string, label: string): void {
	try {
		execSync(`tmux set-option -p -t ${shellEscape(paneId)} @agent_name ${shellEscape(label)}`, {
			stdio: "ignore",
		});
	} catch { /* best effort */ }
}

/** Apply main-vertical layout with dashboard on the left at 25%. */
function applyMainVerticalLayout(target: string): void {
	try {
		execSync(`tmux select-layout -t ${shellEscape(target)} main-vertical`, { stdio: "pipe" });
	} catch { /* layout may fail if window is too small */ }
}

/**
 * Write a bash dashboard script that shows live team status.
 * Returns the script path.
 */
function writeDashboardScript(teamDir: string, teamName: string): string {
	const scriptPath = path.join(teamDir, "scripts", "dashboard.sh");
	const script = `#!/bin/bash
set -u
TEAM_DIR="${teamDir}"
TEAM_NAME="${teamName}"

# Hide cursor during rendering to avoid flicker
trap 'printf "\\033[?25h"' EXIT
printf '\\033[?25h'

# One-time clear on first render
clear

pad() {
  # Print a line padded to terminal width (overwrites stale content)
  local text="\$1"
  printf '%s' "\$text"
  printf '\\033[K\\n'  # clear to end of line, then newline
}

while true; do
  printf '\\033[H'  # cursor home (no clear — avoids flicker)
  COLS=$(tput cols 2>/dev/null || echo 40)
  ROWS=$(tput lines 2>/dev/null || echo 24)

  pad ""
  pad "  \\033[1;36m📋 \${TEAM_NAME}\\033[0m"
  pad "  \\033[2m$(date '+%H:%M:%S')\\033[0m"
  SEP=$(printf '─%.0s' $(seq 1 $((COLS - 4))))
  pad "  \\033[2m\${SEP}\\033[0m"
  pad ""

  for f in "\$TEAM_DIR"/status/*.json; do
    [ -f "\$f" ] || continue
    INFO=$(python3 -c "
import json, time
try:
    d = json.load(open('\$f'))
    name = d.get('name', '?')
    state = d.get('state', '?')
    ts = d.get('lastActivity', 0)
    age = max(0, int((time.time() * 1000 - ts) / 1000))
    age_str = f'{age}s' if age < 60 else f'{age//60}m'
    print(f'{name}|{state}|{age_str}')
except: pass
" 2>/dev/null)
    [ -z "\$INFO" ] && continue
    IFS='|' read -r name state age_str <<< "\$INFO"
    case "\$state" in
      working)  ic="\\033[32m◉\\033[0m" ;;
      idle)     ic="\\033[33m●\\033[0m" ;;
      starting) ic="\\033[33m◌\\033[0m" ;;
      done)     ic="\\033[32m✓\\033[0m" ;;
      error)    ic="\\033[31m✗\\033[0m" ;;
      *)        ic="\\033[2m?\\033[0m" ;;
    esac
    pad "  \$ic  \\033[1m@\${name}\\033[0m"
    pad "     \\033[2m\${state} · \${age_str}\\033[0m"
    pad ""
  done

  if [ -f "\$TEAM_DIR/messages.log" ] && [ -s "\$TEAM_DIR/messages.log" ]; then
    pad "  \\033[2m\${SEP}\\033[0m"
    pad "  \\033[1mMessages\\033[0m"
    pad ""
    MAX_LINES=$((ROWS - 18))
    [ "\$MAX_LINES" -lt 3 ] && MAX_LINES=3
    tail -"\$MAX_LINES" "\$TEAM_DIR/messages.log" | while IFS= read -r line; do
      if [ \${#line} -gt $((COLS - 4)) ]; then
        pad "  \\033[2m\${line:0:$((COLS - 7))}…\\033[0m"
      else
        pad "  \\033[2m\${line}\\033[0m"
      fi
    done
  fi

  # Clear any remaining lines from previous render
  printf '\\033[J'

  sleep 2
done
`;
	fs.writeFileSync(scriptPath, script, { mode: 0o755, encoding: "utf-8" });
	return scriptPath;
}

// ── Agent definition loader ────────────────────────────────────────

interface AgentDef {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
}

function loadAgentDef(name: string): AgentDef | null {
	const agentDir = path.join(getAgentDir(), "agents");
	const filePath = path.join(agentDir, `${name}.md`);
	if (!fs.existsSync(filePath)) return null;
	try {
		const raw = fs.readFileSync(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(raw);
		if (!frontmatter.name) return null;
		const tools = frontmatter.tools
			?.split(",")
			.map((t: string) => t.trim())
			.filter(Boolean);
		return {
			name: frontmatter.name,
			description: frontmatter.description ?? "",
			tools: tools?.length ? tools : undefined,
			model: frontmatter.model,
			systemPrompt: body,
		};
	} catch {
		return null;
	}
}

function listAgentDefs(): string[] {
	const agentDir = path.join(getAgentDir(), "agents");
	if (!fs.existsSync(agentDir)) return [];
	return fs
		.readdirSync(agentDir)
		.filter((f) => f.endsWith(".md"))
		.map((f) => f.replace(/\.md$/, ""));
}

// ── Pi executable helper ───────────────────────────────────────────

function getPiBin(): { command: string; args: string[] } {
	const script = process.argv[1];
	const isBunVirtual = script?.startsWith("/$bunfs/root/");
	if (script && !isBunVirtual && fs.existsSync(script)) {
		return { command: process.execPath, args: [script] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	if (/^(node|bun)(\.exe)?$/.test(execName)) {
		return { command: "pi", args: [] };
	}
	return { command: process.execPath, args: [] };
}

// ── tmux helpers ───────────────────────────────────────────────────

function hasTmux(): boolean {
	try {
		execSync("which tmux", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function isInTmux(): boolean {
	return !!process.env.TMUX;
}

function tmuxSessionExists(name: string): boolean {
	try {
		execSync(`tmux has-session -t "${name}" 2>/dev/null`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

function sanitizeTmuxName(name: string): string {
	return name.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 64);
}

function currentTmuxSession(): string | null {
	if (!isInTmux()) return null;
	try {
		return execSync("tmux display-message -p '#S'", { encoding: "utf-8" }).trim();
	} catch {
		return null;
	}
}

/** Resolve the pane-addressable tmux target string from a TmuxTarget. */
function paneTarget(t: TmuxTarget): string {
	return t.type === "window" ? t.windowId : `${t.session}:0`;
}

// ── Team state ─────────────────────────────────────────────────────

interface TeamState {
	teamDir: string;
	meta: TeamMeta;
	spawnCount: number;
	paneColors: Map<number, string>; // pane_index → tmux color for border format
	agentPaneIds: string[];           // pane IDs to kill on destroy
	originalBorderStatus: string;     // restore on destroy
}

// ── Extension entry ────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// If this pi instance is a teammate, the main extension is a no-op.
	if (process.env.PI_TEAM_AGENT) return;

	let team: TeamState | null = null;
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let widgetTimer: ReturnType<typeof setInterval> | null = null;
	let isStreaming = false;
	let uiTheme: any = null;
	let uiSetWidget: ((name: string, content: string[] | undefined) => void) | null = null;
	let uiSetStatus: ((key: string, value: string | undefined) => void) | null = null;

	// ── Streaming tracking ────────────────────────────────────────

	pi.on("agent_start", async () => {
		isStreaming = true;
	});
	pi.on("agent_end", async () => {
		isStreaming = false;
	});

	// ── Message polling (team-lead inbox) ──────────────────────────

	function startPolling(): void {
		if (pollTimer || !team) return;
		ensureInbox(team.teamDir, "team-lead");
		pollTimer = setInterval(() => {
			if (!team) return;
			const msgs = pollMessages(team.teamDir, "team-lead");
			for (const msg of msgs) {
				pi.sendMessage(
					{
						customType: "team-message",
						content: `[Message from @${msg.from}]:\n${msg.content}`,
						display: true,
						details: { from: msg.from, timestamp: msg.timestamp },
					},
					{ triggerTurn: true, deliverAs: "followUp" },
				);
			}
		}, POLL_MS);
	}

	function stopPolling(): void {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	// ── Widget (status display above editor) ──────────────────────

	function refreshWidget(): void {
		if (!team || !uiSetWidget || !uiTheme) return;
		const t = uiTheme;
		const statuses = readAllStatus(team.teamDir);
		if (statuses.length === 0) {
			uiSetWidget("team-status", [t.fg("dim", `Team: ${team.meta.name} (no agents spawned)`)]);
			return;
		}
		const lines: string[] = [];
		const stateIcons: Record<string, string> = {
			starting: "◌",
			idle: "●",
			working: "◉",
			done: "✓",
			error: "✗",
		};
		const stateColors: Record<string, string> = {
			starting: "warning",
			idle: "muted",
			working: "accent",
			done: "success",
			error: "error",
		};
		for (const s of statuses) {
			const icon = stateIcons[s.state] ?? "?";
			const color = stateColors[s.state] ?? "dim";
			const age = Math.round((Date.now() - s.lastActivity) / 1000);
			const ageStr = age < 60 ? `${age}s` : `${Math.floor(age / 60)}m`;
			lines.push(
				`  ${t.fg(color, icon)} ${t.fg("accent", `@${s.name}`)}  ${t.fg("dim", s.state)}  ${t.fg("dim", ageStr + " ago")}`,
			);
		}
		const tmuxLabel = team.meta.tmuxTarget?.type === "window"
			? `window: ${team.meta.tmuxTarget.windowName}`
			: `session: ${team.meta.tmuxSession}`;
		const header = t.fg("accent", t.bold(`Team: ${team.meta.name}`)) + t.fg("dim", ` · ${tmuxLabel}`);
		uiSetWidget("team-status", [header, ...lines]);
	}

	function startWidgetRefresh(): void {
		if (widgetTimer) return;
		refreshWidget();
		widgetTimer = setInterval(refreshWidget, WIDGET_REFRESH_MS);
	}

	function stopWidgetRefresh(): void {
		if (widgetTimer) {
			clearInterval(widgetTimer);
			widgetTimer = null;
		}
		uiSetWidget?.("team-status", undefined);
	}

	// ── Custom message renderer for team messages ─────────────────

	pi.registerMessageRenderer("team-message", (message, _options, theme) => {
		const from = message.details?.from ?? "teammate";
		let text = theme.fg("accent", theme.bold(`@${from}`));
		text += theme.fg("muted", " → ");
		text += theme.fg("accent", "@team-lead");
		text += "\n";
		const body = (message.content as string).replace(/^\[Message from @[^\]]+\]:\s*/m, "").trim();
		text += body;
		return new Text(text, 0, 0);
	});

	// ── Session lifecycle ─────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		uiTheme = ctx.ui.theme;
		uiSetWidget = (name, content) => ctx.ui.setWidget(name, content as any);
		uiSetStatus = (key, value) => ctx.ui.setStatus(key, value);

		// Restore team state from session entries (if pi was restarted)
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom" && entry.customType === "team-state") {
				const data = entry.data as { teamDir: string };
				if (data?.teamDir && fs.existsSync(path.join(data.teamDir, "meta.json"))) {
					const meta = readMeta(data.teamDir);
					if (!meta) continue;
					// Verify the tmux target still exists
					const alive =
						meta.tmuxTarget?.type === "window"
							? (() => {
									try {
										execSync(
											`tmux display-message -t ${shellEscape(meta.tmuxTarget!.windowId)} -p ok`,
											{ stdio: "pipe" },
										);
										return true;
									} catch {
										return false;
									}
								})()
							: tmuxSessionExists(meta.tmuxSession);
					if (alive) {
						team = { teamDir: data.teamDir, meta, spawnCount: meta.members.length - 1, paneColors: new Map(), agentPaneIds: [], originalBorderStatus: "off" };
						startPolling();
						startWidgetRefresh();
						uiSetStatus("team", `Team: ${meta.name}`);
					}
				}
			}
		}
	});

	pi.on("session_shutdown", async () => {
		stopPolling();
		stopWidgetRefresh();
	});

	// ── Helper: write launch script ───────────────────────────────

	function writeLaunchScript(
		teamDir: string,
		agentName: string,
		members: string[],
		appendPromptFile: string | null,
		extraArgs: string[],
	): string {
		const pi = getPiBin();
		const scriptPath = path.join(teamDir, "scripts", `${agentName}.sh`);

		let script = "#!/bin/bash\n";
		script += `export PI_TEAM_DIR="${teamDir}"\n`;
		script += `export PI_TEAM_AGENT="${agentName}"\n`;
		script += `cd "${process.cwd()}"\n\n`;

		const args: string[] = [...pi.args, "-e", TEAMMATE_EXT, "--no-session"];
		if (appendPromptFile) args.push("--append-system-prompt", appendPromptFile);
		args.push(...extraArgs);

		script += `exec ${pi.command} ${args.map(shellEscape).join(" ")}\n`;
		fs.writeFileSync(scriptPath, script, { mode: 0o755, encoding: "utf-8" });
		return scriptPath;
	}

	// ── Tools ─────────────────────────────────────────────────────

	pi.registerTool({
		name: "team_create",
		label: "Create Team",
		description:
			"Create a new agent team with a tmux session for visual display. " +
			"Call this once before spawning agents with team_spawn.",
		promptSnippet: "Create a named agent team backed by a tmux session",
		promptGuidelines: [
			"Call team_create once before using team_spawn, team_send, or team_status.",
			"Only one team can be active per session — destroy the old one first if needed.",
		],
		parameters: Type.Object({
			name: Type.String({ description: "Team name (e.g. 'fix-login-bug' or 'ticket-XYZ-123')" }),
		}),

		renderCall(args, theme) {
			return new Text(
				theme.fg("toolTitle", theme.bold("team_create ")) + theme.fg("accent", args.name ?? "..."),
				0,
				0,
			);
		},

		async execute(_id, params, _signal, _onUpdate, ctx) {
			if (team) throw new Error(`Team "${team.meta.name}" already active. Call team_destroy first.`);
			if (!hasTmux()) throw new Error("tmux is not installed. Install it with: brew install tmux");

			const teamDir = createTeamDir(params.name);
			const tmuxName = `pi-team-${sanitizeTmuxName(params.name)}`;

			// ── Create tmux target ─────────────────────────────────
			// When we're already inside tmux, open a new *window*
			// (tab) in the current session and switch to it so the
			// user sees the agents booting up immediately.
			// Otherwise fall back to a standalone detached session.

			let tmuxTarget: TmuxTarget;
			const existingSession = currentTmuxSession();

			let originalBorderStatus = "off";

			if (existingSession) {
				// ── In tmux: use current window (team-lead stays in its pane) ──
				const windowId = execSync(
					`tmux display-message -p "#{window_id}"`,
					{ encoding: "utf-8" },
				).trim();

				// Save original border status so we can restore on destroy
				try {
					originalBorderStatus = execSync(
						`tmux show-window-option -v -t ${shellEscape(windowId)} pane-border-status 2>/dev/null || echo off`,
						{ encoding: "utf-8" },
					).trim() || "off";
				} catch { originalBorderStatus = "off"; }

				// Configure pane borders for this window
				execSync(
					`tmux set-window-option -t ${shellEscape(windowId)} pane-border-status top`,
					{ stdio: "ignore" },
				);
				execSync(
					`tmux set-window-option -t ${shellEscape(windowId)} pane-border-format " #[fg=${DASHBOARD_COLOR},bold]#{@agent_name}#[default] "`,
					{ stdio: "ignore" },
				);
				execSync(
					`tmux set-window-option -t ${shellEscape(windowId)} main-pane-width '25%'`,
					{ stdio: "ignore" },
				);
				execSync(
					`tmux set-window-option -t ${shellEscape(windowId)} allow-rename off`,
					{ stdio: "ignore" },
				);

				// Label the current pane as team-lead
				const teamLeadPaneId = execSync(
					`tmux display-message -p "#{pane_id}"`,
					{ encoding: "utf-8" },
				).trim();
				setPaneLabel(teamLeadPaneId, "📊 team-lead");

				tmuxTarget = {
					type: "window",
					session: existingSession,
					windowId,
					windowName: tmuxName,
				};
			} else {
				// ── Not in tmux: standalone session ────────────────
				if (tmuxSessionExists(tmuxName)) {
					throw new Error(
						`tmux session "${tmuxName}" already exists. Pick a different name or destroy it.`,
					);
				}

				execSync(`tmux new-session -d -s ${shellEscape(tmuxName)} -x 220 -y 60`, {
					stdio: "ignore",
				});
				execSync(
					`tmux set-option -t ${shellEscape(tmuxName)} pane-border-status top`,
					{ stdio: "ignore" },
				);
				execSync(
					`tmux set-option -t ${shellEscape(tmuxName)} pane-border-format " #[fg=${DASHBOARD_COLOR},bold]#{@agent_name}#[default] "`,
					{ stdio: "ignore" },
				);
				execSync(
					`tmux set-option -t ${shellEscape(tmuxName)} status-left " #[fg=colour214,bold]${tmuxName}#[default] │ "`,
					{ stdio: "ignore" },
				);
				execSync(
					`tmux set-option -t ${shellEscape(tmuxName)} status-left-length 50`,
					{ stdio: "ignore" },
				);
				execSync(
					`tmux set-option -t ${shellEscape(tmuxName)} main-pane-width '25%'`,
					{ stdio: "ignore" },
				);
				execSync(
					`tmux set-option -t ${shellEscape(tmuxName)} allow-rename off`,
					{ stdio: "ignore" },
				);
				execSync(
					`tmux set-option -t ${shellEscape(tmuxName)} automatic-rename off`,
					{ stdio: "ignore" },
				);

				const windowId = execSync(
					`tmux display-message -t ${shellEscape(tmuxName)} -p "#{window_id}"`,
					{ encoding: "utf-8" },
				).trim();

				tmuxTarget = {
					type: "session",
					session: tmuxName,
					windowId,
					windowName: tmuxName,
				};
			}

			// ── Dashboard setup (standalone session only) ──
			if (!existingSession) {
				const dashboardTarget = tmuxTarget.windowId;
				const dashboardPaneId = execSync(
					`tmux display-message -t ${shellEscape(dashboardTarget + ".0")} -p "#{pane_id}"`,
					{ encoding: "utf-8" },
				).trim();
				const dashboardScript = writeDashboardScript(teamDir, params.name);
				execSync(
					`tmux send-keys -t ${shellEscape(dashboardPaneId)} "bash '${dashboardScript}'" Enter`,
					{ stdio: "ignore" },
				);
				setPaneLabel(dashboardPaneId, "📊 team-lead");
			}

			const meta: TeamMeta = {
				id: tmuxName,
				name: params.name,
				createdAt: Date.now(),
				members: ["team-lead"],
				tmuxSession: tmuxTarget.session,
				teamDir,
				tmuxTarget,
			};
			writeMeta(teamDir, meta);
			ensureInbox(teamDir, "team-lead");

			const paneColors = new Map<number, string>();
			paneColors.set(0, DASHBOARD_COLOR);
			team = { teamDir, meta, spawnCount: 0, paneColors, agentPaneIds: [], originalBorderStatus };

			// Persist for session restore
			pi.appendEntry("team-state", { teamDir });

			startPolling();
			startWidgetRefresh();
			uiSetStatus?.("team", `Team: ${params.name}`);

			const location =
				tmuxTarget.type === "window"
					? `Team active in current window. Agent panes will appear to the right as you spawn them.`
					: `Created tmux session "${tmuxName}".\n` +
						`View agents: tmux attach -t ${tmuxName}`;

			return {
				content: [
					{
						type: "text",
						text:
							`Team "${params.name}" created.\n` +
							`${location}\n` +
							`Team directory: ${teamDir}\n\n` +
							`Next: use team_spawn to add agents.`,
					},
				],
				details: { tmuxTarget, teamDir },
			};
		},
	});

	// ── team_spawn ────────────────────────────────────────────────

	pi.registerTool({
		name: "team_spawn",
		label: "Spawn Agent",
		description:
			"Spawn an agent in a new tmux pane within the active team. " +
			"The agent runs pi in interactive mode with the teammate extension, " +
			"which gives it a send_message tool for inter-agent communication. " +
			`Available agent definitions: ${listAgentDefs().join(", ") || "(none)"}`,
		promptSnippet: "Spawn a named agent in the team tmux session with a role and task",
		promptGuidelines: [
			"Use team_spawn to add agents (reviewer, tester, implementer, etc.) to the active team.",
			"The 'task' field should include: what the agent should do, its teammates, and workflow instructions.",
			"The optional 'agent' field loads a predefined agent definition (system prompt, model, tools) by name.",
			"Each agent gets a send_message tool automatically — instruct them to use it for coordination.",
		],
		parameters: Type.Object({
			name: Type.String({ description: "Agent name (used as @name for messaging)" }),
			task: Type.String({ description: "Initial task / instructions for the agent" }),
			agent: Type.Optional(
				Type.String({ description: "Agent definition name (from ~/.pi/agent/agents/)" }),
			),
			cwd: Type.Optional(Type.String({ description: "Working directory for the agent" })),
		}),

		renderCall(args, theme) {
			const name = args.name ?? "...";
			const agent = args.agent ? theme.fg("dim", ` (${args.agent})`) : "";
			const preview = args.task
				? args.task.length > 60
					? `${args.task.slice(0, 60)}…`
					: args.task
				: "...";
			let text = theme.fg("toolTitle", theme.bold("team_spawn "));
			text += theme.fg("accent", `@${name}`) + agent;
			text += `\n  ${theme.fg("dim", preview)}`;
			return new Text(text, 0, 0);
		},

		async execute(_id, params, _signal, _onUpdate, _ctx) {
			if (!team) throw new Error("No active team. Call team_create first.");
			if (team.meta.members.includes(params.name)) {
				throw new Error(`Agent @${params.name} already exists in the team.`);
			}

			const { teamDir, meta } = team;

			// Resolve agent definition (optional)
			let agentDef: AgentDef | null = null;
			if (params.agent) {
				agentDef = loadAgentDef(params.agent);
				if (!agentDef) {
					const available = listAgentDefs();
					throw new Error(
						`Agent definition "${params.agent}" not found. ` +
							`Available: ${available.join(", ") || "(none)"}`,
					);
				}
			}

			// Build system prompt file (team context + agent system prompt)
			let systemPromptContent = "";
			systemPromptContent += `# Team Context\n\n`;
			systemPromptContent += `You are **@${params.name}** in team **${meta.name}**.\n\n`;
			systemPromptContent += `## Teammates\n`;
			for (const m of [...meta.members, params.name]) {
				if (m === params.name) continue;
				systemPromptContent += `- **@${m}**\n`;
			}
			systemPromptContent += `\n## Communication — MANDATORY\n\n`;
			systemPromptContent += `You MUST use the \`send_message\` tool to communicate with teammates. `;
			systemPromptContent += `Messages from teammates arrive automatically as user messages.\n\n`;
			systemPromptContent += `### Rules (strictly enforced):\n`;
			systemPromptContent += `1. **NEVER end a turn without calling send_message** after doing any meaningful work. `;
			systemPromptContent += `After every phase of your task (implementation, review, testing, etc.), you MUST send_message to the next teammate in your workflow AND to team-lead with a status update.\n`;
			systemPromptContent += `2. **Multi-step workflows**: If your task has multiple steps, complete ALL of them in sequence. `;
			systemPromptContent += `After step N, immediately proceed to step N+1. Do NOT stop mid-workflow.\n`;
			systemPromptContent += `3. **Progress updates**: Always send_message to **team-lead** when: starting work, finishing implementation, receiving review/test results, creating a PR, or encountering blockers.\n`;
			systemPromptContent += `4. **Responding to requests**: When a teammate asks you to do something, ALWAYS send_message back with your results when done.\n`;
			systemPromptContent += `5. **Waiting for input**: If you have nothing to do and are waiting for a teammate, send_message team-lead: "Standing by — waiting for [what you need]."\n`;
			systemPromptContent += `6. Reference teammates by name without @ (e.g. "team-lead", "reviewer", "tester").\n\n`;
			systemPromptContent += `**WARNING**: If your turn ends without any send_message calls after doing work, you will receive an automatic nudge. This wastes tokens. Always communicate proactively.\n\n`;

			if (agentDef?.systemPrompt?.trim()) {
				systemPromptContent += `## Role Instructions\n\n${agentDef.systemPrompt.trim()}\n`;
			}

			const promptFile = path.join(teamDir, "prompts", `${params.name}.md`);
			fs.writeFileSync(promptFile, systemPromptContent, "utf-8");

			// Write the initial task
			const taskFile = path.join(teamDir, "tasks", `${params.name}.md`);
			fs.writeFileSync(taskFile, params.task, "utf-8");

			// Write status (before spawn so widget picks it up)
			writeStatus(teamDir, params.name, { state: "starting", name: params.name });

			// Update member list
			meta.members.push(params.name);
			writeMeta(teamDir, meta);
			ensureInbox(teamDir, params.name);

			// Build launch script
			const extraArgs: string[] = [];
			if (agentDef?.model) extraArgs.push("--model", agentDef.model);
			if (agentDef?.tools?.length) {
				// Ensure send_message is always included so the agent can communicate.
				// Without this, agents with a tools allowlist can't reply to teammates.
				const tools = [...agentDef.tools];
				if (!tools.includes("send_message")) tools.push("send_message");
				extraArgs.push("--tools", tools.join(","));
			}

			const launchScript = writeLaunchScript(teamDir, params.name, meta.members, promptFile, extraArgs);

			// Spawn in tmux
			const target = meta.tmuxTarget
				? paneTarget(meta.tmuxTarget)
				: `${meta.tmuxSession}:0`;

			// ── Spawn into tmux with main-vertical layout ──────────
			// Layout: dashboard (pane 0, left 25%) | agents (stacked right 75%)
			const agentColor = AGENT_COLORS[team.spawnCount % AGENT_COLORS.length];
			let newPaneId: string;

			try {
				if (team.spawnCount === 0) {
					// First agent: split dashboard pane horizontally (agent goes right)
					newPaneId = execSync(
						`tmux split-window -t ${shellEscape(target + ".0")} -h -d -P -F "#{pane_id}" "bash '${launchScript}'"`,
						{ encoding: "utf-8" },
					).trim();
				} else {
					// Subsequent agents: split in the right-side agent area (vertical)
					newPaneId = execSync(
						`tmux split-window -t ${shellEscape(target)} -v -d -P -F "#{pane_id}" "bash '${launchScript}'"`,
						{ encoding: "utf-8" },
					).trim();
				}
			} catch {
				// Fallback: simple vertical split
				newPaneId = execSync(
					`tmux split-window -t ${shellEscape(target)} -v -d -P -F "#{pane_id}" "bash '${launchScript}'"`,
					{ encoding: "utf-8" },
				).trim();
			}

			// Set pane label (uses @agent_name user option, immune to pi title overrides)
			setPaneLabel(newPaneId, `@${params.name}`);

			// Track agent pane for cleanup on destroy
			team.agentPaneIds.push(newPaneId);

			// Track pane color and rebuild window-level border format
			const paneIdx = team.spawnCount + 1; // 0 = team-lead, 1+ = agents
			team.paneColors.set(paneIdx, agentColor);
			applyBorderFormat(team);

			// Apply main-vertical layout: team-lead on left, agents stacked on right
			applyMainVerticalLayout(target);

			team.spawnCount++;

			// Wait for the agent to start (poll for status update, max 15s)
			const started = await waitForAgentStart(teamDir, params.name, 15_000);

			refreshWidget();

			return {
				content: [
					{
						type: "text",
						text:
							`Agent @${params.name} spawned` +
							(agentDef ? ` (definition: ${agentDef.name})` : "") +
							`.\n` +
							(started
								? "Agent is running and processing its initial task."
								: "Agent is starting up (may take a moment).") +
							`\nIt has the send_message tool and will communicate via team messaging.`,
					},
				],
				details: { name: params.name, agent: params.agent },
			};
		},
	});

	// ── team_send ─────────────────────────────────────────────────

	pi.registerTool({
		name: "team_send",
		label: "Send to Agent",
		description:
			"Send a message to a teammate in the active team. " +
			"The message is delivered asynchronously — the agent may respond later via a team message.",
		promptSnippet: "Send a message to a teammate by name",
		promptGuidelines: [
			"Use team_send to communicate with agents you spawned — instruct them, provide context, or ask for status.",
			"Messages are asynchronous — the agent's reply will arrive as an incoming team message.",
		],
		parameters: Type.Object({
			to: Type.String({ description: "Agent name (e.g. 'reviewer')" }),
			content: Type.String({ description: "Message content" }),
		}),

		renderCall(args, theme) {
			const target = args.to ?? "...";
			const preview = args.content
				? args.content.length > 60
					? `${args.content.slice(0, 60)}…`
					: args.content
				: "...";
			let text = theme.fg("toolTitle", theme.bold("team_send "));
			text += theme.fg("accent", `@${target}`);
			text += `\n  ${theme.fg("dim", preview)}`;
			return new Text(text, 0, 0);
		},

		async execute(_id, params) {
			if (!team) throw new Error("No active team. Call team_create first.");
			const targets = team.meta.members.filter((m) => m !== "team-lead");
			if (!targets.includes(params.to)) {
				throw new Error(
					`Unknown agent "${params.to}". Active agents: ${targets.join(", ") || "(none)"}`,
				);
			}

			sendMessage(team.teamDir, "team-lead", params.to, params.content);
			return {
				content: [{ type: "text", text: `✓ Message sent to @${params.to}` }],
				details: {},
			};
		},
	});

	// ── team_status ───────────────────────────────────────────────

	pi.registerTool({
		name: "team_status",
		label: "Team Status",
		description: "Show the current team status: member list, states, and tmux session info.",
		promptSnippet: "Show team member status",
		parameters: Type.Object({}),

		async execute() {
			if (!team) {
				return {
					content: [{ type: "text", text: "No active team." }],
					details: {},
				};
			}

			const statuses = readAllStatus(team.teamDir);
			const lines: string[] = [];
			lines.push(`Team: ${team.meta.name}`);
			lines.push(`tmux: ${team.meta.tmuxSession}`);
			lines.push(`Directory: ${team.teamDir}`);
			lines.push(`Members: ${team.meta.members.join(", ")}`);
			lines.push("");

			for (const s of statuses) {
				const age = Math.round((Date.now() - s.lastActivity) / 1000);
				const ageStr = age < 60 ? `${age}s ago` : `${Math.floor(age / 60)}m ago`;
				lines.push(`  @${s.name}: ${s.state} (${ageStr})`);
			}

			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details: { statuses },
			};
		},
	});

	// ── team_watch_pr ─────────────────────────────────────────────

	interface PrWatch {
		pr: string;
		implementer: string;
		intervalMs: number;
		timer: ReturnType<typeof setInterval>;
		lastChecked: string; // ISO timestamp of last check
		seenCommentIds: Set<string>;
		lastCiState: "PENDING" | "SUCCESS" | "FAILURE" | "UNKNOWN";
		pollCount: number;
	}
	const prWatches: Map<string, PrWatch> = new Map();

	function stopAllPrWatches(): void {
		for (const w of prWatches.values()) clearInterval(w.timer);
		prWatches.clear();
	}

	pi.on("session_shutdown", async () => {
		stopAllPrWatches();
	});

	pi.registerTool({
		name: "team_watch_pr",
		label: "Watch PR",
		description:
			"Start polling a GitHub PR for new review comments. " +
			"Codex / AI reviewer comments are auto-dispatched to the implementer to fix. " +
			"Human comments are surfaced to team-lead. Bot noise is skipped. " +
			"Polling runs every 5 minutes until team_destroy or team_unwatch_pr.",
		promptSnippet: "Poll a PR for review comments — auto-handle Codex, surface human feedback",
		promptGuidelines: [
			"Call team_watch_pr after the implementer opens a draft PR and posts @codex review.",
			"team_watch_pr auto-dispatches Codex/AI comments to the implementer for fixing and surfaces human comments to team-lead.",
		],
		parameters: Type.Object({
			pr: Type.String({ description: "PR identifier: URL, number, or 'owner/repo#N'" }),
			implementer: Type.String({ description: "Name of the implementer agent to dispatch Codex fixes to" }),
			interval_minutes: Type.Optional(
				Type.Number({ description: "Poll interval in minutes (default 5, min 2, max 60)" }),
			),
		}),

		renderCall(args, theme) {
			const pr = args.pr ?? "...";
			const impl = args.implementer ?? "...";
			return new Text(
				theme.fg("toolTitle", theme.bold("team_watch_pr ")) +
					theme.fg("accent", pr) +
					theme.fg("dim", ` → @${impl}`),
				0,
				0,
			);
		},

		async execute(_id, params) {
			if (!team) throw new Error("No active team. Call team_create first.");
			if (!team.meta.members.includes(params.implementer)) {
				throw new Error(`Agent @${params.implementer} is not in the team.`);
			}
			if (prWatches.has(params.pr)) {
				throw new Error(`Already watching PR ${params.pr}. Call team_unwatch_pr first.`);
			}

			const intervalMin = Math.max(2, Math.min(60, params.interval_minutes ?? 5));
			const intervalMs = intervalMin * 60_000;

			// Seed: fetch existing comment IDs so we only surface NEW ones
			const seenCommentIds = new Set<string>();
			try {
				// Top-level PR comments + review summaries
				const existing = execSync(
					`gh pr view ${shellEscape(params.pr)} --json comments,reviews --jq ` +
						`'[.comments[].id, .reviews[].id] | .[]'`,
					{ encoding: "utf-8", timeout: 15_000 },
				).trim();
				for (const line of existing.split("\n")) {
					const id = line.trim();
					if (id) seenCommentIds.add(id);
				}
			} catch {
				/* first poll will catch everything */
			}
			try {
				// Inline review comments (per-line) live on a separate REST endpoint
				const { owner, repo, num } = parsePrIdent(params.pr);
				const inline = execSync(
					`gh api repos/${owner}/${repo}/pulls/${num}/comments --jq '.[].id'`,
					{ encoding: "utf-8", timeout: 15_000 },
				).trim();
				for (const line of inline.split("\n")) {
					const id = line.trim();
					// Inline comment IDs are integers; prefix to avoid collisions with node IDs.
					if (id) seenCommentIds.add(`inline:${id}`);
				}
			} catch { /* first poll will catch everything */ }

			const watch: PrWatch = {
				pr: params.pr,
				implementer: params.implementer,
				intervalMs,
				lastChecked: new Date().toISOString(),
				seenCommentIds,
				lastCiState: getPrCiState(params.pr),
				pollCount: 0,
				timer: setInterval(() => pollPrComments(watch), intervalMs),
			};
			prWatches.set(params.pr, watch);

			return {
				content: [
					{
						type: "text",
						text:
							`Watching PR ${params.pr} every ${intervalMin} minutes.\n` +
							`• Codex / AI comments → auto-dispatched to @${params.implementer}\n` +
							`• Human comments → surfaced to team-lead\n` +
							`• CI state changes (pass/fail) → surfaced to team-lead\n` +
							`• Hourly heartbeat when nothing changed\n` +
							`• AI-authored comments (🤖 Claude Code footer) → skipped\n` +
							`• Bot noise → skipped\n\n` +
							`Seeded with ${seenCommentIds.size} existing comment(s). ` +
							`Initial CI state: ${watch.lastCiState}.\n` +
							`Stop with team_unwatch_pr or team_destroy.`,
					},
				],
				details: {},
			};
		},
	});

	// ── team_unwatch_pr ──────────────────────────────────────────

	pi.registerTool({
		name: "team_unwatch_pr",
		label: "Unwatch PR",
		description: "Stop polling a PR for review comments.",
		promptSnippet: "Stop watching a PR for review comments",
		parameters: Type.Object({
			pr: Type.String({ description: "PR identifier that was passed to team_watch_pr" }),
		}),
		async execute(_id, params) {
			const watch = prWatches.get(params.pr);
			if (!watch) {
				return {
					content: [{ type: "text", text: `Not watching PR ${params.pr}.` }],
					details: {},
				};
			}
			clearInterval(watch.timer);
			prWatches.delete(params.pr);
			return {
				content: [{ type: "text", text: `Stopped watching PR ${params.pr}.` }],
				details: {},
			};
		},
	});

	// ── PR comment polling logic ─────────────────────────────────

	/** Get the rolled-up CI state for a PR. Returns PENDING/SUCCESS/FAILURE/UNKNOWN.
	 *  Handles both CheckRun (status + conclusion) and StatusContext (state) shapes. */
	function getPrCiState(pr: string): PrWatch["lastCiState"] {
		try {
			// Normalize each check to a single state string:
			//   CheckRun: if status != COMPLETED → status (PENDING-ish); else → conclusion
			//   StatusContext: → state (PENDING/SUCCESS/FAILURE/ERROR)
			const raw = execSync(
				`gh pr view ${shellEscape(pr)} --json statusCheckRollup --jq ` +
					`'[.statusCheckRollup[]? | ` +
					`if .__typename == "CheckRun" then ` +
					`(if .status == "COMPLETED" then (.conclusion // "UNKNOWN") else .status end) ` +
					`elif .__typename == "StatusContext" then (.state // "UNKNOWN") ` +
					`else "UNKNOWN" end]'`,
				{ encoding: "utf-8", timeout: 15_000 },
			).trim();
			if (!raw) return "UNKNOWN";
			const states: string[] = JSON.parse(raw);
			if (states.length === 0) return "UNKNOWN";

			// Filter out empty strings and explicit UNKNOWN
			const meaningful = states.filter((s) => s && s !== "UNKNOWN");
			if (meaningful.length === 0) return "UNKNOWN";

			if (meaningful.some((s) => s === "FAILURE" || s === "ERROR" || s === "TIMED_OUT" || s === "CANCELLED" || s === "ACTION_REQUIRED" || s === "STALE")) {
				return "FAILURE";
			}
			if (meaningful.some((s) => s === "PENDING" || s === "IN_PROGRESS" || s === "QUEUED" || s === "WAITING" || s === "EXPECTED")) {
				return "PENDING";
			}
			if (meaningful.every((s) => s === "SUCCESS" || s === "NEUTRAL" || s === "SKIPPED")) {
				return "SUCCESS";
			}
			return "UNKNOWN";
		} catch {
			return "UNKNOWN";
		}
	}

	function pollPrComments(watch: PrWatch): void {
		if (!team) return;

		watch.pollCount++;

		interface PrComment {
			id: string;
			author: string;
			body: string;
			path?: string;
			url: string;
		}

		const comments: PrComment[] = [];
		try {
			// 1. Top-level PR comments + review summaries (via gh pr view)
			const raw = execSync(
				`gh pr view ${shellEscape(watch.pr)} --json comments,reviews --jq ` +
					`'[(.comments[] | {id, author: .author.login, body, path: null, url: .url}), ` +
					`(.reviews[] | {id, author: .author.login, body, path: null, url: .url})] | .[]'`,
				{ encoding: "utf-8", timeout: 20_000 },
			).trim();
			if (raw) {
				for (const line of raw.split("\n").filter(Boolean)) {
					try {
						comments.push(JSON.parse(line));
					} catch { /* skip */ }
				}
			}
		} catch { /* skip top-level fetch */ }

		try {
			// 2. Inline review comments (per-line) — separate REST endpoint
			const { owner, repo, num } = parsePrIdent(watch.pr);
			const raw = execSync(
				`gh api repos/${owner}/${repo}/pulls/${num}/comments --jq ` +
					`'.[] | {id: ("inline:" + (.id|tostring)), author: .user.login, body, path, url: .html_url}'`,
				{ encoding: "utf-8", timeout: 20_000 },
			).trim();
			if (raw) {
				for (const line of raw.split("\n").filter(Boolean)) {
					try {
						comments.push(JSON.parse(line));
					} catch { /* skip */ }
				}
			}
		} catch { /* skip inline fetch */ }

		if (comments.length === 0) {
			// Still update CI state below
		}

		let codexCount = 0;
		let humanCount = 0;
		let skippedCount = 0;

		for (const c of comments) {
			if (watch.seenCommentIds.has(c.id)) continue;
			watch.seenCommentIds.add(c.id);

			if (!c.body?.trim()) {
				skippedCount++;
				continue;
			}

			const author = (c.author ?? "").toLowerCase();
			const body = c.body.trim();

			// 0. AI-authored comments posted on user's behalf → skip silently.
			//    These are typically replies/acks made by Claude Code via `gh pr comment`,
			//    which appear under the user's GitHub account but include the
			//    "🤖 Generated by ... with Claude Code" footer.
			if (/🤖\s+Generated by .+ with Claude Code/i.test(body)) {
				skippedCount++;
				continue;
			}
			// Bootstrap `@codex review` requests → skip silently.
			if (/^@codex\s+review\s*$/i.test(body)) {
				skippedCount++;
				continue;
			}

			// 1. Codex / AI reviewer → auto-dispatch to implementer
			const isAi =
				author === "codex" ||
				author.startsWith("chatgpt") ||
				author.startsWith("copilot") ||
				author === "github-actions[bot]" && /codex|copilot/i.test(c.body);
			if (isAi) {
				codexCount++;
				sendMessage(
					team!.teamDir,
					"team-lead",
					watch.implementer,
					`[AUTO-HANDLE] Codex review comment on PR ${watch.pr} by @${c.author}:\n\n` +
						`${c.body}\n\n` +
						(c.path ? `File: ${c.path}\n` : "") +
						`Fix this as a new commit on the same branch. Use Conventional Commits. ` +
						`Reply on the PR thread with the commit SHA. Don't resolve the thread.`,
				);
				continue;
			}

			// 2. Bots → skip
			const isBot =
				author.endsWith("[bot]") ||
				/^(devflow|dependabot|codeowners|mergify|renovate)/.test(author) ||
				/^(lgtm|approved?|\+1|:shipit:)$/i.test(c.body.trim());
			if (isBot) {
				skippedCount++;
				continue;
			}

			// 3. Human → surface to team-lead
			humanCount++;
			pi.sendMessage(
				{
					customType: "team-message",
					content:
						`[PR comment from human @${c.author} on ${watch.pr}]:\n\n` +
						`${c.body}\n\n` +
						(c.path ? `File: ${c.path}\n` : "") +
						`This is a human comment — review it and decide how to respond. ` +
						`Don't auto-fix or auto-reply on the user's behalf.`,
					display: true,
					details: { from: `pr:${c.author}`, timestamp: Date.now() },
				},
				{ triggerTurn: true, deliverAs: "followUp" },
			);
		}

		watch.lastChecked = new Date().toISOString();

		// ── CI state tracking ───────────────────────────────────────────────
		const prevCiState = watch.lastCiState;
		const newCiState = getPrCiState(watch.pr);
		watch.lastCiState = newCiState;
		const ciChanged = prevCiState !== newCiState && newCiState !== "UNKNOWN";

		// Build summary parts
		const parts: string[] = [];
		if (codexCount) parts.push(`${codexCount} Codex comment(s) dispatched to @${watch.implementer}`);
		if (humanCount) parts.push(`${humanCount} human comment(s) surfaced`);
		if (ciChanged) {
			const icon = newCiState === "SUCCESS" ? "✅" : newCiState === "FAILURE" ? "❌" : "⏳";
			parts.push(`CI: ${prevCiState} → ${icon} ${newCiState}`);
		}

		// Heartbeat: send a status snapshot every ~hour even if nothing changed,
		// so the user knows the watcher is alive.
		const HEARTBEAT_EVERY_N_POLLS = Math.max(1, Math.round(3_600_000 / watch.intervalMs));
		const isHeartbeat = parts.length === 0 && watch.pollCount % HEARTBEAT_EVERY_N_POLLS === 0;

		if (parts.length > 0 || isHeartbeat) {
			let content: string;
			if (parts.length > 0) {
				content = `[PR poll for ${watch.pr}]: ${parts.join(", ")}`;
			} else {
				// Heartbeat
				const icon = newCiState === "SUCCESS" ? "✅" : newCiState === "FAILURE" ? "❌" : newCiState === "PENDING" ? "⏳" : "❔";
				content = `[PR poll for ${watch.pr}]: heartbeat — no new comments · CI ${icon} ${newCiState}`;
			}
			pi.sendMessage(
				{
					customType: "team-message",
					content,
					display: true,
					details: { from: "pr-watcher", timestamp: Date.now() },
				},
				{ triggerTurn: false, deliverAs: "nextTurn" },
			);
		}
	}

	// ── team_destroy ──────────────────────────────────────────────

	pi.registerTool({
		name: "team_destroy",
		label: "Destroy Team",
		description:
			"Tear down the active team: kill the tmux session and all agent processes, clean up the team directory.",
		promptSnippet: "Destroy the active team and kill all agent processes",
		parameters: Type.Object({}),

		async execute(_id, _params, _signal, _onUpdate, ctx) {
			if (!team) {
				return {
					content: [{ type: "text", text: "No active team to destroy." }],
					details: {},
				};
			}

			const name = team.meta.name;
			const tmuxTarget = team.meta.tmuxTarget;
			const teamDir = team.teamDir;

			// Kill agent panes / tmux target
			try {
				if (tmuxTarget?.type === "window") {
					// In-tmux mode: kill agent panes, preserve team-lead
					for (const paneId of team.agentPaneIds) {
						try {
							execSync(`tmux kill-pane -t ${shellEscape(paneId)}`, { stdio: "ignore" });
						} catch { /* pane may already be gone */ }
					}
					// Restore window settings
					try {
						execSync(
							`tmux set-window-option -t ${shellEscape(tmuxTarget.windowId)} pane-border-status ${team.originalBorderStatus}`,
							{ stdio: "ignore" },
						);
						// Remove team-lead label from current pane
						const currentPane = execSync(`tmux display-message -p "#{pane_id}"`, { encoding: "utf-8" }).trim();
						execSync(`tmux set-option -p -t ${shellEscape(currentPane)} -u @agent_name`, { stdio: "ignore" });
					} catch { /* best effort */ }
				} else {
					// Standalone session: kill entire session
					const sess = tmuxTarget?.session ?? team.meta.tmuxSession;
					if (tmuxSessionExists(sess)) {
						execSync(`tmux kill-session -t ${shellEscape(sess)}`, { stdio: "ignore" });
					}
				}
			} catch {
				/* best effort */
			}

			// Clean up
			stopPolling();
			stopWidgetRefresh();
			stopAllPrWatches();
			uiSetStatus?.("team", undefined);
			team = null;

			// Remove team directory (best effort)
			try {
				fs.rmSync(teamDir, { recursive: true, force: true });
			} catch {
				/* non-critical */
			}

			const what = tmuxTarget?.type === "window" ? "Agent panes closed" : "tmux session killed";
			return {
				content: [
					{
						type: "text",
						text: `Team "${name}" destroyed. ${what}.`,
					},
				],
				details: {},
			};
		},
	});

	// ── /team command ─────────────────────────────────────────────

	pi.registerCommand("team", {
		description: "Show team status or manage the active team",
		handler: async (_args, ctx) => {
			if (!team) {
				ctx.ui.notify("No active team. Ask the LLM to create one with team_create.", "info");
				return;
			}

			const statuses = readAllStatus(team.teamDir);
			const stateIcons: Record<string, string> = {
				starting: "◌",
				idle: "●",
				working: "◉",
				done: "✓",
				error: "✗",
			};
			let msg = `Team: ${team.meta.name}\n`;
			msg += `tmux: ${team.meta.tmuxSession}\n\n`;
			for (const s of statuses) {
				const icon = stateIcons[s.state] ?? "?";
				msg += `  ${icon} @${s.name}: ${s.state}\n`;
			}

			const target = team.meta.tmuxTarget;
			if (target?.type === "window") {
				msg += `\nView agents: switch to tmux window "${target.windowName}" (Ctrl-b w)`;
			} else {
				const sess = target?.session ?? team.meta.tmuxSession;
				const cmd = isInTmux()
					? `tmux switch-client -t "${sess}"`
					: `tmux attach -t "${sess}"`;
				msg += `\nView agents: ${cmd}`;
			}

			ctx.ui.notify(msg, "info");
		},
	});
}

// ── Utility ────────────────────────────────────────────────────────

function shellEscape(s: string): string {
	if (/^[a-zA-Z0-9_./:@=-]+$/.test(s)) return s;
	return `'${s.replace(/'/g, "'\\''")}'`;
}

/** Parse a PR identifier into owner/repo/number.
 *  Accepts: full URL, "owner/repo#N", or bare number (uses current repo). */
function parsePrIdent(pr: string): { owner: string; repo: string; num: string } {
	// Full GitHub URL
	const urlMatch = pr.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
	if (urlMatch) {
		return { owner: urlMatch[1], repo: urlMatch[2], num: urlMatch[3] };
	}
	// owner/repo#N
	const slashMatch = pr.match(/^([^/]+)\/([^#]+)#(\d+)$/);
	if (slashMatch) {
		return { owner: slashMatch[1], repo: slashMatch[2], num: slashMatch[3] };
	}
	// Bare number — try to resolve via gh
	if (/^\d+$/.test(pr)) {
		try {
			const info = execSync(
				`gh repo view --json owner,name --jq '.owner.login + "/" + .name'`,
				{ encoding: "utf-8" },
			).trim();
			const [owner, repo] = info.split("/");
			return { owner, repo, num: pr };
		} catch {
			throw new Error(`Cannot resolve repo for bare PR number: ${pr}`);
		}
	}
	throw new Error(`Unrecognized PR identifier: ${pr}`);
}

async function waitForAgentStart(teamDir: string, agentName: string, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const status = readAllStatus(teamDir).find((s) => s.name === agentName);
		if (status && status.state !== "starting") return true;
		await new Promise((r) => setTimeout(r, 500));
	}
	return false;
}
