'use strict';
// Reads ~/.vim-improver/*.log and *.sout files, producing a stats object
// consumed by tips.js detectors.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { parse: parseScriptout } = require('./scriptout');

const LOG_DIR = path.join(os.homedir(), '.vim-improver');
const SESSION_GAP_SECS = 120; // keys >2 min apart = new session

// ── Log parsing ──────────────────────────────────────────────────────────────

function readLogs() {
  if (!fs.existsSync(LOG_DIR)) return [];

  const entries = [];

  for (const file of fs.readdirSync(LOG_DIR)) {
    const filePath = path.join(LOG_DIR, file);

    // JSONL logs from NeoVim plugin or VSCode extension
    if (file.endsWith('.log')) {
      const raw = fs.readFileSync(filePath, 'utf8');
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.t && entry.k && entry.m) entries.push(entry);
        } catch (_) {}
      }
    }

    // Vim scriptout files (-w / -W flag)
    if (file.endsWith('.sout')) {
      try {
        const { entries: parsed } = parseScriptout(filePath);
        entries.push(...parsed);
      } catch (e) {
        // Silently skip unreadable files
      }
    }
  }

  entries.sort((a, b) => a.t - b.t);
  return entries;
}

// ── Session splitting ────────────────────────────────────────────────────────

function splitIntoSessions(entries) {
  if (entries.length === 0) return [];
  const sessions = [];
  let current = [entries[0]];

  for (let i = 1; i < entries.length; i++) {
    if (entries[i].t - entries[i - 1].t > SESSION_GAP_SECS) {
      sessions.push(current);
      current = [];
    }
    current.push(entries[i]);
  }
  sessions.push(current);
  return sessions;
}

// ── Run detection ────────────────────────────────────────────────────────────
// A "run" is N+ consecutive identical keys (in normal mode).
// e.g. j j j j j = a run of 5 j's.

const RUN_THRESHOLD = 3; // minimum run length to count

function detectRuns(entries) {
  const runs = {}; // key → number of runs of RUN_THRESHOLD+

  let i = 0;
  while (i < entries.length) {
    const key = entries[i].k;
    const mode = entries[i].m;

    // Only care about normal/visual mode
    if (mode !== 'n' && mode !== 'v' && mode !== 'V') {
      i++;
      continue;
    }

    let j = i;
    while (j < entries.length && entries[j].k === key && entries[j].m === mode) {
      j++;
    }

    const runLen = j - i;
    if (runLen >= RUN_THRESHOLD) {
      runs[key] = (runs[key] || 0) + 1;
    }
    i = j === i ? i + 1 : j;
  }

  return runs;
}

// ── Sequence detection ────────────────────────────────────────────────────────
// Detect two-key sequences (e.g. d$, c$, i<Esc>) and complete :commands.
//
// Handles two log formats:
//   NeoVim JSONL — command mode emits individual chars; reconstructed here.
//   Scriptout    — command mode emits complete ':wq' entries directly.

function detectSequences(entries) {
  const seqs = {};

  // Pass 1: two-key normal-mode sequences and i<Esc>
  for (let i = 0; i < entries.length - 1; i++) {
    const a = entries[i];
    const b = entries[i + 1];

    // Scriptout uses synthetic timestamps (1s apart); JSONL uses real ones.
    // Use a generous window so both work.
    if (b.t - a.t > 10) continue;

    // Normal-mode two-key sequences (d$, c$, etc.)
    if (a.m === 'n' && b.m === 'n') {
      seqs[a.k + b.k] = (seqs[a.k + b.k] || 0) + 1;
    }

    // i then immediately Esc — accidental insert entry
    if (a.k === 'i' && a.m === 'n' && b.k === '<Esc>') {
      seqs['i<Esc>'] = (seqs['i<Esc>'] || 0) + 1;
    }
  }

  // Pass 2: reconstruct :commands
  // Scriptout: single entry where k starts with ':' (e.g. ':wq')
  // NeoVim JSONL: ':' in normal mode followed by chars in command mode then <CR>
  let cmdBuf = '';
  let inCmd = false;

  for (const entry of entries) {
    // Scriptout pre-assembled command
    if (entry.m === 'c' && entry.k.startsWith(':') && entry.k.length > 1) {
      seqs[entry.k] = (seqs[entry.k] || 0) + 1;
      continue;
    }

    // NeoVim JSONL command reconstruction
    if (entry.k === ':' && entry.m === 'n') {
      inCmd = true;
      cmdBuf = ':';
      continue;
    }
    if (inCmd) {
      if (entry.m === 'c') {
        if (entry.k === '<CR>' || entry.k === '<NL>') {
          if (cmdBuf.length > 1) seqs[cmdBuf] = (seqs[cmdBuf] || 0) + 1;
          inCmd = false;
          cmdBuf = '';
        } else if (entry.k === '<Esc>' || entry.k === '<C-c>') {
          inCmd = false;
          cmdBuf = '';
        } else if (entry.k.length === 1) {
          cmdBuf += entry.k;
        }
      } else {
        inCmd = false;
        cmdBuf = '';
      }
    }
  }

  return seqs;
}

// ── Key counts ────────────────────────────────────────────────────────────────

function countKeys(entries) {
  const counts = {};
  for (const e of entries) {
    counts[e.k] = (counts[e.k] || 0) + 1;
  }
  return counts;
}

// ── Undo/redo oscillation ─────────────────────────────────────────────────────
// Detect alternating u / <C-r> patterns

function detectUndoRedoOscillation(entries) {
  let oscillations = 0;
  for (let i = 0; i < entries.length - 1; i++) {
    const a = entries[i].k;
    const b = entries[i + 1].k;
    if ((a === 'u' && b === '<C-r>') || (a === '<C-r>' && b === 'u')) {
      oscillations++;
    }
  }
  return oscillations;
}

