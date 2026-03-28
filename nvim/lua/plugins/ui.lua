return {
  -- Common utility library (required by many plugins)
  { "nvim-lua/plenary.nvim", lazy = true },
  { "nvim-tree/nvim-web-devicons", lazy = true },

  -- Treesitter: syntax highlighting and code understanding
  {
    "nvim-treesitter/nvim-treesitter",
    build = ":TSUpdate",
    lazy = false,
    priority = 1000,
    config = function()
      require("nvim-treesitter").setup({
        ensure_installed = {
          "lua", "vim", "vimdoc",
          "go", "python", "java",
          "json", "jsonc", "yaml", "toml",
          "markdown", "markdown_inline",
          "bash", "html", "css",
        },
        highlight = { enable = true },
        indent = { enable = true },
      })
    end,
  },

  -- Telescope: fuzzy finder for files, grep, LSP symbols
  {
    "nvim-telescope/telescope.nvim",
    branch = "0.1.x",
    dependencies = { "nvim-lua/plenary.nvim" },
    keys = {
      { "<leader>ff", "<cmd>Telescope find_files<cr>",              desc = "Find files" },
      { "<leader>fg", "<cmd>Telescope live_grep<cr>",               desc = "Live grep" },
      { "<leader>fb", "<cmd>Telescope buffers<cr>",                 desc = "Buffers" },
      { "<leader>fh", "<cmd>Telescope help_tags<cr>",               desc = "Help tags" },
      { "<leader>fs", "<cmd>Telescope lsp_document_symbols<cr>",    desc = "Document symbols" },
      { "<leader>fS", "<cmd>Telescope lsp_workspace_symbols<cr>",   desc = "Workspace symbols" },
      { "<leader>fr", "<cmd>Telescope oldfiles<cr>",                desc = "Recent files" },
      { "gd",         "<cmd>Telescope lsp_definitions<cr>",         desc = "Go to definition" },
      { "gr",         "<cmd>Telescope lsp_references<cr>",          desc = "Go to references" },
      { "gi",         "<cmd>Telescope lsp_implementations<cr>",     desc = "Go to implementation" },
    },
    opts = {
      defaults = {
        layout_strategy = "horizontal",
        sorting_strategy = "ascending",
        layout_config = { prompt_position = "top" },
        path_display = { "smart" },
        -- treesitter highlighting in previewer uses removed ft_to_lang API
        preview = { treesitter = false },
      },
    },
  },

  -- nvim-tree: file tree sidebar
  {
    "nvim-tree/nvim-tree.lua",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    keys = {
      { "<leader>e", "<cmd>NvimTreeFindFileToggle<cr>", desc = "Toggle file tree" },
    },
    opts = {
      sort = { sorter = "case_sensitive" },
      view = { width = 35 },
      renderer = { group_empty = true },
      filters = { dotfiles = false },
      update_focused_file = { enable = true },
      git = { enable = true },
      filesystem_watchers = { enable = false },
      on_attach = function(bufnr)
        local api = require("nvim-tree.api")
        -- load all defaults first
        api.config.mappings.default_on_attach(bufnr)
        -- then override t to open in new tab and switch to it
        vim.keymap.set("n", "t", api.node.open.tab, { buffer = bufnr, noremap = true, silent = true, nowait = true, desc = "Open in new tab" })
      end,
    },
  },

  -- which-key: popup showing available keymaps
  {
    "folke/which-key.nvim",
    event = "VeryLazy",
    opts = {
      spec = {
        { "<leader>f",  group = "find/telescope" },
        { "<leader>d",  group = "debug" },
        { "<leader>t",  group = "test" },
        { "<leader>j",  group = "java/json" },
        { "<leader>g",  group = "git" },
        { "<leader>a",  group = "AI (avante)" },
        { "<leader>r",  group = "LSP refactor" },
        { "<leader>c",  group = "code/LSP" },
      },
    },
  },

  -- gitsigns: git diff signs in the gutter
  {
    "lewis6991/gitsigns.nvim",
    event = { "BufReadPre", "BufNewFile" },
    keys = {
      { "<leader>gs", "<cmd>Gitsigns stage_hunk<cr>",   desc = "Stage hunk" },
      { "<leader>gr", "<cmd>Gitsigns reset_hunk<cr>",   desc = "Reset hunk" },
      { "<leader>gp", "<cmd>Gitsigns preview_hunk<cr>", desc = "Preview hunk" },
      { "<leader>gb", "<cmd>Gitsigns blame_line<cr>",   desc = "Blame line" },
      { "]c",         "<cmd>Gitsigns next_hunk<cr>",    desc = "Next hunk" },
      { "[c",         "<cmd>Gitsigns prev_hunk<cr>",    desc = "Prev hunk" },
    },
    opts = {},
  },

  -- taboo: rename tabs with :TabooRename <name> and :TabooReset
  {
    "gcmt/taboo.vim",
    lazy = false,
    config = function()
      vim.opt.tabline = "%!TabooTabLine()"
      vim.opt.showtabline = 2  -- always show tabline
    end,
  },

  -- fidget: LSP progress indicator
  {
    "j-hui/fidget.nvim",
    event = "LspAttach",
    opts = {
      integration = {
        ["nvim-tree"] = { enable = false },
      },
    },
  },

  -- lualine: status line
  {
    "nvim-lualine/lualine.nvim",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    event = "VeryLazy",
    opts = {
      options = {
        theme = "auto",
        globalstatus = true,
      },
      sections = {
        lualine_c = {
          { "filename", path = 1 },  -- relative path
        },
        lualine_x = {
          { "encoding" },
          { "fileformat" },
          { "filetype" },
        },
      },
    },
  },
}
