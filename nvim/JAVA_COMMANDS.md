# Java in Neovim (nvim-jdtls)

## LSP (universal)

| Key | Action |
|-----|--------|
| `gd` | Go to definition |
| `gr` | Go to references |
| `gi` | Go to implementation |
| `K` | Hover docs / Javadoc |
| `<leader>rn` | Rename symbol |
| `<leader>ca` | Code action (import, generate, etc.) |
| `<leader>cf` | Format file |
| `<leader>cd` | Show diagnostics float |
| `[d` / `]d` | Prev / next diagnostic |
| `Ctrl-o` / `Ctrl-i` | Jump back / forward |

## Java-specific (`<leader>j`)

| Key | Action |
|-----|--------|
| `<leader>jo` | Organize imports |
| `<leader>jv` | Extract variable |
| `<leader>jm` | Extract method |
| `<leader>jc` | Extract constant |
| `<leader>jt` | Run nearest test method |
| `<leader>jT` | Run all tests in class |

## Testing (neotest)

| Key | Action |
|-----|--------|
| `<leader>tt` | Run nearest test |
| `<leader>tT` | Run all tests in file |
| `<leader>ts` | Toggle test summary panel |
| `<leader>to` | Open test output |
| `<leader>td` | Debug nearest test |
| `]t` / `[t` | Next / prev failed test |

## Debugging (nvim-dap)

| Key | Action |
|-----|--------|
| `<leader>db` | Toggle breakpoint |
| `<leader>dc` | Continue |
| `<leader>dn` | Step over |
| `<leader>di` | Step into |
| `<leader>do` | Step out |
| `<leader>dq` | Terminate session |
| `<leader>du` | Toggle debug UI |

## Find (Telescope)

| Key | Action |
|-----|--------|
| `<leader>ff` | Find file by name |
| `<leader>fg` | Live grep (search in files) |
| `<leader>fs` | Document symbols (methods, fields) |
| `<leader>fS` | Workspace symbols |

## Panes (splits)

| Command | Action |
|---------|--------|
| `:split` or `<C-w>s` | Split horizontally (new pane above) |
| `:vsplit` or `<C-w>v` | Split vertically (new pane to the left) |
| `:split filename` | Open file in new horizontal split |
| `<C-w><C-w>` | Cycle through panes |
| `<C-w>h/j/k/l` | Navigate left/down/up/right |
| `<C-w>q` | Close current pane |

## Tips

- **First open** of a Java file triggers jdtls — it may take 20-30s to index a large project
- `:LspInfo` — check if jdtls is attached to the current buffer
- `:LspLog` — debug jdtls startup issues
- `<leader>ca` on an unresolved symbol — offers "Add import" automatically
- Which-key popup: press `<leader>` and wait to see all available keymaps
