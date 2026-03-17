# ViMprove

> *Stop counting lines. Stop reaching for arrow keys. Stop doing with ten keystrokes what Vim can do in two.*

ViMprove silently watches how you use Vim — across NeoVim, VSCode, and plain terminal Vim — detects the inefficiency patterns you repeat most, and gives you targeted, actionable advice based on your **actual** behaviour.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                      Vim Improver — Tips  [source: nvim · last 7d]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Found 4 area(s) to improve, sorted by impact:

   1. Holding j to move down many lines  HIGH  (seen 28×)  category: Navigation
      id: repeated_j

     Tapping j many times to reach a line wastes keystrokes. Vim has faster
     vertical motions for every distance — pick the right one for how far you need to go.

     Instead of:  jjjjjjjj  (8 taps to move 8 lines)
     Try:
       8j             — count + j: move exactly 8 lines
       }  /  {        — next / previous blank-line paragraph
       <C-d>          — half-page down
       /word<CR>      — search and jump directly to content
       *              — jump to next occurrence of word under cursor

     Dismiss this tip:  vimprove dismiss repeated_j

  ──────────────────────────────────────────────────────────────────────────────

   2. Never using macros (q / @)  HIGH  (seen 12×)  category: Workflow
      id: not_using_macros

     Macros record any sequence of keystrokes and replay them with a single
     command. One macro can replace thousands of manual edits.

     Instead of:  Manually repeating the same multi-step edit on every line
     Try:
       qa         — start recording into register a
       ...        — perform your edit sequence
       q          — stop recording
       @a         — replay   @@  — replay last   50@a  — replay 50 times
```

---

## How it works

```
  NeoVim plugin ─────────────────────────────────────────────┐
  (vim.on_key — every keystroke, exact mode)                 │
                                                             ▼
  VSCode extension ──────────────────────────────►  ~/.vim-improver/
  (editor event inference — saves, cursors, undo)   (JSONL log files)
                                                             │
  vim -w alias ──────────────────────────────────────────────┘
  (scriptout binary → vimprove import)

                                    ▼

                          vimprove report
                    (reads logs, detects patterns,
                     surfaces personalised tips)
```

Nothing leaves your machine. All data lives in `~/.vim-improver/`.

---

## Features

- **22 tips** across Navigation, Editing, Text Objects, Workflow, and Repeat
- **NeoVim plugin** — captures every keystroke with exact mode via `vim.on_key()`
- **VSCode extension** — infers Vim operations from editor events alongside vscodevim
- **Plain Vim alias** — `vim -w` scriptout recording, importable at any time
- **Progress tracking** — compare this week vs last week to see if you're improving
- **Session summary** — instant recap of your last Vim session
- **Tip dismissal** — suppress tips you've already absorbed
- **Source + time filters** — slice data by `--source nvim` or `--since 7d`
- **Zero runtime dependencies** — Node.js stdlib only, single bundled file

---

## Install

### Homebrew

```bash
brew tap DanCRichards/vimprove https://github.com/DanCRichards/ViMprove
brew install vimprove
```

Follow the post-install caveats to wire up the NeoVim plugin and/or VSCode extension.

### One-shot script

```bash
git clone https://github.com/DanCRichards/ViMprove.git
cd ViMprove
./install.sh
```

The script builds the CLI, symlinks it onto your PATH, copies the NeoVim plugin into `~/.config/nvim/lua/`, appends `require('vim_improver').setup()` to your `init.lua`, and installs the VSCode extension if VSCode is found.

### Manual

```bash
git clone https://github.com/DanCRichards/ViMprove.git
cd ViMprove/cli && npm install && npm run build
ln -sf "$PWD/dist/vimprove.js" ~/.local/bin/vimprove
```

---

## Data sources

### NeoVim  *(most accurate)*

Uses `vim.on_key()` to capture every keystroke with its exact Vim mode. Insert-mode printable characters are never logged — only control keys and normal-mode keystrokes.

```bash
# Copy plugin
cp neovim/vim_improver.lua ~/.config/nvim/lua/

# Add to init.lua
echo "require('vim_improver').setup()" >> ~/.config/nvim/init.lua
```

Logs to `~/.vim-improver/neovim.log`.

### VSCode  *(good coverage)*

Works alongside the [vscodevim](https://marketplace.visualstudio.com/items?itemName=vscodevim.vim) extension. Because VSCode's `type` event is monopolised by vscodevim, the extension infers Vim operations from editor events: cursor deltas, document changes, undo/redo. A status bar item `⌨ Vim Improver` confirms it's active.

```bash
cd vscode
npx @vscode/vsce package --allow-missing-repository --no-dependencies
code --install-extension vim-improver-0.1.0.vsix
# Restart VSCode
```

Logs to `~/.vim-improver/vscode.log`.

### Plain Vim with `-w`  *(any terminal session)*

Add to your shell rc to capture every session automatically:

```bash
alias vim='vim -w ~/.vim-improver/$(date +%s).sout'
```

Import whenever you like:

```bash
vimprove import ~/.vim-improver/*.sout
```

Logs to `~/.vim-improver/imported.log`.

---

## CLI reference

```
vimprove [command] [--source <src>] [--since <period>] [--all]
```

| Command | Description |
|---|---|
| `report` | Full stats + tips *(default)* |
| `stats` | Keystroke breakdown by source, mode, and key |
| `tips` | Personalised improvement tips |
| `sources` | Per-source data summary |
| `progress` | Compare tip scores across two consecutive periods |
| `session` | Summary of your most recent Vim session |
| `import <file>` | Import a `vim -w` scriptout file |
| `dismiss <tip-id>` | Suppress a tip you've already absorbed |
| `undismiss [id]` | Re-enable a tip, or list all dismissed tips |
| `clear` | Delete all log data |
| `help` | Show usage |

**Filters** — apply to `stats`, `tips`, `report`, `progress`:

| Flag | Values | Default |
|---|---|---|
| `--source` / `-s` | `nvim` `vscode` `scriptout` `all` | `all` |
| `--since` | `1h` `24h` `7d` `30d` `all` | `all` |
| `--all` | *(flag)* | Show dismissed tips too |

**Examples:**

```bash
vimprove                              # full report, all sources
vimprove report --source nvim         # NeoVim data only
vimprove tips   --since 7d            # tips from last week
vimprove progress                     # this 7d vs prior 7d
vimprove progress --since 30d         # this 30d vs prior 30d
vimprove session                      # last session recap
vimprove dismiss wq_vs_ZZ            # hide a tip you've learned
vimprove tips --all                   # show dismissed tips too
```

---

## Tips

22 tips across 5 categories. Each fires only when there's enough data to be confident the pattern is real.

### Navigation

| ID | Trigger | Fix |
|---|---|---|
| `repeated_j` | Run of `j` 3+ times | Count + j, `}`, `<C-d>`, `/pattern`, `*` |
| `repeated_k` | Run of `k` 3+ times | Count + k, `{`, `<C-u>`, `?pattern`, `#` |
| `repeated_h` | Run of `h` 4+ times | `b`, `B`, `F`, `0`, `^` |
| `repeated_l` | Run of `l` 4+ times | `w`, `e`, `f`, `$`, `g_` |
| `arrow_keys` | 10+ arrow key presses | `hjkl` |
| `not_using_star_hash` | `*`/`#` absent, 300+ keystrokes | `*` next occurrence, `#` previous |
| `not_using_jump_list` | `<C-o>` absent, 300+ keystrokes | `<C-o>` back, `<C-i>` forward |
| `not_using_percent` | `%` absent, 300+ keystrokes | `%` jump to matching bracket |

### Editing

| ID | Trigger | Fix |
|---|---|---|
| `repeated_x` | Run of `x` 3+ times | `dw`, `diw`, `D`, `dt<char>` |
| `d_dollar` | `d$` sequence | `D` |
| `c_dollar` | `c$` sequence | `C` |
| `i_esc_immediately` | `i<Esc>` sequence | `r`, `s` |
| `excessive_undo` | Run of `u` 5+ times | `5u`, `:earlier 5m` |
| `undo_redo_oscillation` | Alternating `u`/`<C-r>` | Marks — `ma`, `` `a `` |
| `end_of_line_insert` | `$a`, `$i`, `0i` sequences | `A`, `I`, `o`, `O` |
| `indentation_spam` | Repeated `>` or `<` | `3>`, `==`, `=ip`, `gg=G` |
| `cgn_workflow` | Repeated `n` + `c` | `cgn` + `.` repeat |
| `moving_lines` | `dd` + move + `p` | `:m+1`, `:m-2` |

### Workflow

| ID | Trigger | Fix |
|---|---|---|
| `frequent_save` | `:w` twice within 2s, 5+ times | `autowrite`, `ZZ` |
| `wq_vs_ZZ` | `:wq` 5+ times | `ZZ` |
| `not_using_macros` | `q` absent, 1000+ keystrokes | `qa…q` record, `@a` play, `@@` repeat |
| `missing_splits` | Many `:e`, no `<C-w>` | `<C-w>v`, `<C-w>s`, `:vsp file` |

### Text Objects

| ID | Trigger | Fix |
|---|---|---|
| `missing_text_objects` | `^dw` / `0dw` pattern | `diw`, `daw`, `ci"`, `ci{`, `dit` |

### Repeat

| ID | Trigger | Fix |
|---|---|---|
| `not_using_dot` | Same 2-key sequence back-to-back | `.` repeat, `cgn` + `.` |

---

## Privacy

- **NeoVim**: printable characters typed in insert/replace mode are **never recorded**. Only control keys (Esc, Backspace, arrows, etc.) and normal-mode keystrokes are logged.
- **VSCode**: text content is never logged. Only the *shape* of changes (single-char delete, range delete, undo) is recorded.
- **Scriptout**: insert-mode printable characters are stripped during import.

All data is stored locally in `~/.vim-improver/`. Nothing is sent anywhere.

---

## Log format

[JSONL](https://jsonlines.org/) — one JSON object per line:

```json
{"t":1700000000,"k":"j","m":"n","s":"nvim"}
```

| Field | Type | Description |
|---|---|---|
| `t` | integer | Unix timestamp (seconds) |
| `k` | string | Key name — `j`, `<Esc>`, `<C-d>`, `:wq`, … |
| `m` | string | Vim mode — `n` normal · `i` insert · `v` visual · `c` command |
| `s` | string | Source — `nvim` · `vscode` · `scriptout` |

---

## Development

```bash
cd cli
npm install
npm run typecheck        # type-check without emitting
npm run build            # bundles to dist/vimprove.js
node dist/vimprove.js help
```

The CLI is TypeScript bundled by [esbuild](https://esbuild.github.io/) into a single executable with no runtime dependencies.

See [`docs/`](docs/) for:
- [`architecture.md`](docs/architecture.md) — system design and data flow
- [`data-sources.md`](docs/data-sources.md) — NeoVim, VSCode, and scriptout in depth
- [`log-format.md`](docs/log-format.md) — full JSONL schema reference
- [`ide-research.md`](docs/ide-research.md) — why vscodevim and IdeaVim can't forward raw keystrokes
- [`adding-tips.md`](docs/adding-tips.md) — guide to contributing new tip detectors

---

## Contributing

1. Fork the repo
2. Add a tip in `cli/src/tips.ts` — see [`docs/adding-tips.md`](docs/adding-tips.md) for the full guide
3. Add any required detector in `cli/src/analyzer.ts` and field in `cli/src/types.ts`
4. Run `npm run typecheck && npm run build` to verify
5. Open a PR

Bug reports and feature requests: [GitHub Issues](https://github.com/DanCRichards/ViMprove/issues).

---

## License

MIT — see [LICENSE](LICENSE).
