# Architecture

## Overview

ViMprove is a three-part system:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Data capture layer                                                 │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  NeoVim plugin   │  │  VSCode ext      │  │  vim -w flag     │  │
│  │  (Lua)           │  │  (JS)            │  │  (binary)        │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│           │ neovim.log          │ vscode.log           │ *.sout     │
└───────────┼─────────────────────┼──────────────────────┼────────────┘
            │                     │                      │
            └──────────┬──────────┘                      │ vimprove import
                       ▼                                  │
               ~/.vim-improver/          ◄────────────────┘
               (JSONL log files)

┌─────────────────────────────────────────────────────────────────────┐
│  CLI (TypeScript, Node.js)                                          │
│                                                                     │
│  cli/src/                                                           │
│  ├── index.ts      — commands, arg parsing, rendering               │
│  ├── analyzer.ts   — reads logs, filters, detects patterns          │
│  ├── tips.ts       — tip definitions (detectors + advice)           │
│  ├── scriptout.ts  — binary parser for vim -w files                 │
│  └── types.ts      — shared TypeScript interfaces                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Data flow

1. **Capture** — The NeoVim plugin or VSCode extension writes JSONL log entries to `~/.vim-improver/` in real time. Writes are batched (up to 20 entries or 3 seconds) for performance.

2. **Import** (optional) — Scriptout binary files recorded with `vim -w` are parsed into JSONL entries and appended to `~/.vim-improver/imported.log`.

3. **Analysis** — When the user runs `vimprove report` (or any subcommand), `analyzer.ts` reads all log files, applies source/time filters, and accumulates statistics into a `Stats` object.

4. **Detection** — Each tip in `tips.ts` has a `detect(stats: Stats): number` function that returns how many times the pattern was observed. Tips whose score meets their threshold are surfaced.

5. **Rendering** — `index.ts` formats the output using ANSI escape codes. No external rendering library is used.

## Key design decisions

### Zero runtime dependencies

The CLI bundles to a single file (`dist/vimprove.js`) with no `node_modules` at runtime. This makes distribution simple (the file is the executable) and Homebrew installation clean.

### JSONL log format

Each log entry is a JSON object on a single line. This format is:
- Appendable without reading the file first
- Easy to parse line by line in streaming fashion
- Human readable for debugging
- Grep-friendly

### Privacy by design

- NeoVim plugin: insert-mode printable characters are skipped. Only control keys and normal-mode keystrokes are logged.
- VSCode extension: only the *shape* of changes is logged (single-char delete, range delete), never the content.
- Scriptout parser: insert-mode printable characters are filtered during import.

### Mode-aware logging

Every log entry includes the Vim mode (`n`, `i`, `v`, `c`). This allows the analyzer to:
- Restrict tip detection to normal-mode keystrokes (where inefficiency patterns appear)
- Report mode breakdown in stats
- Filter command-mode sequences for `:wq` detection

### Source separation

Each data source writes to its own log file (`neovim.log`, `vscode.log`, `imported.log`). This means:
- Sources can be filtered independently with `--source`
- Each source can be cleared independently with `vimprove clear --source nvim`
- The `sources` command shows per-source metadata without mixing data

## Build system

The CLI is written in TypeScript and bundled with [esbuild](https://esbuild.github.io/):

```
cli/src/index.ts  →  esbuild  →  cli/dist/vimprove.js
```

- `esbuild` handles bundling and transpilation. Output is a single ESM file with a `#!/usr/bin/env node` shebang.
- `tsc --noEmit` is used for type checking only (no separate TypeScript output directory).
- The `scripts/build.mjs` script runs esbuild and then `chmod +x` the output.

## Release workflow

Tagging a release (`git tag v0.x.x && git push origin v0.x.x`) triggers `.github/workflows/release.yml`, which:

1. Builds the CLI
2. Creates a GitHub Release with `dist/vimprove.js` attached
3. Prints the SHA256 of the source tarball for updating the Homebrew formula

The Homebrew formula (`Formula/vimprove.rb`) builds from source, so `node` is a `depends_on` requirement.
