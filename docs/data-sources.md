# Data Sources

ViMprove supports three data sources. Each has different accuracy characteristics and setup requirements.

---

## NeoVim plugin (`nvim`)

**Accuracy: high** — captures every keystroke with exact mode and timestamp.

### How it works

The plugin registers a global key interceptor using NeoVim's `vim.on_key()` API:

```lua
vim.on_key(function(key)
  local mode = vim.api.nvim_get_mode().mode
  -- log key + mode
end, namespace)
```

This fires synchronously on every keypress before NeoVim processes it. The key is the raw byte sequence; `vim.fn.keytrans()` converts it to a human-readable name (e.g. `<Esc>`, `<C-d>`).

### Privacy filter

In insert and replace modes, printable ASCII characters (bytes 32–126) are skipped. This means the content of anything you type is never recorded. Control keys (Backspace, Esc, arrows) are still logged because they reveal editing patterns.

### Batching

Writes are batched up to 20 entries or 3 seconds (whichever comes first) to avoid hammering the filesystem on every keypress. Entries are flushed synchronously on `VimLeavePre`.

### Log file

`~/.vim-improver/neovim.log`

### Setup

```bash
cp neovim/vim_improver.lua ~/.config/nvim/lua/
echo "require('vim_improver').setup()" >> ~/.config/nvim/init.lua
```

Or run `./install.sh` which does this automatically.

---

## VSCode extension (`vscode`)

**Accuracy: medium** — infers Vim operations from editor events rather than capturing raw keystrokes.

### The fundamental limitation

VSCode's `type` command (which fires on every keypress) is monopolised by the [vscodevim](https://marketplace.visualstudio.com/items?itemName=vscodevim.vim) extension. It registers as the sole handler, and VSCode does not provide another mechanism for observing raw keystrokes. See [`ide-research.md`](ide-research.md) for the full research.

### What is captured

| Event | VSCode API | Inferred operation |
|---|---|---|
| File saved | `onDidSaveTextDocument` | `:w` in command mode |
| Single char deleted | `onDidChangeTextDocument` (rangeLength=1, no insert) | `x` in normal mode |
| Range deleted | `onDidChangeTextDocument` (rangeLength>1, no insert) | `d`-motion |
| Text inserted | `onDidChangeTextDocument` (insert, no delete) | Insert mode activity |
| Undo | `onDidChangeTextDocument` (reason=Undo) | `u` |
| Redo | `onDidChangeTextDocument` (reason=Redo) | `<C-r>` |
| Cursor line delta 1–5 | `onDidChangeTextEditorSelection` | Individual `j`/`k` presses |
| Cursor line delta > 5 | `onDidChangeTextEditorSelection` | Large jump (motion or search) |
| Cursor char delta 1–5 | `onDidChangeTextEditorSelection` | Individual `h`/`l` presses |

### What is NOT captured

- Individual keystrokes in normal mode (e.g. `w`, `b`, `gg`, `G`, `f`, `t`)
- Search operations (`/`, `?`, `n`, `N`)
- Visual mode selections
- Marks, registers, macros
- Text objects

### Mode tracking

Mode is tracked by polling the vscodevim extension's exported `mode` property on each event. If vscodevim is not installed, all events are attributed to normal mode (`n`).

### Status bar

The extension shows a `⌨ Vim Improver: N logged` item in the status bar. Clicking it opens the log directory.

### Log file

`~/.vim-improver/vscode.log`

### Setup

```bash
cd vscode
npx @vscode/vsce package --allow-missing-repository --no-dependencies
code --install-extension vim-improver-0.1.0.vsix
```

Restart VSCode after installing. The `install.sh` script does this automatically if the VSCode CLI is found.

---

## Scriptout / `vim -w` (`scriptout`)

**Accuracy: medium-high** — captures all keystrokes from plain Vim sessions, but timestamps must be synthesised.

### How it works

Vim has a built-in flag `-w <file>` that records all keystrokes to a binary file in "scriptout" format:

```bash
vim -w ~/.vim-improver/session.sout myfile.txt
```

The file contains a raw stream of keystrokes as bytes. ViMprove's `scriptout.ts` parser:

1. Tokenises the byte stream into named keys (using an escape sequence table sorted longest-first)
2. Runs a mode state machine to infer Vim mode from context
3. Filters out insert-mode printable characters for privacy
4. Synthesises timestamps from the file's mtime (anchored at last entry, counting backwards)

### Limitations

- No real timestamps — timing is approximated
- The binary format has no concept of "session boundaries"
- Some complex escape sequences may not be recognised

### Recommended usage

Add an alias to your shell rc for automatic capture:

```bash
alias vim='vim -w ~/.vim-improver/$(date +%s).sout'
```

Then periodically import:

```bash
vimprove import ~/.vim-improver/*.sout
```

Or import a specific session:

```bash
vimprove import ~/session.sout
```

### Log file

`~/.vim-improver/imported.log` (appended on each import)

### Binary format

See [`log-format.md`](log-format.md) for the JSONL output format. For the raw scriptout binary format, see the [Vim documentation](https://vimdoc.sourceforge.net/htmldoc/starting.html#-w).
