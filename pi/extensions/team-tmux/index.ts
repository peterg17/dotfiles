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
	spawnCount: number; // how many agents have been spawned in the tmux target
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
						team = { teamDir: data.teamDir, meta, spawnCount: meta.members.length - 1 };
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
			name: Type.String({ description: "Team name (e.g. 'ticket-proj-12345')" }),
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

			if (existingSession) {
				// ── In tmux: new window in current session ────────
				const windowId = execSync(
					`tmux new-window -n ${shellEscape(tmuxName)} -P -F "#{window_id}"`,
					{ encoding: "utf-8" },
				).trim();

				// Configure pane borders for this window only
				execSync(
					`tmux set-window-option -t ${shellEscape(windowId)} pane-border-status top`,
					{ stdio: "ignore" },
				);
				execSync(
					`tmux set-window-option -t ${shellEscape(windowId)} pane-border-format ` +
						`" #[fg=colour214,bold]#{pane_title}#[default] "`,
					{ stdio: "ignore" },
				);

				// Show a splash in the first pane while agents haven't spawned yet
				execSync(
					`tmux send-keys -t ${shellEscape(windowId)} ` +
						`"clear && printf '\\n  \\033[33m⏳ Team: ${params.name}\\033[0m\\n  Agents will appear here as they boot up…\\n'" Enter`,
					{ stdio: "ignore" },
				);

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
					`tmux set-option -t ${shellEscape(tmuxName)} pane-border-format ` +
						`" #[fg=colour214,bold]#{pane_title}#[default] "`,
					{ stdio: "ignore" },
				);
				execSync(
					`tmux set-option -t ${shellEscape(tmuxName)} status-left ` +
						`" #[fg=colour214,bold]${tmuxName}#[default] │ "`,
					{ stdio: "ignore" },
				);
				execSync(
					`tmux set-option -t ${shellEscape(tmuxName)} status-left-length 50`,
					{ stdio: "ignore" },
				);

				// Splash in the default pane
				execSync(
					`tmux send-keys -t ${shellEscape(tmuxName)} ` +
						`"clear && printf '\\n  \\033[33m⏳ Team: ${params.name}\\033[0m\\n  Agents will appear here as they boot up…\\n'" Enter`,
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

			team = { teamDir, meta, spawnCount: 0 };

			// Persist for session restore
			pi.appendEntry("team-state", { teamDir });

			startPolling();
			startWidgetRefresh();
			uiSetStatus?.("team", `Team: ${params.name}`);

			const location =
				tmuxTarget.type === "window"
					? `Opened tmux window "${tmuxName}" — you should see it now.\n` +
						`Switch back here: Ctrl-b + previous-window (usually Ctrl-b p)`
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
			systemPromptContent += `\n## Communication\n`;
			systemPromptContent += `- Use the \`send_message\` tool to talk to teammates.\n`;
			systemPromptContent += `- Messages from teammates arrive automatically as user messages.\n`;
			systemPromptContent += `- Always respond to teammate requests via send_message when done.\n`;
			systemPromptContent += `- When idle with nothing to do, say so briefly and wait.\n`;
			systemPromptContent += `- Reference teammates by name without @ (e.g. "team-lead").\n\n`;

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
			if (agentDef?.tools?.length) extraArgs.push("--tools", agentDef.tools.join(","));

			const launchScript = writeLaunchScript(teamDir, params.name, meta.members, promptFile, extraArgs);

			// Spawn in tmux
			const target = meta.tmuxTarget
				? paneTarget(meta.tmuxTarget)
				: `${meta.tmuxSession}:0`;

			if (team.spawnCount === 0) {
				// First agent: replace the splash / default shell in pane 0
				execSync(
					`tmux send-keys -t ${shellEscape(target + ".0")} "bash '${launchScript}'" Enter`,
					{ stdio: "ignore" },
				);
				execSync(
					`tmux select-pane -t ${shellEscape(target + ".0")} -T "@${params.name}"`,
					{ stdio: "ignore" },
				);
			} else {
				// Subsequent agents: split the team window vertically
				try {
					const newPaneId = execSync(
						`tmux split-window -t ${shellEscape(target)} -v -d -P -F "#{pane_id}" "bash '${launchScript}'"`,
						{ encoding: "utf-8" },
					).trim();
					execSync(`tmux select-pane -t "${newPaneId}" -T "@${params.name}"`, {
						stdio: "ignore",
					});
				} catch {
					// Fallback
					execSync(
						`tmux split-window -t ${shellEscape(target)} -v -d "bash '${launchScript}'"`,
						{ stdio: "ignore" },
					);
				}
				// Rebalance panes evenly
				execSync(`tmux select-layout -t ${shellEscape(target)} even-vertical`, {
					stdio: "ignore",
				});
			}
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
		seenCommentIds: Set<number>;
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
			const seenCommentIds = new Set<number>();
			try {
				const existing = execSync(
					`gh pr view ${shellEscape(params.pr)} --json comments,reviews --jq ` +
						`'[.comments[].id, .reviews[].id] | .[]'`,
					{ encoding: "utf-8", timeout: 15_000 },
				).trim();
				for (const line of existing.split("\n")) {
					const n = parseInt(line, 10);
					if (!isNaN(n)) seenCommentIds.add(n);
				}
			} catch {
				/* first poll will catch everything */
			}

			const watch: PrWatch = {
				pr: params.pr,
				implementer: params.implementer,
				intervalMs,
				lastChecked: new Date().toISOString(),
				seenCommentIds,
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
							`• Bot noise → skipped\n\n` +
							`Seeded with ${seenCommentIds.size} existing comment(s). ` +
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

	function pollPrComments(watch: PrWatch): void {
		if (!team) return;

		interface PrComment {
			id: number;
			author: string;
			body: string;
			path?: string;
			url: string;
		}

		let comments: PrComment[];
		try {
			// Fetch PR comments + review comments
			const raw = execSync(
				`gh pr view ${shellEscape(watch.pr)} --json comments,reviews --jq ` +
					`'[(.comments[] | {id, author: .author.login, body, path: null, url: .url}), ` +
					`(.reviews[] | {id, author: .author.login, body, path: null, url: .url})] | .[]'`,
				{ encoding: "utf-8", timeout: 20_000 },
			).trim();
			if (!raw) return;
			comments = raw
				.split("\n")
				.filter(Boolean)
				.map((line) => {
					try {
						return JSON.parse(line);
					} catch {
						return null;
					}
				})
				.filter((c): c is PrComment => c !== null);
		} catch {
			return; // gh CLI failed — skip this cycle
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

		// Summary (only if there was activity)
		if (codexCount + humanCount > 0) {
			const parts: string[] = [];
			if (codexCount) parts.push(`${codexCount} Codex comment(s) dispatched to @${watch.implementer}`);
			if (humanCount) parts.push(`${humanCount} human comment(s) surfaced`);
			if (skippedCount) parts.push(`${skippedCount} skipped`);
			pi.sendMessage(
				{
					customType: "team-message",
					content: `[PR poll for ${watch.pr}]: ${parts.join(", ")}`,
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

			// Kill the tmux target (window or standalone session)
			try {
				if (tmuxTarget?.type === "window") {
					// Kill just the team window, not the whole session
					execSync(`tmux kill-window -t ${shellEscape(tmuxTarget.windowId)}`, {
						stdio: "ignore",
					});
				} else {
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

			const what = tmuxTarget?.type === "window" ? "tmux window" : "tmux session";
			return {
				content: [
					{
						type: "text",
						text: `Team "${name}" destroyed. ${what} killed.`,
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

async function waitForAgentStart(teamDir: string, agentName: string, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const status = readAllStatus(teamDir).find((s) => s.name === agentName);
		if (status && status.state !== "starting") return true;
		await new Promise((r) => setTimeout(r, 500));
	}
	return false;
}
