-- Set leader key before loading plugins
vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

-- Bootstrap lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  local lazyrepo = "https://github.com/folke/lazy.nvim.git"
  local out = vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
  if vim.v.shell_error ~= 0 then
    vim.api.nvim_echo({
      { "Failed to clone lazy.nvim:\n", "ErrorMsg" },
      { out, "WarningMsg" },
      { "\nPress any key to continue..." },
    }, true, {})
    vim.fn.getchar()
    os.exit(1)
  end
end
vim.opt.rtp:prepend(lazypath)

-- Load core config before plugins are initialized
require("config.options")
require("config.keymaps")
require("config.autocmds")

-- Setup lazy.nvim with plugin specs
require("lazy").setup({
  spec = {
    { import = "plugins.ui" },
    { import = "plugins.lsp" },
    { import = "plugins.java" },
    { import = "plugins.completion" },
    { import = "plugins.debug" },
    { import = "plugins.testing" },
    { import = "plugins.ai" },
    { import = "plugins.notebooks" },
  },
  checker = { enabled = false },
  ui = { border = "rounded" },
})
