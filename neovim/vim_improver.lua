-- vim-improver: NeoVim keylogging plugin
-- Logs keypresses to ~/.vim-improver/neovim.log for analysis by the vim-improver CLI.
--
-- Installation:
--   1. Copy this file to ~/.config/nvim/lua/vim_improver.lua
--   2. Add to your init.lua:
--        require('vim_improver').setup()

local M = {}

local LOG_DIR = vim.fn.expand("~/.vim-improver")
local LOG_FILE = LOG_DIR .. "/neovim.log"

-- Batch writes for performance
local buffer = {}
local FLUSH_SIZE = 20
local FLUSH_INTERVAL_MS = 3000

local function flush()
  if #buffer == 0 then return end
  local f = io.open(LOG_FILE, "a")
  if f then
    f:write(table.concat(buffer, "\n") .. "\n")
    f:close()
  end
  buffer = {}
end

local function log(key, mode)
  local entry = string.format('{"t":%d,"k":%s,"m":%s,"s":"nvim"}',
    os.time(),
    vim.json.encode(key),
    vim.json.encode(mode)
  )
  table.insert(buffer, entry)
  if #buffer >= FLUSH_SIZE then
    flush()
  end
end

local function is_printable(key)
  if #key > 1 then return false end -- multi-char = special key name
  local byte = string.byte(key, 1)
  return byte and byte >= 32 and byte < 127
end

M.setup = function(opts)
  opts = opts or {}

  -- Ensure log directory exists
  vim.fn.mkdir(LOG_DIR, "p")

  -- Periodic flush timer
  local timer = vim.uv.new_timer()
  timer:start(FLUSH_INTERVAL_MS, FLUSH_INTERVAL_MS, vim.schedule_wrap(flush))

  -- Flush cleanly on exit
  vim.api.nvim_create_autocmd("VimLeavePre", {
    callback = flush,
    desc = "vim-improver: flush log buffer on exit",
  })

  local ns = vim.api.nvim_create_namespace("vim_improver")

  vim.on_key(function(key)
    local ok, mode_info = pcall(vim.api.nvim_get_mode)
    if not ok then return end

    local mode = mode_info.mode
    local translated = vim.fn.keytrans(key)

    -- In insert/replace mode: skip printable characters for privacy.
    -- We still log control keys (Esc, Backspace, etc.) which reveal edit patterns.
    if mode == "i" or mode == "R" or mode == "Rc" or mode == "Rx" then
      if not is_printable(key) then
        log(translated, mode)
      end
    else
      log(translated, mode)
    end
  end, ns)
end

return M
