/**
 * File-based IPC for pi agent teams.
 *
 * Directory layout:
 *   /tmp/pi-team-<id>/
 *   ├── meta.json                 # Team metadata
 *   ├── inbox/<agent>/<msg>.json  # Pending messages
 *   ├── status/<agent>.json       # Agent status
 *   ├── prompts/<agent>.md        # System prompts
 *   ├── tasks/<agent>.md          # Initial tasks (consumed on startup)
 *   └── scripts/<agent>.sh        # Launch scripts
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ── Types ──────────────────────────────────────────────────────────

export interface TeamMessage {
	id: string;
	from: string;
	to: string;
	timestamp: number;
	content: string;
}

export interface AgentStatus {
	name: string;
	state: "starting" | "idle" | "working" | "done" | "error";
	lastActivity: number;
	description?: string;
	pid?: number;
}

export interface TmuxTarget {
	/** "window" when created inside an existing tmux session; "session" when standalone */
	type: "window" | "session";
	/** tmux session name (current session when type=window, new session when type=session) */
	session: string;
	/** tmux window id (e.g. "@5") — stable across renames */
	windowId: string;
	/** human-readable window/session name */
	windowName: string;
}

export interface TeamMeta {
	id: string;
	name: string;
	createdAt: number;
	members: string[];
	tmuxSession: string;
	teamDir: string;
	tmuxTarget?: TmuxTarget;
}

// ── Directory helpers ──────────────────────────────────────────────

export function createTeamDir(teamName: string): string {
	const sanitized = teamName.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
	const suffix = Math.random().toString(36).slice(2, 8);
	const dir = path.join(os.tmpdir(), `pi-team-${sanitized}-${suffix}`);
	for (const sub of ["inbox", "status", "prompts", "tasks", "scripts"]) {
		fs.mkdirSync(path.join(dir, sub), { recursive: true });
	}
	return dir;
}

export function ensureInbox(teamDir: string, agentName: string): void {
	fs.mkdirSync(path.join(teamDir, "inbox", agentName), { recursive: true });
}

// ── Messaging ──────────────────────────────────────────────────────

export function sendMessage(teamDir: string, from: string, to: string, content: string): void {
	const inboxDir = path.join(teamDir, "inbox", to);
	fs.mkdirSync(inboxDir, { recursive: true });
	const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const msg: TeamMessage = { id, from, to, timestamp: Date.now(), content };
	// Write atomically: write to tmp, then rename
	const tmpPath = path.join(inboxDir, `.${id}.tmp`);
	const finalPath = path.join(inboxDir, `${id}.json`);
	fs.writeFileSync(tmpPath, JSON.stringify(msg), "utf-8");
	fs.renameSync(tmpPath, finalPath);
}

export function pollMessages(teamDir: string, agentName: string): TeamMessage[] {
	const inboxDir = path.join(teamDir, "inbox", agentName);
	if (!fs.existsSync(inboxDir)) return [];

	const files = fs
		.readdirSync(inboxDir)
		.filter((f) => f.endsWith(".json") && !f.startsWith("."))
		.sort();

	const messages: TeamMessage[] = [];
	for (const file of files) {
		const filePath = path.join(inboxDir, file);
		try {
			const raw = fs.readFileSync(filePath, "utf-8");
			messages.push(JSON.parse(raw));
			fs.unlinkSync(filePath);
		} catch {
			/* skip corrupt / racing files */
		}
	}
	return messages;
}

// ── Status ─────────────────────────────────────────────────────────

export function writeStatus(teamDir: string, agentName: string, patch: Partial<AgentStatus>): void {
	const filePath = path.join(teamDir, "status", `${agentName}.json`);
	let current: AgentStatus = { name: agentName, state: "idle", lastActivity: Date.now() };
	try {
		current = { ...current, ...JSON.parse(fs.readFileSync(filePath, "utf-8")) };
	} catch {
		/* first write */
	}
	const updated: AgentStatus = { ...current, ...patch, lastActivity: Date.now() };
	fs.writeFileSync(filePath, JSON.stringify(updated), "utf-8");
}

export function readStatus(teamDir: string, agentName: string): AgentStatus | null {
	try {
		return JSON.parse(fs.readFileSync(path.join(teamDir, "status", `${agentName}.json`), "utf-8"));
	} catch {
		return null;
	}
}

export function readAllStatus(teamDir: string): AgentStatus[] {
	const dir = path.join(teamDir, "status");
	if (!fs.existsSync(dir)) return [];
	const results: AgentStatus[] = [];
	for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
		try {
			results.push(JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")));
		} catch {
			/* skip */
		}
	}
	return results;
}

// ── Meta ───────────────────────────────────────────────────────────

export function writeMeta(teamDir: string, meta: TeamMeta): void {
	fs.writeFileSync(path.join(teamDir, "meta.json"), JSON.stringify(meta, null, 2), "utf-8");
}

export function readMeta(teamDir: string): TeamMeta | null {
	try {
		return JSON.parse(fs.readFileSync(path.join(teamDir, "meta.json"), "utf-8"));
	} catch {
		return null;
	}
}
