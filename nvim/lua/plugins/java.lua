return {
  {
    "mfussenegger/nvim-jdtls",
    ft = "java",
    config = function()
      local function attach_jdtls()
        local home = vim.fn.expand("~")
        local mason_path = vim.fn.stdpath("data") .. "/mason"
        local jdtls_path = mason_path .. "/packages/jdtls"
        local lombok_path = jdtls_path .. "/lombok.jar"

        -- Per-project workspace directory to keep separate jdtls indexes
        local project_name = vim.fn.fnamemodify(vim.fn.getcwd(), ":p:h:t")
        local workspace_dir = home .. "/.local/share/nvim/jdtls/" .. project_name

        -- OS-specific config folder
        local os_config
        local uname = vim.uv.os_uname().sysname
        if uname == "Linux" then
          os_config = "linux"
        elseif uname == "Darwin" then
          os_config = "mac"
        else
          os_config = "win"
        end

        -- Find the launcher JAR installed by mason
        local launcher = vim.fn.glob(jdtls_path .. "/plugins/org.eclipse.equinox.launcher_*.jar")
        if launcher == "" then
          vim.notify("jdtls launcher jar not found — run :Mason to install jdtls", vim.log.levels.WARN)
          return
        end

        local cmd = {
          "java",
          "-Declipse.application=org.eclipse.jdt.ls.core.id1",
          "-Dosgi.bundles.defaultStartLevel=4",
          "-Declipse.product=org.eclipse.jdt.ls.core.product",
          "-Dlog.protocol=true",
          "-Dlog.level=ALL",
          "-Xmx2g",
          "--add-modules=ALL-SYSTEM",
          "--add-opens", "java.base/java.util=ALL-UNNAMED",
          "--add-opens", "java.base/java.lang=ALL-UNNAMED",
          "-jar", launcher,
          "-configuration", jdtls_path .. "/config_" .. os_config,
          "-data", workspace_dir,
        }

        -- Inject lombok agent if present
        if vim.fn.filereadable(lombok_path) == 1 then
          table.insert(cmd, 2, "-javaagent:" .. lombok_path)
        end

        -- Collect bundles from mason-installed vscode-java-test and java-debug-adapter
        local bundles = {}
        local mason_packages = vim.fn.stdpath("data") .. "/mason/packages"
        vim.list_extend(bundles, vim.split(
          vim.fn.glob(mason_packages .. "/java-test/extension/server/*.jar"), "\n", { trimempty = true }
        ))
        vim.list_extend(bundles, vim.split(
          vim.fn.glob(mason_packages .. "/java-debug-adapter/extension/server/com.microsoft.java.debug.plugin-*.jar"),
          "\n", { trimempty = true }
        ))

        local config = {
          cmd = cmd,
          root_dir = require("jdtls.setup").find_root({ "gradlew", "mvnw", "pom.xml", "build.gradle", ".git" }),
          settings = {
            java = {
              eclipse = { downloadSources = true },
              configuration = { updateBuildConfiguration = "interactive" },
              maven = { downloadSources = true },
              implementationsCodeLens = { enabled = true },
              referencesCodeLens = { enabled = true },
              format = {
                enabled = true,
                settings = {
                  url = vim.fn.getcwd() .. "/ide/eclipse/formatting.xml",
                  profile = "Datadog Profiling Team",
                },
              },
              completion = {
                importOrder = { "java", "javax", "org", "com", "" },
              },
              inlayHints = { parameterNames = { enabled = "all" } },
            },
            redhat = { telemetry = { enabled = false } },
          },
          init_options = { bundles = bundles },
        }

        require("jdtls").start_or_attach(config)

        -- Java-specific keymaps (buffer-local)
        local jdtls = require("jdtls")
        local map = function(keys, func, desc)
          vim.keymap.set('n', keys, func, { buffer = 0, desc = 'Java: ' .. desc })
        end
        map('<leader>jf', function()
          local file = vim.api.nvim_buf_get_name(0)
          vim.notify("Running spotlessApply on " .. vim.fn.fnamemodify(file, ':t') .. "...")
          local output = {}
          vim.fn.jobstart(
            { './gradlew', 'spotlessApply', '--daemon', '-PspotlessFiles=' .. file },
            {
              cwd = vim.fn.getcwd(),
              stdout_buffered = true,
              stderr_buffered = true,
              on_stdout = function(_, data) vim.list_extend(output, data) end,
              on_stderr = function(_, data) vim.list_extend(output, data) end,
              on_exit = function(_, code)
                if code == 0 then
                  vim.cmd('checktime')
                  vim.notify("spotlessApply done")
                else
                  vim.notify(table.concat(output, "\n"), vim.log.levels.ERROR)
                end
              end,
            }
          )
        end, 'Run spotlessApply (current file)')
        map('<leader>jo', jdtls.organize_imports,   'Organize imports')
        map('<leader>jv', jdtls.extract_variable,   'Extract variable')
        map('<leader>jm', jdtls.extract_method,     'Extract method')
        map('<leader>jc', jdtls.extract_constant,   'Extract constant')
        map('<leader>jt', jdtls.test_nearest_method,'Test nearest method')
        map('<leader>jT', jdtls.test_class,         'Test class')
      end

      -- Attach for the current buffer (plugin is loaded via ft = "java")
      attach_jdtls()

      -- Attach for all subsequent Java buffers opened in this session
      vim.api.nvim_create_autocmd("FileType", {
        pattern = "java",
        callback = attach_jdtls,
      })
    end,
  },
}
