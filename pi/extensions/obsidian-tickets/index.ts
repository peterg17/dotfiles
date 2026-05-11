import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const DEFAULT_TICKET_DIR = "01 Projects/Tickets";
const DEFAULT_TASK_MOC_PATH = "00 Maps/Agentic Tasks.md";
const STATUS_ORDER = ["in-progress", "needs-review", "blocked", "todo", "done", "archived"];
const PRIORITY_ORDER = ["urgent", "high", "medium", "low"];
const FRONTMATTER_KEYS = new Set(["type", "status", "priority", "project", "created", "updated", "repo", "branch", "pr", "tags"]);
const runtimeScanDirs = new Set<string>();

type TicketStatus = "todo" | "in-progress" | "needs-review" | "blocked" | "done" | "archived" | string;

interface TicketMeta {
	title: string;
	status: TicketStatus;
	priority: string;
	project: string;
	created: string;
	updated: string;
	repo: string;
	branch: string;
	pr: string;
	tags: string[];
}

interface TicketRecord {
	path: string;
	title: string;
	meta: TicketMeta;
}

interface FrontmatterBlock {
	raw: string;
	body: string;
}

interface MigrationResult {
	checked: number;
	updated: string[];
	dryRun: boolean;
}

function expandHome(value: string): string {
	if (value === "~") return os.homedir();
	if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
	return value;
}

function configuredVaultRoot(): string {
	const configured = process.env.OBSIDIAN_TICKETS_VAULT || process.env.OBSIDIAN_VAULT_ROOT || path.join(os.homedir(), "Documents", "notes");
	return path.resolve(expandHome(configured));
}

function configuredTicketDir(): string {
	return trimSlashes(process.env.OBSIDIAN_TICKETS_DIR || DEFAULT_TICKET_DIR);
}

function configuredTaskMocPath(): string {
	return trimSlashes(process.env.OBSIDIAN_TICKETS_DASHBOARD || DEFAULT_TASK_MOC_PATH);
}

function configuredScanDirs(): string[] {
	const raw = process.env.OBSIDIAN_TICKETS_SCAN_DIRS;
	const dirs = raw ? raw.split(",").map((item) => trimSlashes(item.trim())).filter(Boolean) : [configuredTicketDir()];
	return Array.from(new Set([...dirs, ...runtimeScanDirs]));
}

function trimSlashes(value: string): string {
	return value.replace(/^\/+|\/+$/g, "");
}

function includeRuntimeScanDir(dir: string): void {
	const normalized = trimSlashes(dir.trim());
	if (normalized) runtimeScanDirs.add(normalized);
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

function timestamp(): string {
	return new Date().toISOString().replace("T", " ").slice(0, 16);
}

function dateFromStatDate(date: Date | undefined, fallback: string): string {
	if (!date || Number.isNaN(date.getTime())) return fallback;
	return date.toISOString().slice(0, 10);
}

function normalizeDate(value: unknown, fallback: string): string {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
		const parsed = new Date(trimmed);
		if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
	}
	return fallback;
}

