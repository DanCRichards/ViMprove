'use strict';
// Parses Vim's scriptout (-w / -W) binary format into our entry format.
//
// Usage:
//   Record:  nvim -w ~/.vim-improver/session.sout myfile.txt
//   Import:  vim-improver import ~/.vim-improver/session.sout
//
// Limitations vs vim.on_key() (NeoVim JSONL):
//   - Timestamps are synthetic (1 second per keystroke, anchored to file mtime)
//   - Mode is inferred via a state machine — mostly accurate but not perfect
//   - Time-based patterns (rapid saves) won't be reliable

const fs = require('fs');

// ── Escape sequence table (longest-match first in the tokenizer) ─────────────

const ESC_SEQ = {
  // SS3 sequences (xterm)
  '\x1bOA': '<Up>',    '\x1bOB': '<Down>',
  '\x1bOC': '<Right>', '\x1bOD': '<Left>',
  '\x1bOH': '<Home>',  '\x1bOF': '<End>',
  '\x1bOP': '<F1>',    '\x1bOQ': '<F2>',
  '\x1bOR': '<F3>',    '\x1bOS': '<F4>',
  // CSI sequences
  '\x1b[A': '<Up>',    '\x1b[B': '<Down>',
  '\x1b[C': '<Right>', '\x1b[D': '<Left>',
  '\x1b[H': '<Home>',  '\x1b[F': '<End>',
  '\x1b[2~': '<Insert>',
  '\x1b[3~': '<Del>',
  '\x1b[5~': '<PageUp>',
  '\x1b[6~': '<PageDown>',
  '\x1b[15~': '<F5>',  '\x1b[17~': '<F6>',
  '\x1b[18~': '<F7>',  '\x1b[19~': '<F8>',
  '\x1b[20~': '<F9>',  '\x1b[21~': '<F10>',
  '\x1b[23~': '<F11>', '\x1b[24~': '<F12>',
  // Shift/Ctrl arrow variants (common in terminal emulators)
  '\x1b[1;2A': '<S-Up>',    '\x1b[1;2B': '<S-Down>',
  '\x1b[1;2C': '<S-Right>', '\x1b[1;2D': '<S-Left>',
  '\x1b[1;5A': '<C-Up>',    '\x1b[1;5B': '<C-Down>',
  '\x1b[1;5C': '<C-Right>', '\x1b[1;5D': '<C-Left>',
};

// Sort by descending length so longer sequences match before shorter prefixes
const ESC_SEQ_SORTED = Object.entries(ESC_SEQ).sort((a, b) => b[0].length - a[0].length);

// Control byte → key name
const CTRL = {
  0x01: '<C-a>', 0x02: '<C-b>', 0x03: '<C-c>', 0x04: '<C-d>',
  0x05: '<C-e>', 0x06: '<C-f>', 0x07: '<C-g>', 0x08: '<BS>',
  0x09: '<Tab>', 0x0a: '<NL>',  0x0b: '<C-k>', 0x0c: '<C-l>',
  0x0d: '<CR>',  0x0e: '<C-n>', 0x0f: '<C-o>', 0x10: '<C-p>',
  0x11: '<C-q>', 0x12: '<C-r>', 0x13: '<C-s>', 0x14: '<C-t>',
  0x15: '<C-u>', 0x16: '<C-v>', 0x17: '<C-w>', 0x18: '<C-x>',
  0x19: '<C-y>', 0x1a: '<C-z>', 0x1b: '<Esc>', 0x1c: '<C-\\>',
  0x1d: '<C-]>', 0x1e: '<C-^>', 0x1f: '<C-_>', 0x7f: '<BS>',
};

// ── Tokenizer ─────────────────────────────────────────────────────────────────
// Converts raw bytes → array of key-name strings.

