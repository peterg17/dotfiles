/**
 * Teammate extension — loaded into each teammate pi instance via `-e`.
 *
 * Env vars (set by the team-lead spawner):
 *   PI_TEAM_DIR     – path to the shared team directory
 *   PI_TEAM_AGENT   – this agent's name
 *
 * Provides:
 *   • `send_message` tool so the LLM can talk to teammates
 *   • Polls the inbox and injects incoming messages via sendUserMessage
 *   • Reads an initial task file on startup and sends it as the first prompt
 *   • Updates status file so the team lead widget can show live state
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { ensureInbox, pollMessages, readMeta, sendMessage, writeStatus } from "./ipc.js";

const POLL_INTERVAL_MS = 2000;

export default function (pi: ExtensionAPI) {
	const teamDir = process.env.PI_TEAM_DIR;
	const agentName = process.env.PI_TEAM_AGENT;

	// Guard: only activate when launched as a teammate
	if (!teamDir || !agentName) return;

	let isStreaming = false;
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	// ── Helpers ────────────────────────────────────────────────────

	function currentMembers(): string[] {
		const meta = readMeta(teamDir);
		return meta?.members ?? [];
	}

	function deliverMessage(text: string): void {
		try {
			if (isStreaming) {
				pi.sendUserMessage(text, { deliverAs: "followUp" });
			} else {
				pi.sendUserMessage(text);
			}
		} catch {
			// Race: streaming state changed between check and send
			try {
				pi.sendUserMessage(text, { deliverAs: "followUp" });
			} catch {
				/* swallow – message will be lost; better than crashing */
			}
		}
	}

	function startPolling(): void {
		if (pollTimer) return;
		pollTimer = setInterval(() => {
			const msgs = pollMessages(teamDir, agentName);
			for (const msg of msgs) {
				deliverMessage(`[Message from @${msg.from}]:\n${msg.content}`);
			}
		}, POLL_INTERVAL_MS);
	}

	function stopPolling(): void {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	// ── Streaming state tracking ──────────────────────────────────

	pi.on("agent_start", async () => {
		isStreaming = true;
		writeStatus(teamDir, agentName, { state: "working" });
	});

	pi.on("agent_end", async () => {
		isStreaming = false;
		writeStatus(teamDir, agentName, { state: "idle" });
	});

	// ── Session lifecycle ─────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		ensureInbox(teamDir, agentName);
		writeStatus(teamDir, agentName, { state: "starting", pid: process.pid });

		// UI chrome
		const meta = readMeta(teamDir);
		const teamLabel = meta?.name ?? "team";
		ctx.ui.setStatus("team-role", `@${agentName} · ${teamLabel}`);
		ctx.ui.setTitle(`@${agentName}`);

		// Start message polling
		startPolling();

		// Send initial task (if the spawner wrote one)
		const taskFile = path.join(teamDir, "tasks", `${agentName}.md`);
		setTimeout(() => {
			try {
				if (fs.existsSync(taskFile)) {
					const task = fs.readFileSync(taskFile, "utf-8");
					fs.unlinkSync(taskFile);
					if (task.trim()) {
						pi.sendUserMessage(task);
					}
				}
			} catch {
				/* task file may have been consumed already */
			}
			writeStatus(teamDir, agentName, { state: "idle" });
		}, 1500);
	});

	pi.on("session_shutdown", async () => {
		stopPolling();
		writeStatus(teamDir, agentName, { state: "done" });
	});

	// ── send_message tool ─────────────────────────────────────────

	pi.registerTool({
		name: "send_message",
		label: "Send Message",
		description: [
			"Send a message to a teammate.",
			"The recipient must be a current team member.",
			"Use this to request reviews, report results, ask for tests, etc.",
		].join(" "),
		promptSnippet: "Send a message to a teammate by name",
		promptGuidelines: [
			"Use send_message to communicate with teammates — do not try to call their tools directly.",
			"Always specify the teammate name (without @) in the 'to' field of send_message.",
			"When you finish a task requested by another teammate, send results back via send_message.",
		],
		parameters: Type.Object({
			to: Type.String({ description: "Teammate name (e.g. 'reviewer', 'team-lead')" }),
			content: Type.String({ description: "Message content" }),
		}),

		renderCall(args, theme) {
			const target = args.to || "...";
			const preview = args.content
				? args.content.length > 60
					? `${args.content.slice(0, 60)}…`
					: args.content
				: "...";
			let text = theme.fg("toolTitle", theme.bold("send_message "));
			text += theme.fg("accent", `@${target}`);
			text += `\n  ${theme.fg("dim", preview)}`;
			return new Text(text, 0, 0);
		},

		async execute(_toolCallId, params) {
			const members = currentMembers();
			const targets = members.filter((m) => m !== agentName);

			if (!targets.includes(params.to)) {
				throw new Error(
					`Unknown teammate "${params.to}". ` + `Current teammates: ${targets.join(", ") || "(none)"}`,
				);
			}

			sendMessage(teamDir, agentName, params.to, params.content);
			return {
				content: [{ type: "text", text: `✓ Message sent to @${params.to}` }],
				details: {},
			};
		},
	});
}
