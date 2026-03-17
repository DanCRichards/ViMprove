# Log Format

All data sources write [JSONL](https://jsonlines.org/) — one JSON object per line, UTF-8 encoded, `\n` terminated.

## Schema

```json
{"t":1700000000,"k":"j","m":"n","s":"nvim"}
```

| Field | Type | Description |
|---|---|---|
| `t` | integer | Unix timestamp in seconds |
| `k` | string | Key name |
| `m` | string | Vim mode |
| `s` | string | Source identifier |

## Field values

### `k` — key name

Normal-mode single keys are their literal character: `j`, `k`, `h`, `l`, `w`, `b`, `u`, `.`, etc.

Special keys use angle-bracket notation (from `vim.fn.keytrans()`):

| Key | Logged as |
|---|---|
| Escape | `<Esc>` |
| Ctrl-d | `<C-d>` |
| Ctrl-r | `<C-r>` |
| Backspace | `<BS>` |
| Delete | `<Del>` |
| Enter | `<CR>` |
| Arrow down | `<Down>` |

Command-mode sequences are reconstructed and logged as a unit: `:wq`, `:w`, `:q!`, etc.

VSCode-specific synthetic keys:

| Key | Meaning |
|---|---|
| `<session-start>` | Extension activated |
| `<ins>` | Insert-mode activity (content not logged) |
| `<del:N>` | Range deletion of N characters |
| `<jump:N>` | Cursor jumped N lines (inferred motion) |

### `m` — mode

| Value | Vim mode |
|---|---|
| `n` | Normal |
| `i` | Insert |
| `v` | Visual (character), Visual line, Visual block |
| `c` | Command-line |
| `R` | Replace |

NeoVim reports more granular modes (`niI`, `no`, `nov`, etc.) which are stored as-is. The analyzer treats any mode starting with `i` or `R` as insert mode, and anything not `i`/`v`/`c`/`R` as normal mode for tip detection.

### `s` — source

| Value | Source |
|---|---|
| `nvim` | NeoVim plugin |
| `vscode` | VSCode extension |
| `scriptout` | Imported from `vim -w` scriptout file |

## Log files

| File | Source |
|---|---|
| `~/.vim-improver/neovim.log` | NeoVim plugin |
| `~/.vim-improver/vscode.log` | VSCode extension |
| `~/.vim-improver/imported.log` | All imported scriptout sessions |

## Example entries

```jsonl
{"t":1700000001,"k":"<session-start>","m":"n","s":"vscode"}
{"t":1700000010,"k":"j","m":"n","s":"nvim"}
{"t":1700000010,"k":"j","m":"n","s":"nvim"}
{"t":1700000010,"k":"j","m":"n","s":"nvim"}
{"t":1700000012,"k":"w","m":"n","s":"nvim"}
{"t":1700000015,"k":"<Esc>","m":"i","s":"nvim"}
{"t":1700000020,"k":":wq","m":"c","s":"scriptout"}
{"t":1700000030,"k":":w","m":"c","s":"vscode"}
{"t":1700000031,"k":"u","m":"n","s":"vscode"}
```

## Reading logs

```bash
# Tail live NeoVim activity
tail -f ~/.vim-improver/neovim.log

# Count entries per source
wc -l ~/.vim-improver/*.log

# Find all :wq entries
grep '"k":":wq"' ~/.vim-improver/*.log

# Show today's entries (requires jq)
jq 'select(.t > now - 86400)' ~/.vim-improver/*.log
```
