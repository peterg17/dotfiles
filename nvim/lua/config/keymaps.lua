-- Terminal: exit with <Esc>
vim.keymap.set('t', '<Esc>', '<C-\\><C-n>', { desc = 'Exit terminal mode' })

-- Window navigation with Alt + hjkl (works from terminal/insert/normal mode)
vim.keymap.set({ 't', 'i' }, '<A-h>', '<C-\\><C-n><C-w>h', { desc = 'Window left' })
vim.keymap.set({ 't', 'i' }, '<A-j>', '<C-\\><C-n><C-w>j', { desc = 'Window down' })
vim.keymap.set({ 't', 'i' }, '<A-k>', '<C-\\><C-n><C-w>k', { desc = 'Window up' })
vim.keymap.set({ 't', 'i' }, '<A-l>', '<C-\\><C-n><C-w>l', { desc = 'Window right' })
vim.keymap.set('n', '<A-h>', '<C-w>h', { desc = 'Window left' })
vim.keymap.set('n', '<A-j>', '<C-w>j', { desc = 'Window down' })
vim.keymap.set('n', '<A-k>', '<C-w>k', { desc = 'Window up' })
vim.keymap.set('n', '<A-l>', '<C-w>l', { desc = 'Window right' })

-- Clear search highlights
vim.keymap.set('n', '<Esc>', '<cmd>nohlsearch<CR>', { desc = 'Clear search highlight' })

-- Buffer navigation
vim.keymap.set('n', '[b', '<cmd>bprev<CR>', { desc = 'Previous buffer' })
vim.keymap.set('n', ']b', '<cmd>bnext<CR>', { desc = 'Next buffer' })

-- Quickfix navigation
vim.keymap.set('n', '[q', '<cmd>cprev<CR>', { desc = 'Previous quickfix item' })
vim.keymap.set('n', ']q', '<cmd>cnext<CR>', { desc = 'Next quickfix item' })

-- Jump to avante input window (useful after opening with <leader>aa from visual selection)
vim.keymap.set('n', '<leader>ai', function()
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    pcall(function()
      local buf = vim.api.nvim_win_get_buf(win)
      if vim.bo[buf].filetype == 'AvanteInput' then
        vim.api.nvim_set_current_win(win)
      end
    end)
  end
end, { desc = 'Focus avante input' })

-- Quick save
vim.keymap.set('n', '<leader>w', '<cmd>w<CR>', { desc = 'Save file' })

-- Session management
-- Close all plugin UI windows (DAP, Avante, neotest, etc.) before saving —
-- they have buftype=nofile and can't be restored, leaving blank windows.
vim.keymap.set('n', '<leader>ss', function()
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    pcall(function()
      local buf = vim.api.nvim_win_get_buf(win)
      if vim.bo[buf].buftype == 'nofile' then
        vim.api.nvim_win_close(win, false)
      end
    end)
  end
  vim.cmd('mksession! ~/session.vim')
  vim.notify('Session saved')
end, { desc = 'Save session' })
vim.keymap.set('n', '<leader>sr', '<cmd>source ~/session.vim<CR>', { desc = 'Restore session' })

-- Terminal splits
vim.keymap.set('n', '<leader>th', '<cmd>split | terminal<CR>', { desc = 'Terminal horizontal split' })
vim.keymap.set('n', '<leader>tv', '<cmd>vsplit | terminal<CR>', { desc = 'Terminal vertical split' })

-- Window resizing with Alt + arrow keys (vertical splits / height)
vim.keymap.set('n', '<A-Up>',    '<cmd>resize +2<CR>',          { desc = 'Resize window taller' })
vim.keymap.set('n', '<A-Down>',  '<cmd>resize -2<CR>',          { desc = 'Resize window shorter' })
vim.keymap.set('n', '<A-Left>',  '<cmd>vertical resize -2<CR>', { desc = 'Resize window narrower' })
vim.keymap.set('n', '<A-Right>', '<cmd>vertical resize +2<CR>', { desc = 'Resize window wider' })

-- Window resizing with Alt + < / > (horizontal splits / width)
vim.keymap.set('n', '<A-,>', '<cmd>resize -2<CR>',          { desc = 'Resize window shorter' })
vim.keymap.set('n', '<A-.>', '<cmd>resize +2<CR>',          { desc = 'Resize window taller' })
