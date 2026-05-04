# Neovim

Personal Neovim config. Plugins are managed by [lazy.nvim](https://github.com/folke/lazy.nvim); see `lua/plugins/` for the plugin specs.

## Universal keymaps

These work in any buffer that has an LSP attached.

### LSP & navigation

| Key | Action |
|-----|--------|
| `gd` | Go to definition |
| `gr` | Go to references |
| `gi` | Go to implementation |
| `K` | Hover docs |
| `<leader>rn` | Rename symbol |
| `<leader>ca` | Code action (import, generate, quickfix, etc.) |
| `<leader>cf` | Format file |
| `Ctrl-o` / `Ctrl-i` | Jump back / forward through the jumplist |

### Diagnostics

| Key | Action |
|-----|--------|
| `[d` | Jump to **previous** diagnostic in the buffer |
| `]d` | Jump to **next** diagnostic in the buffer |
| `<leader>cd` | Open the diagnostic float for the current line (full message + source) |

Tips:
- `[d` / `]d` cycle through *all* severities (errors, warnings, hints, info). To restrict, use e.g. `:lua vim.diagnostic.goto_next({ severity = vim.diagnostic.severity.ERROR })`.
- Use `:Telescope diagnostics` for a fuzzy-searchable list across the whole workspace.
- Diagnostic signs and virtual text are configured in `lua/plugins/lsp.lua` (`vim.diagnostic.config`).

### Find (Telescope)

| Key | Action |
|-----|--------|
| `<leader>ff` | Find file by name |
| `<leader>fg` | Live grep (search in files) |
| `<leader>fs` | Document symbols (methods, fields) |
| `<leader>fS` | Workspace symbols |

### Panes (splits)

| Command | Action |
|---------|--------|
| `:split` or `<C-w>s` | Split horizontally (new pane above) |
| `:vsplit` or `<C-w>v` | Split vertically (new pane to the left) |
| `:split filename` | Open file in new horizontal split |
| `<C-w><C-w>` | Cycle through panes |
| `<C-w>h/j/k/l` | Navigate left/down/up/right |
| `<C-w>q` | Close current pane |

## Language-specific docs

- **Java (jdtls)**: see [`JAVA_COMMANDS.md`](./JAVA_COMMANDS.md) for Java refactors, neotest, and nvim-dap keymaps.

## Discoverability

- Press `<leader>` and wait — which-key will pop up the available keymaps.
- `:LspInfo` — check which servers are attached to the current buffer.
- `:Lazy` — open the plugin manager UI.
