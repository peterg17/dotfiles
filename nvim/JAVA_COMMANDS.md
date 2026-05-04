# Java in Neovim (nvim-jdtls)

For universal LSP keymaps (`gd`, `gr`, `K`, `[d`/`]d` for diagnostics, etc.) see [`README.md`](./README.md). This file covers Java-specific extras layered on top by `nvim-jdtls`, plus testing and debugging.

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

## Tips

- **First open** of a Java file triggers jdtls — it may take 20-30s to index a large project
- `:LspInfo` — check if jdtls is attached to the current buffer
- `:LspLog` — debug jdtls startup issues
- `<leader>ca` on an unresolved symbol — offers "Add import" automatically
- For Telescope, panes, and other universal keymaps see [`README.md`](./README.md)
