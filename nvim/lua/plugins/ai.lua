return {
  {
    "coder/claudecode.nvim",
    dependencies = { "folke/snacks.nvim" },
    opts = {
      terminal = {
        snacks_win_opts = {
          keys = {
            -- Single <Esc> exits terminal mode; use <C-c> to interrupt Claude
            term_normal = {
              "<esc>",
              function(_self)
                vim.cmd("stopinsert")
              end,
              mode = "t",
              expr = false,
              desc = "Exit terminal mode",
            },
          },
        },
      },
    },
    keys = {
      { "<leader>cc", "<cmd>ClaudeCode<cr>",            desc = "Toggle Claude Code" },
      { "<leader>cf", "<cmd>ClaudeCodeFocus<cr>",       desc = "Focus Claude Code" },
      { "<leader>cr", "<cmd>ClaudeCode --resume<cr>",   desc = "Resume Claude Code" },
      { "<leader>cC", "<cmd>ClaudeCode --continue<cr>", desc = "Continue Claude Code" },
      { "<leader>cm", "<cmd>ClaudeCodeSelectModel<cr>", desc = "Select Claude model" },
      { "<leader>cb", "<cmd>ClaudeCodeAdd %<cr>",       desc = "Add buffer to Claude" },
      { "<leader>cs", "<cmd>ClaudeCodeSend<cr>",        mode = "v", desc = "Send selection to Claude" },
    },
  },
  {
    "yetone/avante.nvim",
    event = "VeryLazy",
    version = false,  -- rolling release; use latest commit
    build = "make",   -- requires Rust/cargo for native components
    dependencies = {
      "nvim-treesitter/nvim-treesitter",
      "nvim-lua/plenary.nvim",
      "MunifTanjim/nui.nvim",
      { "folke/snacks.nvim", opts = {} },
      -- Markdown rendering in avante panels
      {
        "MeanderingProgrammer/render-markdown.nvim",
        opts = { file_types = { "markdown", "Avante" } },
        ft = { "markdown", "Avante" },
      },
    },
    opts = {
      provider = "claude-code",
      auto_suggestions_provider = "claude",
      acp_providers = {
        ["claude-code"] = {
          command = "npx",
          args = { "-y", "@zed-industries/claude-code-acp" },
          env = {
            NODE_NO_WARNINGS = "1",
            ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY"),
            ACP_PATH_TO_CLAUDE_CODE_EXECUTABLE = vim.fn.exepath("claude"),
            ACP_PERMISSION_MODE = "bypassPermissions",
          },
        },
      },
      providers = {
        claude = {
          endpoint = "https://api.anthropic.com",
          -- avante pattern-matches on "claude-sonnet-4-5" to use the correct
          -- text_editor_20250728 tool; "claude-sonnet-4-6" falls through to
          -- the old text_editor_20250429 which the API no longer accepts.
          -- Update this once avante adds a 4-6 pattern.
          model = "claude-sonnet-4-5",
          extra_request_body = {
            temperature = 0,
            max_tokens = 32768,
          },
        },
      },
      input = { provider = "snacks" },
      behaviour = {
        auto_suggestions = false,
        auto_set_keymaps = true,
        auto_apply_diff_after_generation = false,
        support_paste_from_clipboard = false,  -- requires img-clip.nvim if enabled
      },
      mappings = {
        ask = "<leader>aa",
        edit = "<leader>ae",
        refresh = "<leader>ar",
        toggle = {
          default = "<leader>at",
          debug = "<leader>ad",
          hint = "<leader>ah",
          suggestion = "<leader>as",
          repomap = "<leader>aR",
        },
        diff = {
          ours = "co",
          theirs = "ct",
          all_theirs = "ca",
          both = "cb",
          cursor = "cc",
          next = "]x",
          prev = "[x",
        },
        files = {
          add_current = "<leader>ac",
        },
      },
      windows = {
        position = "right",
        wrap = true,
        width = 40,
        sidebar_header = { rounded = true },
      },
    },
  },
}
