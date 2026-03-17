# IDE Vim Plugin Research

This document captures research into whether the VSCode Vim extension (vscodevim) and JetBrains IdeaVim expose mechanisms to forward keystrokes to an external process — enabling a potential `vimprove capture` daemon approach.

## Motivation

The user proposed an approach where instead of per-IDE plugins, you'd use a shell alias:

```bash
alias vim="vim -w >(vimprove capture)"
```

Here `vimprove capture` would be a subprocess that reads raw scriptout from stdin, adds timestamps, and writes JSONL. This would work for any terminal Vim and not require IDE-specific plugins.

The question was: can vscodevim or IdeaVim also pipe keystrokes to such a process?

---

## VSCode Vim (vscodevim)

**Conclusion: No viable hook.**

### The type command monopoly

VSCodeVim registers as the sole handler for VSCode's global `type` command. This fires on every keypress in the editor and is the only way to intercept raw keystrokes. Because vscodevim monopolises it, **no other extension can independently observe the keystroke stream**.

This is a known architectural conflict — it's also why vscode-neovim warns you to uninstall vscodevim before using it.

VSCode has an open issue ([microsoft/vscode#31552](https://github.com/Microsoft/vscode/issues/31552)) to expose `keydown`/`keyup` events to extensions, but this has not shipped.

### No scriptout equivalent

VSCodeVim has no `-w` flag or keystroke recording feature. It is a JavaScript reimplementation of Vim that manipulates the VSCode text buffer directly; there is no subprocess to pass flags to.

### No public API for keystroke events

VSCodeVim's `activate()` function does not export a keystroke event emitter. There is no documented public API surface for subscribing to keystrokes from another extension.

### Keybinding workaround (limited)

VSCodeVim's keybinding system (`vim.normalModeKeyBindings` etc.) can trigger any registered VSCode command ID. You could in theory bind a key to `workbench.action.terminal.sendSequence` to forward a specific key to the terminal, but:
- This requires enumerating every key you care about in `settings.json`
- It requires the integrated terminal to be running `vimprove capture`
- It defeats the purpose (you'd need a complete key map)

### Summary

| Mechanism | Available? |
|---|---|
| `vim -w` / scriptout equivalent | No |
| Shell command on keypress | Indirect only (VSCode command → terminal) |
| Extension API for keystroke subscription | No public API; `type` command monopolised |
| `autocmd` with external binary | No |

---

## JetBrains IdeaVim

**Conclusion: Possible but requires a full IntelliJ plugin.**

### `.ideavimrc` limitations

IdeaVim's `.ideavimrc` supports a subset of Vimscript. Critically:

- **`autocmd` is not supported** — explicitly documented in IdeaVim's reference
- **`system()` / `:!`** — unreliable; not all Vimscript builtins are implemented
- There is no way to run an external process from `.ideavimrc`

### Plugin API (`@VimPlugin`)

IdeaVim has a documented Kotlin DSL for writing IntelliJ Platform plugins that extend it:

```kotlin
@VimPlugin
class MyPlugin {
  fun setup() {
    mappings {
      map(MappingMode.NORMAL, "<leader>x", handler = MyHandler())
    }
  }
}
```

A plugin written this way has access to the full IntelliJ Platform API, including file I/O and process spawning. In theory you could write an IntelliJ plugin that listens for vim key events and writes them to `~/.vim-improver/idea.log`.

However:
- The raw keystroke listener (`VimListenerManager`, `KeyHandler`) is an **internal, unstable API** — not a documented extension point
- There is no clean public hook specifically for intercepting keystrokes before IdeaVim processes them
- Maintaining an IntelliJ plugin (Kotlin, Gradle, JetBrains Marketplace signing) is a significant ongoing burden

### `<Action>()` mapping

IdeaVim's `<Action>()` mechanism lets you bind Vim keys to IntelliJ IDE actions:

```vim
" .ideavimrc
nnoremap <leader>s :action SaveAll<CR>
```

This can trigger any IntelliJ action, but again there is no "call external process" action in the standard set.

### Summary

| Mechanism | Available? |
|---|---|
| `autocmd` in `.ideavimrc` | No (explicitly not supported) |
| `system()` / `:!` shell commands | No / unreliable |
| Plugin API (Kotlin DSL, `@VimPlugin`) | Yes — but requires a full IntelliJ plugin |
| Raw keystroke listener (public API) | No; `VimListenerManager` is internal |
| `<Action>()` to trigger IDE actions | Yes (but no "run external process" action) |
| scriptout / `-w` equivalent | No |

---

## `vim -w >(process)` on macOS

The process substitution approach is unreliable on macOS:

### Problem 1 — FIFO blocking

`>(process)` creates a `/dev/fd/N` file descriptor or a named FIFO. When Vim calls `open(path, O_WRONLY)` on it, POSIX requires the call to block until a reader has opened the read end. If the consuming process hasn't started yet, Vim hangs.

### Problem 2 — `/dev/fd/N` on macOS

macOS uses BSD-style `/dev/fd`. When Vim (or any child process) tries to `open()` a `/dev/fd/N` path, the file descriptor may no longer be valid in that process's context — this is a known issue with NeoVim's `-q` flag and process substitution.

### Problem 3 — Seekability

`vim -w` may attempt to seek within the output file. Pipes and FIFOs are not seekable; this can cause silent failures or garbled output.

### More reliable alternative

Use a named FIFO with the reader started first:

```bash
mkfifo /tmp/vim_keys
vimprove capture < /tmp/vim_keys &   # reader must start BEFORE vim
vim -w /tmp/vim_keys myfile.txt
```

Or, more simply, use a plain file and import afterwards:

```bash
alias vim='vim -w ~/.vim-improver/$(date +%s).sout'
# ... use vim ...
vimprove import ~/.vim-improver/*.sout
```

The plain file approach is the recommended path — it's reliable, requires no daemon, and the scriptout parser handles the format already.

---

## Conclusion

None of the IDE Vim plugins expose a clean, reliable mechanism for real-time keystroke forwarding to an external process. The recommended approach remains:

| Environment | Method |
|---|---|
| NeoVim | Native plugin (`vim.on_key()`) |
| VSCode + vscodevim | VSCode extension (editor event inference) |
| Plain terminal Vim | `alias vim='vim -w ~/.vim-improver/$(date +%s).sout'` |
| JetBrains (future) | Would require an IntelliJ Kotlin plugin |