// ── Rapid saves ───────────────────────────────────────────────────────────────

function detectRapidSaves(entries) {
  const saveEntries = entries.filter((e) => e.k === ':w' || e.k === 'ZZ');
  let rapidCount = 0;
  for (let i = 1; i < saveEntries.length; i++) {
    if (saveEntries[i].t - saveEntries[i - 1].t < 10) {
      rapidCount++;
    }
  }
  return rapidCount;
}

// ── Text object opportunities ─────────────────────────────────────────────────
// Heuristic: ^ or 0 followed by d/c/y within a few keys = could use diw/daw

function detectTextObjectOpportunities(entries) {
  let opportunities = 0;
  for (let i = 0; i < entries.length - 2; i++) {
    const a = entries[i].k;
    const b = entries[i + 1].k;
    const c = entries[i + 2].k;

    const isLineStart = a === '^' || a === '0';
    const isOperator = b === 'd' || b === 'c' || b === 'y';
    const isWordEnd = c === 'w' || c === 'e' || c === '$';

    if (isLineStart && isOperator && isWordEnd) {
      opportunities++;
    }
  }
  return opportunities;
}

// ── Repeat opportunities ──────────────────────────────────────────────────────
// Detect the same normal-mode command repeated within a short window

function detectRepeatOpportunities(entries) {
  let opportunities = 0;
  // Look for identical two-key normal-mode sequences repeated back-to-back
  for (let i = 0; i < entries.length - 4; i++) {
    if (entries[i].m !== 'n') continue;
    const a1 = entries[i].k;
    const a2 = entries[i + 1].k;
    const b1 = entries[i + 2].k;
    const b2 = entries[i + 3].k;

    if (a1 === b1 && a2 === b2 && entries[i + 2].t - entries[i + 1].t < 10) {
      opportunities++;
    }
  }
  return opportunities;
}

// ── Filtering ─────────────────────────────────────────────────────────────────

const VALID_SOURCES = ['nvim', 'vscode', 'scriptout'];

/** Parse a --since string like '7d', '24h', '1h' into a cutoff unix timestamp. */
function parseSince(since) {
  if (!since || since === 'all') return 0;
  const match = since.match(/^(\d+)(h|d)$/);
  if (!match) return 0;
  const [, n, unit] = match;
  const secs = unit === 'h' ? Number(n) * 3600 : Number(n) * 86400;
  return Math.floor(Date.now() / 1000) - secs;
}

function filterEntries(entries, { source, since } = {}) {
  let out = entries;
  if (source && source !== 'all') {
    out = out.filter((e) => e.s === source);
  }
  const cutoff = parseSince(since);
  if (cutoff > 0) {
    out = out.filter((e) => e.t >= cutoff);
  }
  return out;
}

// ── Source listing ────────────────────────────────────────────────────────────

/** Returns per-source metadata from all logs, regardless of any active filter. */
function listSources() {
  const all = readLogs();
  const result = {};

  for (const src of VALID_SOURCES) {
    result[src] = { count: 0, firstSeen: null, lastSeen: null };
  }

  for (const e of all) {
    const s = e.s in result ? e.s : null;
    if (!s) continue;
    result[s].count++;
    if (!result[s].firstSeen || e.t < result[s].firstSeen) result[s].firstSeen = e.t;
    if (!result[s].lastSeen  || e.t > result[s].lastSeen)  result[s].lastSeen  = e.t;
  }

  return result;
}

// ── Main analyze function ─────────────────────────────────────────────────────

/**
 * @param {{ source?: string, since?: string }} opts
 *   source — 'nvim' | 'vscode' | 'scriptout' | 'all' (default: all)
 *   since  — '1h' | '24h' | '7d' | '30d' | 'all'    (default: all)
 */
function analyze(opts = {}) {
  const all = readLogs();
  const entries = filterEntries(all, opts);

  if (entries.length === 0) {
    return null;
  }

  const sessions = splitIntoSessions(entries);

  // Source breakdown within the filtered set
  const sourceBreakdown = {};
  for (const e of entries) {
    sourceBreakdown[e.s] = (sourceBreakdown[e.s] || 0) + 1;
  }

  // Mode breakdown
  const modeBreakdown = {};
  const modeNames = { n: 'Normal', i: 'Insert', v: 'Visual', V: 'Visual-Line', c: 'Command' };
  for (const e of entries) {
    const name = modeNames[e.m] || e.m;
    modeBreakdown[name] = (modeBreakdown[name] || 0) + 1;
  }

  const keyCounts = countKeys(entries);
  const normalEntries = entries.filter((e) => e.m === 'n');
  const normalKeyCounts = countKeys(normalEntries);

  return {
    totalKeystrokes: entries.length,
    sessionCount: sessions.length,
    sourceBreakdown,
    modeBreakdown,
    keyCounts,
    normalKeyCounts,
    runs: detectRuns(entries),
    sequences: detectSequences(entries),
    undoRedoOscillation: detectUndoRedoOscillation(entries),
    rapidSaves: detectRapidSaves(entries),
    textObjectOpportunities: detectTextObjectOpportunities(entries),
    repeatOpportunities: detectRepeatOpportunities(entries),
    firstSeen: new Date(entries[0].t * 1000),
    lastSeen: new Date(entries[entries.length - 1].t * 1000),
    // Pass filters through so the CLI can show them
    activeSource: opts.source || 'all',
    activeSince: opts.since || 'all',
  };
}

module.exports = { analyze, listSources, LOG_DIR, VALID_SOURCES, parseSince };
