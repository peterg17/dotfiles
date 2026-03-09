-- Sync clipboard after UI enters (deferred to avoid startup slowdown)
vim.api.nvim_create_autocmd('UIEnter', {
  callback = function()
    vim.o.clipboard = 'unnamedplus'
  end,
})

-- Highlight when yanking (copying) text
vim.api.nvim_create_autocmd('TextYankPost', {
  desc = 'Highlight when yanking text',
  callback = function()
    vim.hl.on_yank()
  end,
})

-- 2-space indent for JSON/JSONC
vim.api.nvim_create_autocmd('FileType', {
  pattern = { 'json', 'jsonc' },
  callback = function()
    vim.bo.shiftwidth = 2
    vim.bo.tabstop = 2
    vim.bo.expandtab = true
  end,
})

-- Format JSON on save + manual format keymap
vim.api.nvim_create_autocmd('FileType', {
  pattern = { 'json', 'jsonc' },
  callback = function(args)
    vim.api.nvim_create_autocmd('BufWritePre', {
      buffer = args.buf,
      callback = function()
        vim.lsp.buf.format({ async = false })
      end,
    })
    vim.keymap.set('n', '<leader>jf', function()
      vim.lsp.buf.format({ async = false })
    end, { buffer = args.buf, desc = 'Format JSON' })
  end,
})

-- Format on save for LSP-supported filetypes (excluding Java — use spotlessApply instead)
vim.api.nvim_create_autocmd('BufWritePre', {
  pattern = { '*.go', '*.py', '*.json', '*.jsonc' },
  callback = function(args)
    vim.lsp.buf.format({ bufnr = args.buf, async = false })
  end,
})

-- Git blame for current line
vim.api.nvim_create_user_command('GitBlameLine', function()
  local line = vim.fn.line('.')
  local file = vim.api.nvim_buf_get_name(0)
  print(vim.fn.system({ 'git', 'blame', '-L', line .. ',+1', file }))
end, { desc = 'Git blame current line' })

-- Disable nohlsearch via packadd
vim.cmd('packadd! nohlsearch')

-- Make active tab clearly visible (applied after all plugins load, and on colorscheme change)
vim.api.nvim_create_autocmd({ 'VimEnter', 'ColorScheme' }, {
  pattern = '*',
  callback = function()
    vim.api.nvim_set_hl(0, 'TabLineSel', { bold = true, reverse = true })
  end,
})
