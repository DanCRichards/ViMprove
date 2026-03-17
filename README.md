# ViMprove

**Capture your Vim keystrokes. Find the inefficiencies. Level up.**

ViMprove watches how you use Vim across NeoVim and VSCode, detects patterns that suggest you could be moving faster, and gives you concrete, actionable tips based on your actual usage.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                         Vim Improver — Tips  [last 7d]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Found 3 area(s) to improve, sorted by impact:

   1. Repeated j/k  HIGH  (seen 142×)  category: Navigation

     You pressed j or k 3 or more times in a row frequently.
     Repeated j/k is a sign you're counting lines manually.

     Instead of:  j j j j j j j j j j
     Try:
       10j                        — jump 10 lines with a count
       }  / {                     — jump to next / previous blank line
       <C-d>  / <C-u>             — scroll half a page down / up
       /pattern  then n / N       — search and jump to what you're looking for

   2. Use ZZ instead of :wq  MED  (seen 23×)  category: Workflow

     :wq takes 4 keystrokes. ZZ does the same in 2.

     Instead of:  :wq<CR>
     Try:
       ZZ   — write and quit (2 keystrokes, no colon needed)

  ──────────────────────────────────────────────────────────────────────────────
```

---

## Features

- **NeoVim plugin** — captures every keystroke via `vim.on_key()`, with privacy filtering in insert mode
- **VSCode extension** — infers Vim operations from editor events (saves, cursor moves, undo/redo, deletions)
- **Scriptout support** — import any session recorded with `vim -w session.sout`
- **Rich CLI** — filterable by source and time window, colour-coded output
- **13 tips** across navigation, editing, text objects, workflow, and repeat patterns
- **Zero runtime dependencies** — Node.js stdlib only

---

## Install

### Homebrew (recommended)

```bash
brew tap DanCRichards/vimprove https://github.com/DanCRichards/ViMprove
brew install vimprove
```

Then follow the post-install instructions to set up the NeoVim plugin and/or VSCode extension.

### One-shot script

```bash
git clone https://github.com/DanCRichards/ViMprove.git
cd ViMprove
./install.sh
```

The installer:
- Builds the CLI and symlinks it into `~/.local/bin/vimprove`
- Copies the NeoVim plugin to `~/.config/nvim/lua/` and adds `require('vim_improver').setup()` to your `init.lua`
- Installs the VSCode extension via the VSCode CLI (if VSCode is found)

### Manual

```bash
git clone https://github.com/DanCRichards/ViMprove.git
cd ViMprove/cli
npm install && npm run build

# Symlink or add to PATH:
ln -sf "$PWD/dist/vimprove.js" ~/.local/bin/vimprove
```

---

## Data sources

### NeoVim plugin

The most accurate source. Uses `vim.on_key()` to capture every keystroke with its mode.

**Setup:**

```bash
# Copy the plugin
cp neovim/vim_improver.lua ~/.config/nvim/lua/

# Add to init.lua
echo "require('vim_improver').setup()" >> ~/.config/nvim/init.lua
```

Data is written to `~/.vim-improver/neovim.log`.

### VSCode extension

Works alongside the [vscodevim](https://marketplace.visualstudio.com/items?itemName=vscodevim.vim) extension. Because VSCode's `type` event is monopolised by vscodevim, the extension infers Vim operations from editor events (cursor deltas, document changes, undo/redo). This is less precise than the NeoVim plugin but still catches the most common inefficiency patterns.

**Setup:**

```bash
# Build and install the extension
cd vscode
npx @vscode/vsce package --allow-missing-repository --no-dependencies
code --install-extension vim-improver-0.1.0.vsix
```

Then restart VSCode. A status bar item (⌨ Vim Improver) confirms the extension is active.

Data is written to `~/.vim-improver/vscode.log`.

### Plain Vim with `-w` scriptout

Works with any terminal Vim session. Add this alias to your shell rc:

```bash
alias vim='vim -w ~/.vim-improver/$(date +%s).sout'
```

Then import the recorded file:

```bash
vimprove import ~/.vim-improver/1234567890.sout
```

Or record a one-off session manually:

```bash
nvim -w ~/session.sout myfile.txt
vimprove import ~/session.sout
```

Data is written to `~/.vim-improver/imported.log`.

---

## CLI reference

```
vimprove [command] [--source <src>] [--since <period>]
```

| Command | Description |
|---|---|
| `report` | Full stats + tips (default) |
| `stats` | Keystroke breakdown by source, mode, and key |
| `tips` | Personalised improvement tips |
| `sources` | Show what data is available per source |
| `import <file>` | Import a Vim `-w` scriptout file |
| `clear` | Delete all collected log data |
| `help` | Show usage |

**Filters** — work with `stats`, `tips`, and `report`:

| Flag | Values | Default |
|---|---|---|
| `--source` / `-s` | `nvim`, `vscode`, `scriptout`, `all` | `all` |
| `--since` | `1h`, `24h`, `7d`, `30d`, `all` | `all` |

**Examples:**

```bash
vimprove report
vimprove report --source nvim
vimprove tips   --source vscode --since 7d
vimprove stats  --since 24h
vimprove sources
```

---

## Tips detected

| Category | Tip |
|---|---|
| Navigation | Repeated `j`/`k` → use counts, `{`/`}`, `<C-d>`/`<C-u>`, search |
| Navigation | Repeated `h`/`l` → use `w`/`b`/`e`/`f`/`t`/`$`/`0` |
| Navigation | Arrow keys → `hjkl` |
| Editing | Repeated `x` → `d{n}`, `dw`, `diw` |
| Editing | `d$` → `D`, `c$` → `C` |
| Editing | `i<Esc>` → `r` or `s` |
| Editing | Excessive `u` presses → use count, `:earlier` |
| Workflow | `u`/`<C-r>` oscillation → use marks (`ma`, `'a`) |
| Workflow | Rapid `:w` saves → enable `autowrite` |
| Workflow | `:wq` → `ZZ` |
| Text Objects | `^dw` pattern → `diw`, `daw`, `ciw` |
| Repeat | Same 2-key sequence back-to-back → `.` repeat |

---

## Privacy

- **NeoVim**: Characters typed in insert/replace mode are **never logged**. Only control keys (Esc, Backspace, arrows) and normal-mode keystrokes are recorded.
- **VSCode**: Text content is never logged. Only operation shapes (single-char delete, range delete, insert happened) are recorded.
- **Scriptout**: Insert-mode printable characters are filtered out during import.

All data stays local in `~/.vim-improver/`. Nothing is sent anywhere.

---

## Log format

Each source writes [JSONL](https://jsonlines.org/) — one JSON object per line:

```json
{"t":1700000000,"k":"j","m":"n","s":"nvim"}
```

| Field | Type | Description |
|---|---|---|
| `t` | integer | Unix timestamp (seconds) |
| `k` | string | Key name (`j`, `<Esc>`, `:wq`, …) |
| `m` | string | Vim mode (`n`, `i`, `v`, `c`) |
| `s` | string | Source (`nvim`, `vscode`, `scriptout`) |

---

## Development

```bash
cd cli
npm install
npm run typecheck   # type-check without building
npm run build       # produces dist/vimprove.js
node dist/vimprove.js help
```

The CLI is TypeScript bundled with [esbuild](https://esbuild.github.io/) into a single file with no runtime dependencies.

See [`docs/`](docs/) for architecture notes, the log format spec, research on IDE Vim plugin APIs, and a guide to adding new tips.

---

## Contributing

1. Fork the repo
2. Add or improve a tip in `cli/src/tips.ts` — see [`docs/adding-tips.md`](docs/adding-tips.md)
3. Run `npm run typecheck && npm run build` to verify
4. Open a PR

Bug reports and feature requests welcome via [GitHub Issues](https://github.com/DanCRichards/ViMprove/issues).

---

## License

MIT — see [LICENSE](LICENSE).
