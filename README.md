## peterg17 dotfiles
Keep track of my commonly used dotfiles using the https://github.com/anishathalye/dotbot tool.

## install on a new machine (TODO: test this)
1. `git clone https://github.com/peterg17/dotfiles.git`
2. `./install`

### Prerequisites

**Git editor (`nvr`):** The gitconfig uses [neovim-remote](https://github.com/mhinz/neovim-remote) as the git editor, which works on both macOS and Linux. Install it after neovim:

```sh
# macOS
brew install neovim
pip install neovim-remote

# Linux
sudo apt install neovim   # or equivalent
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