function tokenize(buf) {
  const keys = [];
  let i = 0;

  while (i < buf.length) {
    const byte = buf[i];

    // Escape sequences: try longest match first
    if (byte === 0x1b) {
      let matched = false;
      for (const [seq, name] of ESC_SEQ_SORTED) {
        const len = seq.length;
        if (i + len <= buf.length) {
          // Compare bytes
          let ok = true;
          for (let j = 0; j < len; j++) {
            if (buf[i + j] !== seq.charCodeAt(j)) { ok = false; break; }
          }
          if (ok) {
            keys.push(name);
            i += len;
            matched = true;
            break;
          }
        }
      }
      if (!matched) {
        keys.push('<Esc>');
        i++;
      }
      continue;
    }

    // Control characters
    if (CTRL[byte]) {
      keys.push(CTRL[byte]);
      i++;
      continue;
    }

    // Printable ASCII
    if (byte >= 0x20 && byte < 0x7f) {
      keys.push(String.fromCharCode(byte));
      i++;
      continue;
    }

    // UTF-8 multibyte characters
    if (byte >= 0x80) {
      let seqLen = 1;
      if ((byte & 0xe0) === 0xc0) seqLen = 2;
      else if ((byte & 0xf0) === 0xe0) seqLen = 3;
      else if ((byte & 0xf8) === 0xf0) seqLen = 4;
      keys.push(buf.slice(i, i + seqLen).toString('utf8'));
      i += seqLen;
      continue;
    }

    i++; // skip unknown byte
  }

  return keys;
}

// ── Mode state machine ────────────────────────────────────────────────────────
// Infers the Vim mode for each key and produces entry objects.
//
// States: 'n' (normal), 'i' (insert), 'v' (visual), 'c' (command/search)
//
// The machine handles the most common transitions. Complex cases
// (e.g. Ctrl-o in insert, multi-key text objects) are approximated.

const INSERT_ENTRY_KEYS = new Set(['i', 'I', 'a', 'A', 'o', 'O', 's', 'S', 'C', 'R']);
const VISUAL_ENTRY_KEYS = new Set(['v', 'V', '<C-v>', '<C-q>']);
// Operators that need a motion before completing (and DON'T enter insert mode)
const MOTION_OPS = new Set(['d', 'y', '=', '>', '<', '!', 'g', 'z', 'Z', 'r', 'f', 't', 'F', 'T', 'm', '`', "'", '"', '@']);
// c is special: needs a motion then enters insert mode
const CHANGE_OP = 'c';
// Visual mode operators that exit back to normal (or insert for c/s)
const VISUAL_NORMAL_OPS = new Set(['d', 'y', 'p', 'P', 'x', 'X', 'D', '~', 'u', 'U', '>', '<', '=', '!']);
const VISUAL_INSERT_OPS = new Set(['c', 's', 'S', 'C']);

