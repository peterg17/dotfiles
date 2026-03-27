return {
  -- Mason: installs LSP servers and tools
  {
    "williamboman/mason.nvim",
    cmd = "Mason",
    build = ":MasonUpdate",
    config = function()
      require("mason").setup({ ui = { border = "rounded" } })

      -- Ensure jdtls is installed (nvim-jdtls manages it, not mason-lspconfig)
      local registry = require("mason-registry")
      registry.refresh(function()
        for _, name in ipairs({ "jdtls", "java-test", "java-debug-adapter" }) do
          local pkg = registry.get_package(name)
          if not pkg:is_installed() then
            pkg:install()
          end
        end
      end)
    end,
  },

  -- Bridge mason <-> nvim-lspconfig (handles installing gopls, pyright, jsonls)
  {
    "williamboman/mason-lspconfig.nvim",
    dependencies = { "williamboman/mason.nvim" },
    opts = {
      ensure_installed = { "gopls", "pyright", "jsonls", "ts_ls" },
      automatic_installation = true,
    },
  },

  -- JSON schema store for jsonls
  { "b0o/SchemaStore.nvim", lazy = true },

  -- nvim-lspconfig: provides server definitions registered into vim.lsp.config
  {
    "neovim/nvim-lspconfig",
    event = { "BufReadPre", "BufNewFile" },
    dependencies = {
      "williamboman/mason.nvim",
      "williamboman/mason-lspconfig.nvim",
      "b0o/SchemaStore.nvim",
    },
    config = function()
      -- Diagnostic display
      vim.diagnostic.config({
        virtual_text = true,
        signs = true,
        underline = true,
        update_in_insert = false,
        severity_sort = true,
        float = { border = "rounded", source = true },
      })

      -- Buffer-local LSP keymaps via LspAttach autocmd (nvim 0.11 style)
      vim.api.nvim_create_autocmd('LspAttach', {
        callback = function(ev)
          local bufnr = ev.buf
          local map = function(keys, func, desc)
            vim.keymap.set('n', keys, func, { buffer = bufnr, desc = 'LSP: ' .. desc })
          end
          map('K',          vim.lsp.buf.hover,                                    'Hover docs')
          map('<leader>rn', vim.lsp.buf.rename,                                   'Rename')
          map('<leader>ca', vim.lsp.buf.code_action,                              'Code action')
          map('<leader>cf', function() vim.lsp.buf.format({ async = false, timeout_ms = 5000 }) end, 'Format')
          map('[d',         vim.diagnostic.goto_prev,                             'Prev diagnostic')
          map(']d',         vim.diagnostic.goto_next,                             'Next diagnostic')
          map('<leader>cd', vim.diagnostic.open_float,                            'Diagnostics float')
        end,
      })

      -- Server-specific settings merged with lspconfig defaults
      vim.lsp.config('gopls', {
        settings = {
          gopls = {
            gofumpt = true,
            analyses = { unusedparams = true },
            staticcheck = true,
          },
        },
      })

      vim.lsp.config('pyright', {
        settings = {
          pyright = { autoImportCompletion = true },
          python = {
            analysis = {
              autoSearchPaths = true,
              diagnosticMode = "openFilesOnly",
              useLibraryCodeForTypes = true,
              typeCheckingMode = "basic",
            },
          },
        },
      })

      vim.lsp.config('jsonls', {
        settings = {
          json = {
            validate = { enable = true },
            format = { enable = true },
            schemas = require("schemastore").json.schemas(),
          },
        },
      })

      -- TypeScript: use vim.lsp.start() directly in a FileType autocmd so we
      -- can detect Yarn PnP SDK per-project at buffer-open time.
      vim.api.nvim_create_autocmd('FileType', {
        pattern = { 'typescript', 'typescriptreact', 'javascript', 'javascriptreact' },
        callback = function(ev)
          local root = vim.fs.root(ev.buf, { 'tsconfig.json', 'package.json', '.git' })
          if not root then return end

          local cmd
          local init_opts = { hostInfo = "neovim" }
          local yarn_server = root .. "/.yarn/sdks/typescript-language-server/lib/cli.mjs"
          local yarn_tsserver = root .. "/.yarn/sdks/typescript/bin/tsserver"

          if vim.fn.filereadable(yarn_server) == 1 then
            cmd = { "node", yarn_server, "--stdio" }
            init_opts.tsserver = { path = yarn_tsserver }
          else
            cmd = { "typescript-language-server", "--stdio" }
          end

          vim.lsp.start({
            name = "ts_ls",
            cmd = cmd,
            root_dir = root,
            init_options = init_opts,
          }, { bufnr = ev.buf })
        end,
      })

      -- Enable servers — they auto-start when relevant files are opened
      vim.lsp.enable({ 'gopls', 'pyright', 'jsonls' })
    end,
  },
}
