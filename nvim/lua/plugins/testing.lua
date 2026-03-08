return {
  {
    "nvim-neotest/neotest",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "nvim-treesitter/nvim-treesitter",
      "antoinemadec/FixCursorHold.nvim",
      "nvim-neotest/neotest-go",
      "nvim-neotest/neotest-python",
      "rcasia/neotest-java",
    },
    keys = {
      { "<leader>tt", function() require("neotest").run.run() end,                           desc = "Test: Run nearest" },
      { "<leader>tT", function() require("neotest").run.run(vim.fn.expand("%")) end,         desc = "Test: Run file" },
      { "<leader>ts", function() require("neotest").summary.toggle() end,                    desc = "Test: Toggle summary" },
      { "<leader>to", function() require("neotest").output.open({ enter = true }) end,       desc = "Test: Open output" },
      { "<leader>tO", function() require("neotest").output_panel.toggle() end,               desc = "Test: Toggle output panel" },
      { "<leader>td", function() require("neotest").run.run({ strategy = "dap" }) end,       desc = "Test: Debug nearest" },
      { "<leader>tS", function() require("neotest").run.stop() end,                          desc = "Test: Stop" },
      { "[t",         function() require("neotest").jump.prev({ status = "failed" }) end,    desc = "Prev failed test" },
      { "]t",         function() require("neotest").jump.next({ status = "failed" }) end,    desc = "Next failed test" },
    },
    opts = function()
      return {
        adapters = {
          require("neotest-go")({
            experimental = { test_table = true },
          }),
          require("neotest-python")({
            dap = { justMyCode = false },
            runner = "pytest",
          }),
          require("neotest-java")({
            ignore_wrapper = false,
          }),
        },
      }
    end,
  },
}
