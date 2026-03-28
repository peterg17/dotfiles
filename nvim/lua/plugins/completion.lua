return {
  {
    "windwp/nvim-autopairs",
    event = "InsertEnter",
    opts = {
      check_ts = true, -- use treesitter to avoid pairing inside strings/comments
    },
  },

  {
    "saghen/blink.cmp",
    -- Use pre-compiled binaries from tagged releases (no Rust/cargo required)
    version = "*",
    opts = {
      keymap = { preset = "default" },
      appearance = {
        use_nvim_cmp_as_default = true,
        nerd_font_variant = "mono",
      },
      sources = {
        default = { "lsp", "path", "snippets", "buffer" },
      },
      completion = {
        documentation = {
          auto_show = true,
          auto_show_delay_ms = 200,
        },
      },
      signature = { enabled = true },
    },
  },
}
