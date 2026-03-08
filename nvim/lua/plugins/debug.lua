return {
  -- Debug Adapter Protocol client
  {
    "mfussenegger/nvim-dap",
    keys = {
      { "<leader>db", function() require("dap").toggle_breakpoint() end, desc = "DAP: Toggle breakpoint" },
      { "<leader>dc", function() require("dap").continue() end,          desc = "DAP: Continue" },
      { "<leader>dn", function() require("dap").step_over() end,         desc = "DAP: Step over" },
      { "<leader>di", function() require("dap").step_into() end,         desc = "DAP: Step into" },
      { "<leader>do", function() require("dap").step_out() end,          desc = "DAP: Step out" },
      { "<leader>dq", function() require("dap").terminate() end,         desc = "DAP: Terminate" },
      { "<leader>du", function() require("dapui").toggle() end,          desc = "DAP: Toggle UI" },
      { "<leader>dr", function() require("dap").repl.open() end,         desc = "DAP: Open REPL" },
    },
    config = function()
      local dap = require("dap")

      -- Go: delve
      dap.adapters.go = {
        type = "server",
        port = "${port}",
        executable = {
          command = vim.fn.stdpath("data") .. "/mason/bin/dlv",
          args = { "dap", "-l", "127.0.0.1:${port}" },
        },
      }
      dap.configurations.go = {
        { type = "go", name = "Debug",        request = "launch", program = "${file}" },
        { type = "go", name = "Debug (test)", request = "launch", mode = "test", program = "${file}" },
        { type = "go", name = "Debug package",request = "launch", program = "${fileDirname}" },
      }

      -- Python: debugpy
      dap.adapters.python = function(cb, config)
        if config.request == "attach" then
          local port = (config.connect or config).port
          local host = (config.connect or config).host or "127.0.0.1"
          cb({ type = "server", port = port, host = host })
        else
          cb({
            type = "executable",
            command = vim.fn.stdpath("data") .. "/mason/packages/debugpy/venv/bin/python",
            args = { "-m", "debugpy.adapter" },
            options = { source_filetype = "python" },
          })
        end
      end
      dap.configurations.python = {
        {
          type = "python",
          request = "launch",
          name = "Launch file",
          program = "${file}",
          pythonPath = function()
            local venv = os.getenv("VIRTUAL_ENV")
            if venv then return venv .. "/bin/python" end
            return "python3"
          end,
        },
      }
    end,
  },

  -- DAP UI: visual interface for debugging
  {
    "rcarriga/nvim-dap-ui",
    dependencies = {
      "mfussenegger/nvim-dap",
      "nvim-neotest/nvim-nio",
    },
    config = function()
      local dap, dapui = require("dap"), require("dapui")
      dapui.setup()
      -- Auto open/close UI when a debug session starts/ends
      dap.listeners.after.event_initialized["dapui_config"]  = function() dapui.open() end
      dap.listeners.before.event_terminated["dapui_config"]  = function() dapui.close() end
      dap.listeners.before.event_exited["dapui_config"]      = function() dapui.close() end
    end,
  },

  -- nvim-nio: async I/O library required by dap-ui
  { "nvim-neotest/nvim-nio", lazy = true },

  -- mason-nvim-dap: auto-installs debug adapters via mason
  {
    "jay-babu/mason-nvim-dap.nvim",
    dependencies = { "williamboman/mason.nvim", "mfussenegger/nvim-dap" },
    opts = {
      ensure_installed = { "delve", "debugpy" },
      automatic_installation = true,
    },
  },
}
