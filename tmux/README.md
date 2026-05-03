# tmux Cheatsheet

These dotfiles install:

- `~/.tmux.conf` -> `tmux/.tmux.conf`
- `~/.tmux.conf.local` -> `tmux/.tmux.conf.local`

The default tmux prefix is `Ctrl-b`. Press the prefix, release it, then press the next key.

## Sessions

| Action | Key / command |
| --- | --- |
| Start a named session | `tmux new -s <name>` |
| List sessions | `tmux ls` |
| Attach to a session | `tmux attach -t <name>` |
| Detach from tmux | `Ctrl-b d` |
| Rename session | `Ctrl-b $` |

## Windows

| Action | Key |
| --- | --- |
| New window | `Ctrl-b c` |
| Next window | `Ctrl-b n` |
| Previous window | `Ctrl-b p` |
| Pick window | `Ctrl-b w` |
| Rename window | `Ctrl-b ,` |
| Close window | `Ctrl-b &` |

## Splitting panes

| Layout | Key | Notes |
| --- | --- | --- |
| Split right | `Ctrl-b %` | Built-in vertical split; creates a pane to the right |
| Split below | `Ctrl-b "` | Built-in horizontal split; creates a pane below |
| Split above | `Ctrl-b -` | Custom binding in `tmux/.tmux.conf.local` |

Command equivalents:

```bash
# Split right
tmux split-window -h

# Split below
tmux split-window -v

# Split above current pane
tmux split-window -b -v
```

## Navigating panes

Built-in pane cycling:

| Action | Key |
| --- | --- |
| Cycle to next pane | `Ctrl-b o` |
| Show pane numbers | `Ctrl-b q`, then press the number |
| Move by arrow key | `Ctrl-b ←/↓/↑/→` |

Custom Vim-style navigation:

| Direction | Key |
| --- | --- |
| Left | `Ctrl-b h` |
| Down | `Ctrl-b j` |
| Up | `Ctrl-b k` |
| Right | `Ctrl-b l` |

## Resizing panes

Custom repeatable Vim-style resizing moves pane borders by 5 cells:

| Resize | Key |
| --- | --- |
| Left | `Ctrl-b H` |
| Down | `Ctrl-b J` |
| Up | `Ctrl-b K` |
| Right | `Ctrl-b L` |

Because these bindings use `-r`, you can hold or repeatedly press `H/J/K/L` after the prefix without pressing `Ctrl-b` each time, as long as tmux is still within its repeat timeout.

Built-in resize command examples:

```bash
tmux resize-pane -L 5
tmux resize-pane -D 5
tmux resize-pane -U 5
tmux resize-pane -R 5
```

## Copy mode

This config uses vi keys in copy mode.

| Action | Key |
| --- | --- |
| Enter copy mode | `Ctrl-b [` |
| Begin selection | `v` |
| Copy selection and exit | `y` |
| Half page up | `u` |
| Half page down | `d` |
| Exit copy mode | `q` |

## Reload config

After editing tmux config:

```bash
tmux source-file ~/.tmux.conf
```

Or from inside tmux:

```text
Ctrl-b :source-file ~/.tmux.conf
```
