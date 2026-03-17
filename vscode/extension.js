'use strict';
// vim-improver: VSCode Extension
//
// Logs Vim usage patterns from the vscodevim extension to ~/.vim-improver/vscode.log
// for analysis by the vimprove CLI.
//
// What is captured:
//   - File saves (frequency indicates workflow patterns)
//   - Cursor position deltas (large jumps suggest missed motions)
//   - Single-character text deletions (inferred 'x' in normal mode)
//   - Undo / redo operations (via TextDocumentChangeReason API)
//   - Range deletes (inferred d-motions)
//
// What is NOT captured:
//   - The content of any text you type
//   - Individual keystrokes (VSCode's type command is monopolised by vscodevim)

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Config ────────────────────────────────────────────────────────────────────

function getLogDir() {
  const config = vscode.workspace.getConfiguration('vim-improver');
  const override = config.get('logDir');
  return (override && override.trim()) ? override.trim() : path.join(os.homedir(), '.vim-improver');
}

function isEnabled() {
  return vscode.workspace.getConfiguration('vim-improver').get('enabled', true);
}

// ── Logging ───────────────────────────────────────────────────────────────────

let writeBuffer = [];
const FLUSH_SIZE = 20;
let flushTimer = null;
let sessionKeyCount = 0;

function getLogFile() {
  return path.join(getLogDir(), 'vscode.log');
}

