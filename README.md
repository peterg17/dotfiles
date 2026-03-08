## peterg17 dotfiles
Keep track of my commonly used dotfiles using the https://github.com/anishathalye/dotbot tool.

## install on a new machine (TODO: test this)
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
