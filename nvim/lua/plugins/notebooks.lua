return {
  -- Auto-convert .ipynb <-> percent-format .py so Molten can work with notebooks
  {
    "GCBallesteros/jupytext.nvim",
    opts = {
      style = "hydrogen",      -- use # %% cell markers
      output_extension = "py",
      force_ft = "python",
    },
  },

  {
    "benlubas/molten-nvim",
    version = "^1.0.0",
    build = ":UpdateRemotePlugins",
    init = function()
      vim.g.molten_image_provider = "none"  -- no image support in mosh
      vim.g.molten_wrap_output = true
      vim.g.molten_virt_text_output = true  -- show output inline as virtual text
      vim.g.molten_virt_lines_off_by_1 = true
    end,
    keys = {
      { "<leader>mi", "<cmd>MoltenInit<CR>",                              desc = "Molten: init kernel" },
      { "<leader>mr", "<cmd>MoltenReevaluateCell<CR>",                    desc = "Molten: re-run cell" },
      { "<leader>ml", "<cmd>MoltenEvaluateLine<CR>",                      desc = "Molten: run line" },
      { "<leader>mo", "<cmd>MoltenShowOutput<CR>",                        desc = "Molten: show output" },
      { "<leader>md", "<cmd>MoltenDelete<CR>",                            desc = "Molten: delete cell" },
      { "<leader>mx", "<cmd>MoltenInterrupt<CR>",                         desc = "Molten: interrupt kernel" },
      { "<leader>mv", "<cmd>MoltenEvaluateVisual<CR>", mode = "v",        desc = "Molten: run selection" },
      { "]m",         "<cmd>MoltenNextCell<CR>",                          desc = "Next molten cell" },
      { "[m",         "<cmd>MoltenPrevCell<CR>",                          desc = "Prev molten cell" },
    },
  },
}