function sanitizeFileName(name: string): string {
	return name
		.replace(/[\\/:*?"<>|#^[\]]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 100);
}

function slug(name: string): string {
	return sanitizeFileName(name).replace(/\s+/g, "-").toLowerCase().slice(0, 80) || "ticket";
}

function normalizeToken(value: unknown, fallback: string): string {
	const raw = typeof value === "string" ? value.trim() : "";
	if (!raw) return fallback;
	const token = raw
		.toLowerCase()
		.replace(/[_\s/]+/g, "-")
		.replace(/[^a-z0-9-]+/g, "")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return token || fallback;
}

function normalizeStatus(value: unknown): string {
	const token = normalizeToken(value, "todo");
	const aliases: Record<string, string> = {
		active: "in-progress",
		backlog: "todo",
		complete: "done",
		completed: "done",
		doing: "in-progress",
		inprogress: "in-progress",
		progress: "in-progress",
		review: "needs-review",
		needsreview: "needs-review",
		"needs-reviews": "needs-review",
		blocked: "blocked",
		archive: "archived",
	};
	return aliases[token] || token;
}

function normalizePriority(value: unknown): string {
	const token = normalizeToken(value, "medium");
	const aliases: Record<string, string> = {
		p0: "urgent",
		p1: "high",
		p2: "medium",
		p3: "low",
		critical: "urgent",
		crit: "urgent",
		urgent: "urgent",
		high: "high",
		medium: "medium",
		med: "medium",
		normal: "medium",
		low: "low",
	};
	return aliases[token] || token;
}

function isInsideOrEqual(parent: string, child: string): boolean {
	const relative = path.relative(parent, child);
	return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function vaultPath(rel: string): string {
	const root = configuredVaultRoot();
	const abs = path.resolve(root, rel);
	if (!isInsideOrEqual(root, abs)) {
		throw new Error(`Path resolves outside configured Obsidian vault: ${rel}`);
	}
	return abs;
}

function relativeToVault(absOrRel: string): string {
	const withoutAt = absOrRel.trim().replace(/^@/, "");
	const root = configuredVaultRoot();
	const abs = path.isAbsolute(withoutAt) ? path.resolve(withoutAt) : path.resolve(root, withoutAt);
	if (!isInsideOrEqual(root, abs)) {
		throw new Error(`Path is outside configured Obsidian vault: ${absOrRel}`);
	}
	return path.relative(root, abs).split(path.sep).join("/");
}

function tryRelativeToVault(absOrRel: string): string | null {
	try {
		return relativeToVault(absOrRel);
	} catch {
		return null;
	}
}

function wikiLink(relPath: string, label?: string): string {
	const noExt = relPath.replace(/\.md$/i, "");
	return label && label !== path.basename(noExt) ? `[[${noExt}|${label}]]` : `[[${noExt}]]`;
}

function yamlScalar(value: string | undefined): string {
	const scalar = value ?? "";
	if (!scalar) return '""';
	if (/^(true|false|null|yes|no|on|off)$/i.test(scalar)) return JSON.stringify(scalar);
	if (scalar.includes(": ") || scalar.includes(" #") || /^[\s!&*?[\]{}>,|%@`-]/.test(scalar)) return JSON.stringify(scalar);
	if (/^[a-zA-Z0-9_./:@ -]+$/.test(scalar)) return scalar;
	return JSON.stringify(scalar);
}

function yamlList(values: string[]): string[] {
	return values.map((value) => `  - ${yamlScalar(value)}`);
}

function renderTicketFrontmatter(meta: TicketMeta, preservedLines: string[] = []): string {
	const lines = [
		"---",
		"type: ticket",
		`status: ${normalizeStatus(meta.status)}`,
		`priority: ${normalizePriority(meta.priority)}`,
		`project: ${yamlScalar(meta.project)}`,
		`created: ${normalizeDate(meta.created, today())}`,
		`updated: ${normalizeDate(meta.updated, today())}`,
		`repo: ${yamlScalar(meta.repo)}`,
		`branch: ${yamlScalar(meta.branch)}`,
		`pr: ${yamlScalar(meta.pr)}`,
		"tags:",
		...yamlList(normalizeTags(meta.tags, meta.status)),
		...preservedLines,
		"---",
	];
	return lines.join("\n") + "\n\n";
}

function renderDashboardFrontmatter(): string {
	return ["---", "type: dashboard", "dashboard: agentic-tasks", `updated: ${today()}`, "tags:", "  - agentic/tasks", "---", ""].join("\n") + "\n";
}

function parseFrontmatterBlock(content: string): FrontmatterBlock | null {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) return null;
	return { raw: match[1], body: content.slice(match[0].length).replace(/^(?:\r?\n)+/, "") };
}

function parseSimpleFrontmatter(content: string): Record<string, any> {
	const block = parseFrontmatterBlock(content);
	if (!block) return {};
	const out: Record<string, any> = {};
	let currentList: string | null = null;
	for (const raw of block.raw.split(/\r?\n/)) {
		const line = raw.trimEnd();
		const listMatch = line.match(/^\s*-\s+(.+)$/);
		if (listMatch && currentList) {
			out[currentList].push(unquoteYamlScalar(listMatch[1].trim()));
			continue;
		}
		const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (!m) continue;
		const key = m[1];
		let value = m[2].trim();
		if (!value) {
			out[key] = [];
			currentList = key;
		} else {
			currentList = null;
			out[key] = unquoteYamlScalar(value);
		}
	}
	return out;
}

function unquoteYamlScalar(value: string): string {
	const trimmed = value.trim();
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return trimmed.slice(1, -1);
		}
	}
	return trimmed;
}

function stripFrontmatter(content: string): string {
	return parseFrontmatterBlock(content)?.body ?? content;
}

function titleFromContent(content: string, fallback: string): string {
	const body = stripFrontmatter(content);
	const h1 = body.match(/^#\s+(.+)$/m);
	return h1?.[1]?.trim() || fallback;
}

function isYamlContinuationLine(line: string): boolean {
	return /^\s+/.test(line) || /^-\s+/.test(line);
}

function preservedFrontmatterLines(content: string): string[] {
	const block = parseFrontmatterBlock(content);
	if (!block) return [];
	const lines = block.raw.split(/\r?\n/);
	const preserved: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const match = lines[i].match(/^([A-Za-z0-9_-]+):/);
		if (match && FRONTMATTER_KEYS.has(match[1])) {
			while (i + 1 < lines.length && isYamlContinuationLine(lines[i + 1])) i++;
			continue;
		}
		if (lines[i].trim()) preserved.push(lines[i]);
	}
	return preserved;
}

function replaceTicketFrontmatter(content: string, meta: TicketMeta): string {
	return renderTicketFrontmatter(meta, preservedFrontmatterLines(content)) + stripFrontmatter(content).replace(/^\n+/, "");
}

function ensureHeading(content: string, heading: string): string {
	const re = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
	if (re.test(content)) return content;
	return content.trimEnd() + `\n\n## ${heading}\n`;
}

function appendWorkLog(content: string, entry: string): string {
	content = ensureHeading(content, "Work Log");
	const line = `- ${timestamp()} — ${entry.trim()}`;
	const match = content.match(/^##\s+Work Log\s*$/m);
	if (!match || match.index === undefined) return content.trimEnd() + `\n\n## Work Log\n\n${line}\n`;
	const insertAt = content.indexOf("\n", match.index) + 1;
	return content.slice(0, insertAt) + `\n${line}\n` + content.slice(insertAt).replace(/^\n?/, "");
}

function uniquePath(dirRel: string, title: string): string {
	const base = sanitizeFileName(title) || "Ticket";
	let rel = `${dirRel}/${base}.md`;
	let i = 2;
	while (fs.existsSync(vaultPath(rel))) {
		rel = `${dirRel}/${base} ${i}.md`;
		i++;
	}
	return rel;
}

function coerceTags(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
	if (typeof value !== "string") return [];
	const trimmed = value.trim();
	if (!trimmed) return [];
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		return trimmed
			.slice(1, -1)
			.split(",")
			.map((item) => unquoteYamlScalar(item.trim()))
			.filter(Boolean);
	}
	return trimmed.split(/[\s,]+/).filter(Boolean);
}

function normalizeTags(existing: unknown, status: unknown): string[] {
	const tags = coerceTags(existing).filter((tag) => !tag.startsWith("status/"));
	tags.unshift(`status/${normalizeStatus(status)}`);
	if (!tags.some((tag) => tag.startsWith("project/"))) tags.push("project/active");
	return Array.from(new Set(tags));
}

function statForRelPath(relPath: string | undefined): fs.Stats | undefined {
	if (!relPath) return undefined;
	try {
		return fs.statSync(vaultPath(relPath));
	} catch {
		return undefined;
	}
}

function deriveProject(relPath: string | undefined, explicit: unknown): string {
	if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
	if (relPath) {
		const ticketDir = configuredTicketDir();
		const prefix = `${ticketDir}/`;
		if (relPath.startsWith(prefix)) {
			const rest = relPath.slice(prefix.length).split("/");
			if (rest.length > 1 && rest[0]) return rest[0];
		}
	}
	return "Unassigned";
}

function buildTicketMeta(content: string, relPath: string | undefined, updates: Partial<TicketMeta> = {}, touchUpdated = false): TicketMeta {
	const fm = parseSimpleFrontmatter(content);
	const stat = statForRelPath(relPath);
	const fallbackCreated = dateFromStatDate(stat?.birthtime, today());
	const created = normalizeDate(fm.created, fallbackCreated);
	const fallbackUpdated = normalizeDate(fm.updated, dateFromStatDate(stat?.mtime, created));
	const status = normalizeStatus(updates.status ?? fm.status ?? "todo");
	const priority = normalizePriority(updates.priority ?? fm.priority ?? "medium");
	return {
		title: titleFromContent(content, updates.title || (relPath ? path.basename(relPath, ".md") : "Ticket")),
		status,
		priority,
		project: deriveProject(relPath, updates.project ?? fm.project),
		created: normalizeDate(updates.created, created),
		updated: touchUpdated ? today() : normalizeDate(updates.updated, fallbackUpdated),
		repo: String(updates.repo ?? fm.repo ?? ""),
		branch: String(updates.branch ?? fm.branch ?? ""),
		pr: String(updates.pr ?? fm.pr ?? ""),
		tags: normalizeTags(updates.tags ?? fm.tags, status),
	};
}

function readTicket(relPath: string): TicketRecord | null {
	try {
		const content = fs.readFileSync(vaultPath(relPath), "utf-8");
		const fm = parseSimpleFrontmatter(content);
		if (fm.type !== "ticket") return null;
		const meta = buildTicketMeta(content, relPath);
		return { path: relPath, title: meta.title, meta };
	} catch {
		return null;
	}
}

function findMarkdownFiles(dir: string): string[] {
	const out: string[] = [];
	if (!fs.existsSync(dir)) return out;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...findMarkdownFiles(p));
		else if (entry.isFile() && entry.name.endsWith(".md")) out.push(p);
	}
	return out;
}

function listTickets(): TicketRecord[] {
	const seen = new Set<string>();
	const tickets: TicketRecord[] = [];
	for (const rootRel of configuredScanDirs()) {
		for (const abs of findMarkdownFiles(vaultPath(rootRel))) {
			const rel = relativeToVault(abs);
			if (seen.has(rel)) continue;
			seen.add(rel);
			const ticket = readTicket(rel);
			if (ticket) tickets.push(ticket);
		}
	}
	return tickets.sort((a, b) => a.path.localeCompare(b.path));
}

function resolveTicket(identifier: string): string | null {
	let s = identifier.trim().replace(/^@/, "");
	const wiki = s.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
	if (wiki) s = wiki[1];

	const tickets = listTickets();
	if (s.endsWith(".md")) {
		const rel = tryRelativeToVault(s);
		if (rel) {
			const direct = tickets.find((ticket) => ticket.path === rel);
			if (direct) return direct.path;
		}
	}

	const withoutMd = s.replace(/\.md$/i, "");
	const exact = tickets.find((ticket) => ticket.path.replace(/\.md$/i, "") === withoutMd || ticket.title === withoutMd);
	if (exact) return exact.path;
	const base = tickets.find((ticket) => path.basename(ticket.path, ".md") === withoutMd || ticket.title.toLowerCase() === withoutMd.toLowerCase());
	return base?.path ?? null;
}

function statusSortKey(status: string): number {
	const index = STATUS_ORDER.indexOf(status);
	return index === -1 ? STATUS_ORDER.length : index;
}

function prioritySortKey(priority: string): number {
	const index = PRIORITY_ORDER.indexOf(priority);
	return index === -1 ? PRIORITY_ORDER.length : index;
}

function orderedStatuses(tickets: TicketRecord[]): string[] {
	const statuses = new Set(tickets.map((ticket) => ticket.meta.status || "todo"));
	return Array.from(statuses).sort((a, b) => statusSortKey(a) - statusSortKey(b) || a.localeCompare(b));
}

function dataviewSource(): string {
	return configuredScanDirs().map((dir) => `"${dir.replace(/"/g, "\\\"")}"`).join(" OR ");
}

function renderFallback(tickets: TicketRecord[]): string {
	let md = "## Plain Markdown fallback\n\n";
	md += "For environments without the Dataview plugin enabled, this generated summary mirrors the status board.\n\n";
	md += "<!-- obsidian-tickets-fallback:start -->\n";
	for (const status of orderedStatuses(tickets)) {
		const items = tickets
			.filter((ticket) => ticket.meta.status === status)
			.sort((a, b) => prioritySortKey(a.meta.priority) - prioritySortKey(b.meta.priority) || b.meta.updated.localeCompare(a.meta.updated));
		md += `\n### ${status}\n\n`;
		if (items.length === 0) {
			md += "_None_\n";
			continue;
		}
		for (const ticket of items) {
			const bits = [wikiLink(ticket.path, ticket.title), `priority: ${ticket.meta.priority}`, `project: ${ticket.meta.project}`, `updated: ${ticket.meta.updated}`];
			if (ticket.meta.pr) bits.push(`PR: ${ticket.meta.pr}`);
			md += `- ${bits.join(" · ")}\n`;
		}
	}
	md += "\n<!-- obsidian-tickets-fallback:end -->\n";
	return md;
}

function renderTaskMoc(tickets: TicketRecord[]): string {
	const source = dataviewSource();
	let md = renderDashboardFrontmatter();
	md += "# Agentic Tasks\n\n";
	md += "Tasks/tickets created for agentic project work in Pi. Ticket frontmatter is the source of truth; this dashboard is generated by the `obsidian-tickets` Pi extension.\n\n";
	md += "> Dataview sections require the Obsidian Dataview community plugin. Keep the Plain Markdown fallback below for non-Dataview environments.\n\n";
	md += "## Board by Status\n\n";
	md += "```dataview\n";
	md += "TABLE rows.file.link AS Tickets, rows.priority AS Priority, rows.project AS Project, rows.repo AS Repo, rows.branch AS Branch, rows.pr AS PR, rows.updated AS Updated\n";
	md += `FROM ${source}\n`;
	md += "WHERE type = \"ticket\"\n";
	md += "GROUP BY status\n";
	md += "SORT choice(key = \"in-progress\", 0, choice(key = \"needs-review\", 1, choice(key = \"blocked\", 2, choice(key = \"todo\", 3, choice(key = \"done\", 4, 5))))) ASC\n";
	md += "```\n\n";
	md += "## Backlog by Priority\n\n";
	md += "```dataview\n";
	md += "TABLE status AS Status, priority AS Priority, project AS Project, repo AS Repo, branch AS Branch, pr AS PR, updated AS Updated\n";
	md += `FROM ${source}\n`;
	md += "WHERE type = \"ticket\" AND status != \"done\" AND status != \"archived\"\n";
	md += "SORT choice(priority = \"urgent\", 0, choice(priority = \"high\", 1, choice(priority = \"medium\", 2, 3))) ASC, updated DESC\n";
	md += "```\n\n";
	md += "## Grouped by Project/Epic\n\n";
	md += "```dataview\n";
	md += "TABLE rows.file.link AS Tickets, rows.status AS Status, rows.priority AS Priority, rows.updated AS Updated, rows.pr AS PR\n";
	md += `FROM ${source}\n`;
	md += "WHERE type = \"ticket\"\n";
	md += "GROUP BY default(project, \"Unassigned\")\n";
	md += "SORT key ASC\n";
	md += "```\n\n";
	md += "## Recently Updated Tickets\n\n";
	md += "```dataview\n";
	md += "TABLE status AS Status, priority AS Priority, project AS Project, repo AS Repo, branch AS Branch, pr AS PR, updated AS Updated\n";
	md += `FROM ${source}\n`;
	md += "WHERE type = \"ticket\"\n";
	md += "SORT updated DESC\n";
	md += "LIMIT 25\n";
	md += "```\n\n";
	md += renderFallback(tickets);
	return md;
}

function isTicketMigrationCandidate(content: string): boolean {
	const fm = parseSimpleFrontmatter(content);
	if (fm.type === "ticket") return true;
	if (fm.type) return false;
	return true;
}

function migrateTickets(dryRun = false): MigrationResult {
	let checked = 0;
	const updated: string[] = [];
	for (const rootRel of configuredScanDirs()) {
		for (const abs of findMarkdownFiles(vaultPath(rootRel))) {
			const rel = relativeToVault(abs);
			const content = fs.readFileSync(abs, "utf-8");
			if (!isTicketMigrationCandidate(content)) continue;
			checked++;
			const meta = buildTicketMeta(content, rel);
			const next = replaceTicketFrontmatter(content, meta);
			if (next === content) continue;
			updated.push(rel);
			if (!dryRun) fs.writeFileSync(abs, next, "utf-8");
		}
	}
	return { checked, updated, dryRun };
}

function rebuildTaskMoc(): TicketRecord[] {
	const tickets = listTickets();
	const dashboardPath = vaultPath(configuredTaskMocPath());
	fs.mkdirSync(path.dirname(dashboardPath), { recursive: true });
	fs.writeFileSync(dashboardPath, renderTaskMoc(tickets), "utf-8");
	return tickets;
}

function migrateAndRebuild(dryRun = false): { migration: MigrationResult; tickets: TicketRecord[] } {
	const migration = migrateTickets(dryRun);
	const tickets = dryRun ? listTickets() : rebuildTaskMoc();
	return { migration, tickets };
}

function createTicketMarkdown(params: any, rel: string): string {
	const criteria = params.acceptanceCriteria?.length ? params.acceptanceCriteria : [];
	const meta: TicketMeta = {
		title: params.title,
		status: normalizeStatus(params.status || "todo"),
		priority: normalizePriority(params.priority || "medium"),
		project: deriveProject(rel, params.project),
		created: today(),
		updated: today(),
		repo: params.repo || "",
		branch: typeof params.branch === "string" && params.branch.trim() ? params.branch.trim() : `feature/${slug(params.title)}`,
		pr: "",
		tags: normalizeTags(["project/active"], params.status || "todo"),
	};
	let md = renderTicketFrontmatter(meta);
	md += `# ${params.title}\n\n`;
	md += "## Problem\n\n" + (params.description?.trim() || "TODO: describe the problem or desired outcome.") + "\n\n";
	md += "## Acceptance Criteria\n\n";
	if (criteria.length) md += criteria.map((criterion: string) => `- [ ] ${criterion}`).join("\n") + "\n\n";
	else md += "- [ ] TODO: define done.\n\n";
	md += "## Context\n\n";
	if (params.project) md += `Project: ${params.project}\n\n`;
	if (params.repo) md += `Repo: \`${params.repo}\`\n\n`;
	md += "## Agent Instructions\n\nUse `/skill:team-ticket` or ask Pi to spawn a visual tmux team for this ticket when ready.\n\n";
	md += `## Work Log\n\n- ${timestamp()} — Created ticket.\n\n`;
	md += "## PR\n";
	return md;
}

function updateTicketContent(content: string, rel: string, updates: Partial<TicketMeta>): string {
	let next = replaceTicketFrontmatter(content, buildTicketMeta(content, rel, updates, true));
	next = ensureHeading(next, "Work Log");
	next = ensureHeading(next, "PR");
	return next;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "obsidian_ticket_create",
		label: "Create Obsidian Ticket",
		description: "Create a Markdown task/ticket note in the configured Obsidian vault and update the Agentic Tasks dashboard.",
		promptSnippet: "Create an Obsidian Markdown ticket/task note",
		promptGuidelines: [
			"Use obsidian_ticket_create when the user wants to capture a task, ticket, or agentic project work item in Obsidian.",
			"Prefer concise titles and concrete acceptance criteria for Obsidian tickets.",
			"obsidian_ticket_create writes Dataview-friendly ticket frontmatter and refreshes the Agentic Tasks dashboard.",
		],
		parameters: Type.Object({
			title: Type.String({ description: "Ticket title" }),
			description: Type.Optional(Type.String({ description: "Problem/goal description" })),
			acceptanceCriteria: Type.Optional(Type.Array(Type.String(), { description: "Acceptance criteria checklist items" })),
			project: Type.Optional(Type.String({ description: "Project name, epic name, or wikilink" })),
			repo: Type.Optional(Type.String({ description: "Repository path or URL for implementation work" })),
			branch: Type.Optional(Type.String({ description: "Suggested branch name" })),
			priority: Type.Optional(Type.String({ description: "low, medium, high, urgent, etc. Default: medium" })),
			status: Type.Optional(Type.String({ description: "todo, in-progress, needs-review, blocked, done, archived. Default: todo" })),
			folder: Type.Optional(Type.String({ description: `Vault-relative folder. Default: ${configuredTicketDir()}` })),
		}),
		async execute(_id, params) {
			const folder = trimSlashes(params.folder || (params.project ? `${configuredTicketDir()}/${sanitizeFileName(params.project)}` : configuredTicketDir()));
			includeRuntimeScanDir(folder);
			fs.mkdirSync(vaultPath(folder), { recursive: true });
			const rel = uniquePath(folder, params.title);
			fs.writeFileSync(vaultPath(rel), createTicketMarkdown(params, rel), "utf-8");
			const { migration, tickets } = migrateAndRebuild(false);
			return {
				content: [{ type: "text", text: `Created Obsidian ticket: ${rel}\n${wikiLink(rel, params.title)}\nDashboard: ${configuredTaskMocPath()}` }],
				details: { path: rel, absolutePath: vaultPath(rel), dashboard: configuredTaskMocPath(), ticketCount: tickets.length, migration },
			};
		},
	});

	pi.registerTool({
		name: "obsidian_ticket_list",
		label: "List Obsidian Tickets",
		description: "List tracked Obsidian task/ticket notes, optionally filtered by status or project.",
		promptSnippet: "List tracked Obsidian tickets/tasks",
		parameters: Type.Object({
			status: Type.Optional(Type.String({ description: "Optional status filter" })),
			project: Type.Optional(Type.String({ description: "Optional project/epic filter" })),
		}),
		async execute(_id, params) {
			let tickets = listTickets();
			if (params.status) tickets = tickets.filter((ticket) => ticket.meta.status === normalizeStatus(params.status));
			if (params.project) tickets = tickets.filter((ticket) => ticket.meta.project.toLowerCase().includes(params.project.toLowerCase()));
			const lines = tickets.map((ticket) => {
				const bits = [`[${ticket.meta.status || "todo"}] ${wikiLink(ticket.path, ticket.title)}`, ticket.meta.priority, ticket.meta.project];
				if (ticket.meta.pr) bits.push(ticket.meta.pr);
				return `- ${bits.filter(Boolean).join(" · ")}`;
			});
			return { content: [{ type: "text", text: lines.length ? lines.join("\n") : "No matching Obsidian tickets." }], details: { tickets } };
		},
	});

	pi.registerTool({
		name: "obsidian_ticket_update",
		label: "Update Obsidian Ticket",
		description: "Update status, PR URL, and/or append a work-log entry to an Obsidian ticket note, then refresh the Agentic Tasks dashboard.",
		promptSnippet: "Update an Obsidian ticket status or work log",
		parameters: Type.Object({
			ticket: Type.String({ description: "Ticket path, title, or wikilink" }),
			status: Type.Optional(Type.String({ description: "New status" })),
			pr: Type.Optional(Type.String({ description: "PR URL" })),
			workLog: Type.Optional(Type.String({ description: "Work log entry to append" })),
		}),
		async execute(_id, params) {
			const rel = resolveTicket(params.ticket);
			if (!rel) throw new Error(`Could not find Obsidian ticket: ${params.ticket}`);
			const abs = vaultPath(rel);
			let content = fs.readFileSync(abs, "utf-8");
			content = updateTicketContent(content, rel, { status: params.status as any, pr: params.pr });
			if (params.workLog) content = appendWorkLog(content, params.workLog);
			if (params.pr && !stripFrontmatter(content).includes(params.pr)) {
				content = content.replace(/^##\s+PR\s*$/m, `## PR\n\n- ${params.pr}`);
			}
			fs.writeFileSync(abs, content, "utf-8");
			const { migration, tickets } = migrateAndRebuild(false);
			return { content: [{ type: "text", text: `Updated Obsidian ticket: ${rel}\nDashboard: ${configuredTaskMocPath()}` }], details: { path: rel, absolutePath: abs, dashboard: configuredTaskMocPath(), ticketCount: tickets.length, migration } };
		},
	});

	pi.registerTool({
		name: "obsidian_ticket_rebuild",
		label: "Rebuild Obsidian Ticket Dashboard",
		description: "Backfill Dataview-friendly ticket frontmatter and regenerate the Agentic Tasks dashboard. Set dryRun to preview migration changes.",
		promptSnippet: "Backfill Obsidian ticket frontmatter and rebuild the Agentic Tasks dashboard",
		promptGuidelines: ["Use obsidian_ticket_rebuild when existing Obsidian tickets need migration/backfill or the Agentic Tasks dashboard needs regeneration."],
		parameters: Type.Object({
			dryRun: Type.Optional(Type.Boolean({ description: "Preview migration changes without writing ticket notes or dashboard. Default: false" })),
		}),
		async execute(_id, params) {
			const dryRun = params.dryRun ?? false;
			const { migration, tickets } = migrateAndRebuild(dryRun);
			const action = dryRun ? "Previewed" : "Rebuilt";
			return {
				content: [
					{
						type: "text",
						text: `${action} Obsidian ticket dashboard: ${configuredTaskMocPath()}\nTickets checked: ${migration.checked}\nTickets needing backfill: ${migration.updated.length}`,
					},
				],
				details: { dashboard: configuredTaskMocPath(), ticketCount: tickets.length, migration },
			};
		},
	});

	pi.registerCommand("ticket-create", {
		description: "Create an Obsidian ticket note",
		handler: async (args, ctx) => {
			const title = args.trim() || (await ctx.ui.input("Ticket title", "What should this ticket be called?"));
			if (!title) return;
			const desc = await ctx.ui.input("Description", "Short problem/goal description (optional)");
			const folder = configuredTicketDir();
			includeRuntimeScanDir(folder);
			fs.mkdirSync(vaultPath(folder), { recursive: true });
			const rel = uniquePath(folder, title);
			fs.writeFileSync(vaultPath(rel), createTicketMarkdown({ title, description: desc }, rel), "utf-8");
			migrateAndRebuild(false);
			ctx.ui.notify(`Created ticket: ${rel}`, "success");
		},
	});

	pi.registerCommand("tickets", {
		description: "Show Obsidian ticket summary",
		handler: async (args, ctx) => {
			const status = args.trim();
			let tickets = listTickets();
			if (status) tickets = tickets.filter((ticket) => ticket.meta.status === normalizeStatus(status));
			const lines = tickets.slice(0, 30).map((ticket) => `${ticket.meta.status || "todo"}: ${ticket.title}`);
			ctx.ui.notify(lines.length ? lines.join("\n") : "No matching tickets.", "info");
		},
	});

	pi.registerCommand("tickets-rebuild", {
		description: "Backfill ticket frontmatter and rebuild the Agentic Tasks dashboard",
		handler: async (args, ctx) => {
			const dryRun = args.trim() === "--dry-run";
			const { migration, tickets } = migrateAndRebuild(dryRun);
			ctx.ui.notify(`${dryRun ? "Previewed" : "Rebuilt"} ${tickets.length} tickets; ${migration.updated.length} note(s) ${dryRun ? "need" : "received"} backfill.`, "info");
		},
	});
}

export const __test = {
	buildTicketMeta,
	configuredTaskMocPath,
	configuredTicketDir,
	configuredVaultRoot,
	createTicketMarkdown,
	migrateTickets,
	normalizePriority,
	normalizeStatus,
	renderTaskMoc,
	replaceTicketFrontmatter,
};
