## peterg17 dotfiles
Keep track of my commonly used dotfiles using the https://github.com/anishathalye/dotbot tool.

## install on a new machine
1. `git clone https://github.com/peterg17/dotfiles.git`
2. `./install`

### Prerequisites

**Neovim (≥ 0.9 required):** The nvim config uses lazy.nvim and `vim.keymap`, which require a recent Neovim. The system package on Debian/Ubuntu is typically too old — install from snap or GitHub releases instead:

```sh
# macOS
brew install neovim

# Linux (snap — easiest)
sudo snap install nvim --classic

# Linux (GitHub release — if snap unavailable)
curl -LO https://github.com/neovim/neovim/releases/latest/download/nvim-linux-x86_64.tar.gz
sudo tar -C /opt -xzf nvim-linux-x86_64.tar.gz
sudo ln -sf /opt/nvim-linux-x86_64/bin/nvim /usr/local/bin/nvim
```

**Git editor (`nvr`):** The gitconfig uses [neovim-remote](https://github.com/mhinz/neovim-remote) as the git editor. Install it after neovim:

```sh
pip install neovim-remote
```

Without `nvr`, git commit/rebase editor invocations will fail. If you're on a machine where you don't want to install it, set a local override:

```sh
git config --global core.editor vim
```

## remote Linux dev box prerequisites

**Claude Code:**
```sh
curl -fsSL https://claude.ai/install.sh | bash
```



Install these before running `./install` — Mason will auto-install LSP servers on first launch of nvim, but they depend on these being present.

**Node.js** (required for pyright, jsonls):
```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# restart shell, then:
nvm install --lts
```

**Python** (required for pyright):
```sh
sudo apt install python3 python3-pip
```

**Python Jupyter deps** (required for molten-nvim notebook support):
```sh
sudo apt install pipx
pipx install jupytext
pip install --user pynvim jupyter_client
mkdir -p ~/.local/share/jupyter/runtime
```

Then on first launch of nvim, run `:UpdateRemotePlugins` and restart. Start a kernel with `:MoltenInit python3`.

Key mappings (all prefixed `<leader>m`):
- `<leader>mi` — init kernel
- `<leader>ml` — run current line
- `<leader>mr` — re-run cell
- `<leader>mv` (visual) — run selection
- `<leader>mo` — show output
- `]m` / `[m` — next/prev cell

Cells are delimited by `# %%` markers in `.py` files.

**Using a virtualenv kernel with Molten:**

Register the venv as a named Jupyter kernel (do this once per venv):
```sh
source /path/to/venv/bin/activate
pip install ipykernel
python -m ipykernel install --user --name=myenv --display-name "My Env"
```

Then in Neovim: `:MoltenInit myenv`

List all registered kernels with:
```sh
jupyter kernelspec list
```

**ripgrep** (required for Telescope live_grep):
```sh
brew install ripgrep
```

**fzf** (used for branch checkout and shell history search):
```sh
# macOS
brew install fzf

# Linux — install from git, not apt (apt version is too old for --zsh support)
git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf && ~/.fzf/install
```

**Go** (required for gopls):
```sh
GO_VERSION=$(curl -sL 'https://go.dev/dl/?mode=json' | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['version'])")
curl -LO "https://go.dev/dl/$GO_VERSION.linux-amd64.tar.gz"
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf "$GO_VERSION.linux-amd64.tar.gz"
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.zshrc
source ~/.zshrc
```

**Java** (required for jdtls) — use [SDKMAN](https://sdkman.io) to get the latest OpenJDK:
```sh
curl -s "https://get.sdkman.io" | bash
# restart shell, then:
sdk install java
sdk install maven
```

## LSP key mappings

These apply in any buffer where an LSP server is active (Go, Python, TypeScript, Java, etc.).

**Custom mappings** (defined in `nvim/lua/plugins/lsp.lua`):

| Key | Action |
|-----|--------|
| `K` | Hover docs / type info |
| `<leader>rn` | Rename symbol |
| `<leader>ca` | Code actions (auto-imports, fixes) |
| `<leader>cf` | Format file |
| `[d` / `]d` | Prev / next diagnostic |
| `<leader>cd` | Diagnostic detail float |

**Neovim 0.11 built-in defaults:**

| Key | Action |
|-----|--------|
| `gd` | Go to definition |
| `gD` | Go to declaration |
| `gi` | Go to implementation |
| `gr` | Find references |
| `<C-k>` | Signature help (insert mode) |
| `<C-y>` | Accept completion suggestion |
| `<C-n>` / `<C-p>` | Next / prev completion suggestion |
| `<C-e>` | Dismiss completion menu |

---

## remote Linux dev box setup

To forward `ANTHROPIC_API_KEY` from your Mac over SSH (so nvim/avante works remotely without storing the key on the remote):

1. Add to the remote's `/etc/ssh/sshd_config`:
   ```
   AcceptEnv ANTHROPIC_API_KEY
   ```
2. Reload sshd:
   ```bash
   sudo systemctl reload sshd
   ```

The Mac side is already configured — `~/.ssh/config.d/00-generic` sends the key automatically on every SSH connection.

## Claude Code on a remote Linux box

To get "Claude requires your input" notifications forwarded to iTerm2 on your Mac via the SSH session:

1. Merge the remote Claude settings (safe to re-run, won't clobber existing settings):
   ```bash
   ~/dotfiles/claude/setup-remote.sh
   ```
2. In iTerm2 on your Mac: Settings → Profiles → Terminal → enable **"Send notification on bell"**

Notifications travel over the existing SSH session as an iTerm2 escape sequence — no tunnels or third-party services needed.

## Agent skills layout

Skills are split by runtime so Claude Code and pi can coexist without loading each other's tool-specific workflows:

- **Shared Agent Skills:** `agents/skills/<name>/SKILL.md`
  - installed into `~/.agents/skills/<name>` for Agent Skills compatible tools
  - installed into `~/.claude/skills/<name>` for Claude Code
  - discovered by pi from `~/.agents/skills` by default, so shared skills are **not** also linked into `~/.pi/agent/skills`
- **Claude-only skills:** `claude/skills/<name>/SKILL.md`, installed only into `~/.claude/skills/<name>`
- **Pi-only skills:** `pi/skills/<name>/SKILL.md`, installed only into `~/.pi/agent/skills/<name>`

The installer links skills per-name rather than replacing whole skill directories, so plugin-shipped or host-only skills with other names are left alone. Keep skill names unique across the three source trees; if a workflow needs different tool APIs in Claude and pi, give each runtime-specific version a distinct name.

Pi settings intentionally do not import `~/.claude/skills`; any shared skill should live in `agents/skills` instead. The pi settings merge removes the old dotfiles-managed `~/.claude/skills` import to prevent duplicate or Claude-only skills from appearing in pi.

Currently shipped:

- Shared:
  - **`obsidian-inbox-cleanup`** — processes the Obsidian vault `Index.md` capture inbox, files links/ideas into notes, updates MOCs, and verifies unresolved links.
- Claude-only:
  - **`parallel-jira-tickets`** — spawn a Claude team to tackle multiple Jira tickets in parallel (one implementer per ticket in its own worktree, plus shared reviewer + tester, plus an hourly PR-comment polling cron).
  - **`single-jira-ticket-team`** — single-ticket counterpart to `parallel-jira-tickets`. Spawns a backgrounded team (one implementer in a worktree + shared reviewer + tester + PR-comment cron) for one non-trivial Jira ticket while the user keeps working in the main session.
- Pi-only: see `pi/README.md` for `ticket-workflow`, `team-ticket`, and `obsidian-ticket-team`.

To add a portable shared skill, put it under `agents/skills/<name>/SKILL.md` and add matching `~/.agents/skills/<name>` and `~/.claude/skills/<name>` links to `install.conf.yaml`. To add a runtime-specific skill, use `claude/skills` or `pi/skills` and install it only into that runtime's native skill directory.

## Obsidian daily inbox cleanup

This repo includes a launchd job for the notes vault at `/Users/peterg17/Documents/notes`:

- Script: `pi/scripts/process-index.sh`
- LaunchAgent: `pi/launchd/com.peterg17.obsidian-index-cleanup.plist`
- Schedule: daily at 8:30 PM local time
- Logs: `/Users/peterg17/Documents/notes/.pi/logs/index-cleanup.{out,err}.log`

Enable on macOS:

```sh
mkdir -p ~/Library/LaunchAgents
cp pi/launchd/com.peterg17.obsidian-index-cleanup.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.peterg17.obsidian-index-cleanup.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.peterg17.obsidian-index-cleanup.plist
launchctl list | grep com.peterg17.obsidian-index-cleanup
```

Run manually:

```sh
/Users/peterg17/Documents/notes/.pi/scripts/process-index.sh
```
