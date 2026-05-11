# Dotfiles Agent Instructions

This repo contains personal dotfiles plus configuration for Claude Code, pi, and shared Agent Skills. Prefer small, explicit changes and keep local/private paths or secrets out of public docs and reusable skills.

## Skill layout convention

Keep Agent Skills separated by runtime so Claude Code and pi can coexist without loading workflows that depend on unavailable tools:

- `agents/skills/<name>/SKILL.md` — shared, runtime-agnostic skills.
  - Install into `~/.agents/skills/<name>`.
  - Also link into `~/.claude/skills/<name>` for Claude Code compatibility.
  - Do **not** also link shared skills into `~/.pi/agent/skills`; pi discovers `~/.agents/skills` by default.
- `claude/skills/<name>/SKILL.md` — Claude-only skills that use Claude-specific tools such as `Agent`, `SendMessage`, `CronCreate`, or `ToolSearch`.
- `pi/skills/<name>/SKILL.md` — pi-only skills that use pi-specific tools such as `team_create`, `team_spawn`, `obsidian_ticket_update`, or Pi prompt/tool conventions.

Keep skill names unique across these trees. If the same workflow needs different tool APIs for Claude and pi, give the runtime-specific variants distinct names rather than relying on load-order collisions.

## Installer conventions

- Add per-skill links in `install.conf.yaml`; do not replace whole skill directories.
- Shared skills should have links for `~/.agents/skills/<name>` and `~/.claude/skills/<name>` only.
- Pi-only skills should link into `~/.pi/agent/skills/<name>` only.
- Claude-only skills should link into `~/.claude/skills/<name>` only.
- `pi/settings.json` should not import `~/.claude/skills`; shared skills belong in `agents/skills`.

## Validation

After changing skill/install configuration, run relevant checks:

```sh
python3 -m json.tool pi/settings.json >/dev/null
PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile pi/merge-settings.py claude/merge-settings.py
bash -n claude/setup-remote.sh
git diff --check
```

For `pi/extensions/obsidian-tickets`, also run the fixture validation script if available:

```sh
NODE_PATH=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules:/opt/homebrew/lib/node_modules \
  node /tmp/validate-obsidian-tickets-pr.cjs
```
