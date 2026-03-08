-- Line numbers
vim.o.number = true
vim.o.relativenumber = true

-- Case-insensitive searching unless \C or capital letters in search term
vim.o.ignorecase = true
vim.o.smartcase = true

-- UI
vim.o.cursorline = true
vim.o.scrolloff = 10
vim.o.list = true          -- show tab and trailing spaces
vim.o.signcolumn = "yes"   -- always show sign column to avoid layout shifts
vim.o.splitright = true
vim.o.splitbelow = true

-- Behavior
vim.o.confirm = true       -- dialog on unsaved changes instead of error
vim.o.undofile = true      -- persistent undo across sessions
vim.o.updatetime = 250     -- faster CursorHold / gitsigns updates

-- Indentation defaults (overridden per-filetype)
vim.o.expandtab = true
vim.o.shiftwidth = 4
vim.o.tabstop = 4
