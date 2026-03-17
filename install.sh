#!/usr/bin/env bash
set -euo pipefail

# ── vim-improver installer ────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$HOME/.vim-improver"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }
info() { echo -e "  ${CYAN}→${RESET} $1"; }
warn() { echo -e "  ${YELLOW}!${RESET} $1"; }
fail() { echo -e "  ${RED}✗${RESET} $1"; }
h1()   { echo -e "\n${BOLD}${CYAN}$1${RESET}"; echo "  $(printf '─%.0s' $(seq 1 50))"; }

echo -e "\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${CYAN}       Vim Improver — Installer          ${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

# ── 1. Log directory ──────────────────────────────────────────────────────────

h1 "1. Log directory"
mkdir -p "$LOG_DIR"
ok "Created $LOG_DIR"

# ── 2. CLI tool ───────────────────────────────────────────────────────────────

h1 "2. CLI tool"

if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install it from https://nodejs.org and re-run."
  exit 1
fi

chmod +x "$SCRIPT_DIR/cli/index.js"

# Try to symlink into a directory on PATH
INSTALL_BIN=""
for candidate in "$HOME/.local/bin" "$HOME/bin" "/usr/local/bin"; do
  if [[ -d "$candidate" ]] && echo "$PATH" | grep -q "$candidate"; then
    INSTALL_BIN="$candidate"
    break
  fi
done

if [[ -z "$INSTALL_BIN" ]]; then
  # Try to create ~/.local/bin
  mkdir -p "$HOME/.local/bin"
  INSTALL_BIN="$HOME/.local/bin"
  warn "Created $HOME/.local/bin — make sure it is on your PATH:"
  warn "  Add to your shell rc:  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

ln -sf "$SCRIPT_DIR/cli/index.js" "$INSTALL_BIN/vim-improver"
ok "Installed vim-improver → $INSTALL_BIN/vim-improver"
ok "Run: vim-improver help"

# ── 3. NeoVim plugin ──────────────────────────────────────────────────────────

h1 "3. NeoVim plugin"

NVIM_LUA_DIR=""
for candidate in \
  "$HOME/.config/nvim/lua" \
  "${XDG_CONFIG_HOME:-$HOME/.config}/nvim/lua"
do
  if [[ -d "$candidate" ]]; then
    NVIM_LUA_DIR="$candidate"
    break
  fi
done

if [[ -z "$NVIM_LUA_DIR" ]]; then
  warn "NeoVim lua dir not found (~/.config/nvim/lua). Skipping."
  warn "Create it and re-run, or manually copy:"
  warn "  cp \"$SCRIPT_DIR/neovim/vim_improver.lua\" ~/.config/nvim/lua/"
else
  cp "$SCRIPT_DIR/neovim/vim_improver.lua" "$NVIM_LUA_DIR/vim_improver.lua"
  ok "Copied plugin to $NVIM_LUA_DIR/vim_improver.lua"

  INIT_LUA=""
  for candidate in \
    "$HOME/.config/nvim/init.lua" \
    "${XDG_CONFIG_HOME:-$HOME/.config}/nvim/init.lua"
  do
    if [[ -f "$candidate" ]]; then
      INIT_LUA="$candidate"
      break
    fi
  done

  SETUP_LINE="require('vim_improver').setup()"

  if [[ -z "$INIT_LUA" ]]; then
    warn "init.lua not found. Add this to yours manually:"
    warn "  $SETUP_LINE"
  elif grep -qF "$SETUP_LINE" "$INIT_LUA"; then
    ok "init.lua already contains setup call"
  else
    echo "" >> "$INIT_LUA"
    echo "-- vim-improver" >> "$INIT_LUA"
    echo "$SETUP_LINE" >> "$INIT_LUA"
    ok "Added setup call to $INIT_LUA"
  fi
fi

# ── 4. VSCode extension ───────────────────────────────────────────────────────

h1 "4. VSCode extension"

# Find the VSCode CLI (not always on PATH on macOS)
VSCODE_CLI=""
for candidate in \
  "code" \
  "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
  "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
do
  if command -v "$candidate" &>/dev/null 2>&1 || [[ -x "$candidate" ]]; then
    VSCODE_CLI="$candidate"
    break
  fi
done

VSIX="$SCRIPT_DIR/vscode/vim-improver-0.1.0.vsix"

if [[ -z "$VSCODE_CLI" ]]; then
  warn "VSCode not found — skipping VSCode extension."
  warn "Install manually: open VSCode → Extensions → '...' → 'Install from VSIX...'"
  warn "  VSIX file: $VSIX"
elif [[ ! -f "$VSIX" ]]; then
  warn "VSIX not built yet. Run from the vscode/ directory:"
  warn "  npx @vscode/vsce package --allow-missing-repository --no-dependencies"
  warn "Then re-run install.sh."
else
  "$VSCODE_CLI" --install-extension "$VSIX" --force 2>&1 | grep -v "^$" | while read -r line; do
    ok "$line"
  done
  info "Restart VSCode to activate the extension."
fi

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${GREEN}  Done! Use Vim for a while, then run:${RESET}"
echo -e "${BOLD}${CYAN}    vim-improver report${RESET}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
