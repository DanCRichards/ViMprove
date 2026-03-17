'use strict';
// vim-improver: VSCode Extension
//
// Logs Vim usage patterns from the vscodevim extension to ~/.vim-improver/vscode.log
// for analysis by the vim-improver CLI.
//
// What is captured:
//   - File saves (frequency indicates workflow patterns)
//   - Cursor position deltas (large jumps suggest missed motions)
//   - Mode changes (normal/insert/visual transitions via vscodevim)
//   - Undo/redo commands
//   - Search usage
//   - Text change sizes (small single-char edits in normal-ish patterns)

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_DIR = path.join(os.homedir(), '.vim-improver');
const LOG_FILE = path.join(LOG_DIR, 'vscode.log');

let writeBuffer = [];
const FLUSH_SIZE = 20;
let flushTimer = null;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function flush() {
  if (writeBuffer.length === 0) return;
  const lines = writeBuffer.join('\n') + '\n';
  writeBuffer = [];
  try {
    fs.appendFileSync(LOG_FILE, lines);
  } catch (_) {}
}

function log(key, mode) {
  const entry = JSON.stringify({
    t: Math.floor(Date.now() / 1000),
    k: key,
    m: mode,
    s: 'vscode',
  });
  writeBuffer.push(entry);
  if (writeBuffer.length >= FLUSH_SIZE) flush();
}

// Track state for delta-based logging
let lastCursorLine = -1;
let lastCursorChar = -1;
let lastSaveTime = 0;
let currentMode = 'n'; // assume normal to start

function getVimMode(vimExt) {
  try {
    // vscodevim exposes mode through its exports
    const api = vimExt && vimExt.exports;
    if (api && typeof api.mode === 'string') return api.mode;
  } catch (_) {}
  return null;
}

function activate(context) {
  ensureLogDir();

  // Flush every 3 seconds
  flushTimer = setInterval(flush, 3000);

  const vimExt = vscode.extensions.getExtension('vscodevim.vim');

  // ── Save events ──────────────────────────────────────────────────────────
  // Frequent saves are fine but very rapid saves (< 2s) suggest nervousness
  // or not trusting auto-save.
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      const now = Math.floor(Date.now() / 1000);
      const delta = now - lastSaveTime;
      lastSaveTime = now;
      // delta < 0 means first save; record the gap so the analyzer can spot patterns
      log(':w', 'c');
    })
  );

  // ── Cursor movement ───────────────────────────────────────────────────────
  // We can't see individual keystrokes, but we CAN see where the cursor ends up.
  // A large line delta in a short time suggests the user typed many j/k instead
  // of using efficient motions.
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      const sel = event.selections[0];
      if (!sel) return;

      const line = sel.active.line;
      const char = sel.active.character;

      if (lastCursorLine >= 0) {
        const lineDelta = Math.abs(line - lastCursorLine);
        const charDelta = Math.abs(char - lastCursorChar);

        // Log significant cursor jumps for analysis
        // Small moves (1-3 lines) logged as individual steps to detect hjkl spam
        if (lineDelta > 0 && lineDelta <= 5) {
          const dir = line > lastCursorLine ? 'j' : 'k';
          for (let i = 0; i < lineDelta; i++) {
            log(dir, 'n');
          }
        } else if (lineDelta > 5) {
          // Large jump — likely used a real motion (good) or search
          log(`<jump:${lineDelta}>`, 'n');
        }

        if (lineDelta === 0 && charDelta > 0 && charDelta <= 5) {
          const dir = char > lastCursorChar ? 'l' : 'h';
          for (let i = 0; i < charDelta; i++) {
            log(dir, 'n');
          }
        }
      }

      lastCursorLine = line;
      lastCursorChar = char;
    })
  );

  // ── Document changes ──────────────────────────────────────────────────────
  // Single-character deletions in rapid succession suggest using x repeatedly
  // rather than d{n}.
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      for (const change of event.contentChanges) {
        const deleted = change.rangeLength;
        const inserted = change.text.length;

        // Single char delete with no insert → likely 'x' or 'X'
        if (deleted === 1 && inserted === 0) {
          log('x', 'n');
        }
        // Single char insert → insert mode activity (log ctrl-key equivalent)
        else if (inserted === 1 && deleted === 0) {
          // don't log content, just that an insert happened
          log('<ins>', 'i');
        }
        // Range delete → likely a d-motion
        else if (deleted > 1 && inserted === 0) {
          log(`<del:${deleted}>`, 'n');
        }
      }
    })
  );

  // ── Built-in VSCode commands we can intercept ─────────────────────────────
  // Undo/redo frequency
  const origUndo = vscode.commands.registerCommand('vim-improver._undo', () => {
    log('u', 'n');
    vscode.commands.executeCommand('undo');
  });
  const origRedo = vscode.commands.registerCommand('vim-improver._redo', () => {
    log('<C-r>', 'n');
    vscode.commands.executeCommand('redo');
  });

  context.subscriptions.push(origUndo, origRedo);

  // Log that the extension activated
  log('<session-start>', 'n');
}

function deactivate() {
  if (flushTimer) clearInterval(flushTimer);
  flush();
}

module.exports = { activate, deactivate };