function ensureLogDir() {
  const dir = getLogDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function flush() {
  if (writeBuffer.length === 0) return;
  const lines = writeBuffer.join('\n') + '\n';
  writeBuffer = [];
  try {
    ensureLogDir();
    fs.appendFileSync(getLogFile(), lines);
  } catch (_) {}
}

function log(key, mode) {
  if (!isEnabled()) return;
  const entry = JSON.stringify({
    t: Math.floor(Date.now() / 1000),
    k: key,
    m: mode,
    s: 'vscode',
  });
  writeBuffer.push(entry);
  sessionKeyCount++;
  if (writeBuffer.length >= FLUSH_SIZE) flush();
}

// ── Mode tracking ─────────────────────────────────────────────────────────────
//
// VSCode's type command is monopolised by vscodevim so we cannot intercept
// raw keystrokes. We track mode via vscodevim's exported API, polling on each
// cursor / document event.  Falls back to 'n' (normal) when unknown.

let currentMode = 'n';

function refreshMode(vimExt) {
  if (!vimExt) return;
  try {
    const api = vimExt.exports;
    if (!api) return;

    // vscodevim exports a `mode` object with a `current` field (string enum)
    // e.g. "Normal", "Insert", "Visual", "VisualBlock", "VisualLine", "Replace"
    const raw =
      (typeof api.mode === 'string' ? api.mode :
       api.mode && typeof api.mode.current === 'string' ? api.mode.current :
       null);

    if (!raw) return;
    const lower = raw.toLowerCase();
    if (lower.includes('insert') || lower.includes('replace')) currentMode = 'i';
    else if (lower.includes('visual'))  currentMode = 'v';
    else if (lower.includes('command')) currentMode = 'c';
    else                                currentMode = 'n';
  } catch (_) {}
}

// ── Status bar ────────────────────────────────────────────────────────────────

let statusBar = null;

function updateStatusBar() {
  if (!statusBar) return;
  if (!isEnabled()) {
    statusBar.text = '$(circle-slash) Vim Improver: paused';
    statusBar.tooltip = 'Vim Improver logging is disabled. Click to open settings.';
    statusBar.command = 'workbench.action.openSettings';
    return;
  }
  statusBar.text = `$(keyboard) Vim Improver: ${sessionKeyCount.toLocaleString()} logged`;
  statusBar.tooltip = `Vim Improver is active.\nSession keystrokes: ${sessionKeyCount.toLocaleString()}\nLog: ${getLogFile()}\nClick to open log directory.`;
  statusBar.command = 'vim-improver.openLogDir';
}

// ── Extension lifecycle ───────────────────────────────────────────────────────

function activate(context) {
  ensureLogDir();

  // Status bar
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  updateStatusBar();
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Flush timer (every 3s)
  flushTimer = setInterval(() => { flush(); updateStatusBar(); }, 3000);

  const vimExt = vscode.extensions.getExtension('vscodevim.vim');

  // ── Commands ────────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('vim-improver.openLogDir', () => {
      const dir = getLogDir();
      vscode.env.openExternal(vscode.Uri.file(dir));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vim-improver.showStatus', () => {
      const logFile = getLogFile();
      const exists = fs.existsSync(logFile);
      const size = exists ? Math.round(fs.statSync(logFile).size / 1024) : 0;
      vscode.window.showInformationMessage(
        `Vim Improver — session: ${sessionKeyCount.toLocaleString()} keystrokes logged | ` +
        `log file: ${exists ? `${size} KB` : 'not yet created'}`
      );
    })
  );

  // ── Save events ─────────────────────────────────────────────────────────────
  // Frequent saves reveal workflow patterns. Very rapid saves (< 2s) suggest
  // the user doesn't trust auto-save or is nervously writing :w.

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      log(':w', 'c');
    })
  );

  // ── Undo / redo ─────────────────────────────────────────────────────────────
  // TextDocumentChangeReason (added in VSCode 1.83) lets us detect undo/redo
  // reliably without intercepting commands.

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      refreshMode(vimExt);

      const reason = event.reason;
      if (reason === vscode.TextDocumentChangeReason.Undo) {
        log('u', 'n');
        return;
      }
      if (reason === vscode.TextDocumentChangeReason.Redo) {
        log('<C-r>', 'n');
        return;
      }

      // Normal edits — infer vim operations from the shape of the change
      for (const change of event.contentChanges) {
        const deleted = change.rangeLength;
        const inserted = change.text.length;

        if (deleted === 1 && inserted === 0) {
          // Single char delete with no insert — likely 'x' or 'X' in normal mode
          log('x', 'n');
        } else if (deleted > 1 && inserted === 0) {
          // Range delete — likely a d-motion (dw, dd, d$, …)
          log(`<del:${deleted}>`, 'n');
        } else if (inserted > 0 && deleted === 0) {
          // Insertion — log that insert-mode activity happened without logging content
          log('<ins>', 'i');
        }
      }
    })
  );

  // ── Cursor movement ─────────────────────────────────────────────────────────
  // We infer vim motions from cursor position deltas. A run of small line moves
  // suggests j/j/j instead of a count (5j) or efficient motion ({, }, Ctrl-d).
  // Large jumps suggest a real motion or search was used — that's good.

  let lastCursorLine = -1;
  let lastCursorChar = -1;

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      refreshMode(vimExt);

      const sel = event.selections[0];
      if (!sel) return;

      const line = sel.active.line;
      const char = sel.active.character;

      if (lastCursorLine >= 0) {
        const lineDelta = line - lastCursorLine;   // signed: +ve = down
        const charDelta = char - lastCursorChar;   // signed: +ve = right
        const absLine   = Math.abs(lineDelta);
        const absChar   = Math.abs(charDelta);

        if (absLine > 0 && absLine <= 5) {
          // Small vertical move — emit individual j/k so run detector fires
          const dir = lineDelta > 0 ? 'j' : 'k';
          for (let i = 0; i < absLine; i++) log(dir, 'n');
        } else if (absLine > 5) {
          // Large jump — likely a real motion (good) — just note it
          log(`<jump:${absLine}>`, 'n');
        }

        if (absLine === 0 && absChar > 0 && absChar <= 5) {
          // Small horizontal move on same line — emit individual h/l
          const dir = charDelta > 0 ? 'l' : 'h';
          for (let i = 0; i < absChar; i++) log(dir, 'n');
        }
      }

      lastCursorLine = line;
      lastCursorChar = char;
    })
  );

  // Log session start marker
  log('<session-start>', 'n');
  updateStatusBar();
}

function deactivate() {
  if (flushTimer) clearInterval(flushTimer);
  flush();
  if (statusBar) statusBar.dispose();
}

module.exports = { activate, deactivate };