function buildEntries(keys, baseTime, source) {
  const entries = [];
  let mode = 'n';
  let pendingOp = null;   // waiting for a motion/text-object key
  let pendingChange = false; // 'c' was the operator — enter insert after motion
  let cmdBuf = '';        // accumulates characters in command mode
  let searchMode = false; // '/' or '?' search (command mode but logs differently)

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const t = baseTime + i;

    // ── Normal mode ───────────────────────────────────────────────────────────
    if (mode === 'n') {

      // Resolve pending operator: the motion/text-object just arrived
      if (pendingOp !== null) {
        entries.push({ t, k: key, m: 'n', s: source });
        if (pendingChange) {
          mode = 'i';
          pendingChange = false;
        }
        pendingOp = null;
        continue;
      }

      // `:` → command mode
      if (key === ':') {
        mode = 'c';
        cmdBuf = '';
        searchMode = false;
        continue; // ':' itself not logged; full command emitted on <CR>
      }

      // `/` or `?` → search (treat like command mode)
      if (key === '/' || key === '?') {
        mode = 'c';
        cmdBuf = key;
        searchMode = true;
        continue;
      }

      // Visual mode entry
      if (VISUAL_ENTRY_KEYS.has(key)) {
        entries.push({ t, k: key, m: 'n', s: source });
        mode = 'v';
        continue;
      }

      // Insert mode entry (direct)
      if (INSERT_ENTRY_KEYS.has(key)) {
        entries.push({ t, k: key, m: 'n', s: source });
        mode = 'i';
        continue;
      }

      // 'c' operator — needs a motion, then enters insert
      if (key === CHANGE_OP) {
        entries.push({ t, k: key, m: 'n', s: source });
        pendingOp = key;
        pendingChange = true;
        continue;
      }

      // Other operators that need a motion
      if (MOTION_OPS.has(key)) {
        entries.push({ t, k: key, m: 'n', s: source });
        pendingOp = key;
        continue;
      }

      // Escape/cancel (harmless in normal mode, but log it)
      if (key === '<Esc>' || key === '<C-c>') {
        entries.push({ t, k: key, m: 'n', s: source });
        continue;
      }

      // Everything else: regular normal-mode key
      entries.push({ t, k: key, m: 'n', s: source });
    }

    // ── Insert mode ───────────────────────────────────────────────────────────
    else if (mode === 'i') {
      const isPrintable = key.length === 1 && key.charCodeAt(0) >= 0x20;

      if (key === '<Esc>' || key === '<C-c>' || key === '<C-[>') {
        entries.push({ t, k: key, m: 'i', s: source });
        mode = 'n';
      } else if (key === '<C-o>') {
        // Execute one normal command then return to insert.
        // Simplification: skip the next key and stay in insert.
        entries.push({ t, k: key, m: 'i', s: source });
        // consume one more key as a normal-mode command
        if (i + 1 < keys.length) {
          i++;
          entries.push({ t: baseTime + i, k: keys[i], m: 'n', s: source });
        }
      } else if (!isPrintable) {
        // Log control keys in insert mode (BS, Tab, arrow keys, etc.)
        entries.push({ t, k: key, m: 'i', s: source });
      }
      // Printable chars not logged (privacy)
    }

    // ── Visual mode ───────────────────────────────────────────────────────────
    else if (mode === 'v') {
      entries.push({ t, k: key, m: 'v', s: source });

      if (key === '<Esc>' || key === '<C-c>') {
        mode = 'n';
      } else if (VISUAL_NORMAL_OPS.has(key)) {
        mode = 'n';
      } else if (VISUAL_INSERT_OPS.has(key)) {
        mode = 'i';
      }
    }

    // ── Command mode ──────────────────────────────────────────────────────────
    else if (mode === 'c') {
      if (key === '<CR>' || key === '<NL>') {
        // Emit the complete command as a single entry
        const cmd = searchMode ? cmdBuf : ':' + cmdBuf;
        if (cmd.length > 1) {
          entries.push({ t, k: cmd.trimEnd(), m: 'c', s: source });
        }
        mode = 'n';
        cmdBuf = '';
        searchMode = false;
      } else if (key === '<Esc>' || key === '<C-c>') {
        mode = 'n';
        cmdBuf = '';
        searchMode = false;
      } else if (key === '<BS>') {
        cmdBuf = cmdBuf.slice(0, -1);
      } else if (key.length === 1) {
        cmdBuf += key;
      }
    }
  }

  return entries;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a Vim scriptout file and return entries in our standard format.
 * @param {string} filePath - Path to the .sout file
 * @returns {{ entries: Array, keyCount: number }}
 */
function parse(filePath) {
  const buf = fs.readFileSync(filePath);
  const stat = fs.statSync(filePath);
  const fileMtime = Math.floor(stat.mtimeMs / 1000);

  const keys = tokenize(buf);
  // Anchor timestamps: file mtime = last keystroke; work backwards
  const baseTime = fileMtime - keys.length;
  const entries = buildEntries(keys, baseTime, 'scriptout');

  return { entries, keyCount: keys.length };
}

module.exports = { parse, tokenize, buildEntries };
