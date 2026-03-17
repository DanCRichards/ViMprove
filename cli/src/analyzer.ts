import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parse as parseScriptout } from './scriptout.js';
import type { LogEntry, Stats, SourceInfo, AnalyzeOptions } from './types.js';

export const LOG_DIR = path.join(os.homedir(), '.vim-improver');
export const VALID_SOURCES = ['nvim', 'vscode', 'scriptout'] as const;

const SESSION_GAP_SECS = 120;
const RUN_THRESHOLD = 3;

// ── Log reading ───────────────────────────────────────────────────────────────

function readLogs(): LogEntry[] {
  if (!fs.existsSync(LOG_DIR)) return [];

  const entries: LogEntry[] = [];

  for (const file of fs.readdirSync(LOG_DIR)) {
    const filePath = path.join(LOG_DIR, file);

    if (file.endsWith('.log')) {
      const raw = fs.readFileSync(filePath, 'utf8');
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as LogEntry;
          if (entry.t && entry.k && entry.m) entries.push(entry);
        } catch { /* skip malformed lines */ }
      }
    }

    if (file.endsWith('.sout')) {
      try {
        const { entries: parsed } = parseScriptout(filePath);
        entries.push(...parsed);
      } catch { /* skip unreadable files */ }
    }
  }

  entries.sort((a, b) => a.t - b.t);
  return entries;
}

// ── Filtering ─────────────────────────────────────────────────────────────────

export function parseSince(since: string | undefined): number {
  if (!since || since === 'all') return 0;
  const match = since.match(/^(\d+)(h|d)$/);
  if (!match) return 0;
  const n = Number(match[1]);
  const secs = match[2] === 'h' ? n * 3600 : n * 86400;
  return Math.floor(Date.now() / 1000) - secs;
}

export function parseSinceSecs(since: string | undefined): number {
  if (!since || since === 'all') return 0;
  const match = since.match(/^(\d+)(h|d)$/);
  if (!match) return 0;
  const n = Number(match[1]);
  return match[2] === 'h' ? n * 3600 : n * 86400;
}

function filterEntries(entries: LogEntry[], opts: AnalyzeOptions): LogEntry[] {
  let out = entries;
  if (opts.source && opts.source !== 'all') {
    out = out.filter(e => e.s === opts.source);
  }
  const afterTs = opts.afterTs ?? (opts.since ? parseSince(opts.since) : 0);
  if (afterTs > 0) out = out.filter(e => e.t >= afterTs);
  if (opts.beforeTs) out = out.filter(e => e.t < opts.beforeTs!);
  return out;
}

// ── Source listing ────────────────────────────────────────────────────────────

export function listSources(): Record<string, SourceInfo> {
  const all = readLogs();
  const result: Record<string, SourceInfo> = {};

  for (const src of VALID_SOURCES) {
    result[src] = { count: 0, firstSeen: null, lastSeen: null };
  }

  for (const e of all) {
    if (!(e.s in result)) continue;
    result[e.s].count++;
    const r = result[e.s];
    if (r.firstSeen === null || e.t < r.firstSeen) r.firstSeen = e.t;
    if (r.lastSeen  === null || e.t > r.lastSeen)  r.lastSeen  = e.t;
  }

  return result;
}

// ── Pattern detectors ─────────────────────────────────────────────────────────

function splitIntoSessions(entries: LogEntry[]): LogEntry[][] {
  if (entries.length === 0) return [];
  const sessions: LogEntry[][] = [];
  let current: LogEntry[] = [entries[0]];
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

function detectRuns(entries: LogEntry[]): Record<string, number> {
  const runs: Record<string, number> = {};
  let i = 0;
  while (i < entries.length) {
    const { k: key, m: mode } = entries[i];
    if (mode !== 'n' && mode !== 'v' && mode !== 'V') { i++; continue; }
    let j = i;
    while (j < entries.length && entries[j].k === key && entries[j].m === mode) j++;
    if (j - i >= RUN_THRESHOLD) runs[key] = (runs[key] ?? 0) + 1;
    i = j === i ? i + 1 : j;
  }
  return runs;
}

function detectSequences(entries: LogEntry[]): Record<string, number> {
  const seqs: Record<string, number> = {};

  // Pass 1: two-key normal-mode sequences and i<Esc>
  for (let i = 0; i < entries.length - 1; i++) {
    const a = entries[i], b = entries[i + 1];
    if (b.t - a.t > 10) continue;
    if (a.m === 'n' && b.m === 'n') seqs[a.k + b.k] = (seqs[a.k + b.k] ?? 0) + 1;
    if (a.k === 'i' && a.m === 'n' && b.k === '<Esc>') {
      seqs['i<Esc>'] = (seqs['i<Esc>'] ?? 0) + 1;
    }
  }

  // Pass 2: reconstruct :commands (handles both JSONL individual chars and scriptout pre-assembled)
  let cmdBuf = '';
  let inCmd = false;

  for (const entry of entries) {
    // Scriptout pre-assembled command (e.g. ':wq')
    if (entry.m === 'c' && entry.k.startsWith(':') && entry.k.length > 1) {
      seqs[entry.k] = (seqs[entry.k] ?? 0) + 1;
      continue;
    }
    // NeoVim JSONL: ':' in normal mode starts command accumulation
    if (entry.k === ':' && entry.m === 'n') { inCmd = true; cmdBuf = ':'; continue; }
    if (inCmd) {
      if (entry.m === 'c') {
        if (entry.k === '<CR>' || entry.k === '<NL>') {
          if (cmdBuf.length > 1) seqs[cmdBuf] = (seqs[cmdBuf] ?? 0) + 1;
          inCmd = false; cmdBuf = '';
        } else if (entry.k === '<Esc>' || entry.k === '<C-c>') {
          inCmd = false; cmdBuf = '';
        } else if (entry.k.length === 1) {
          cmdBuf += entry.k;
        }
      } else { inCmd = false; cmdBuf = ''; }
    }
  }

  return seqs;
}

function countKeys(entries: LogEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.k] = (counts[e.k] ?? 0) + 1;
  return counts;
}

function detectUndoRedoOscillation(entries: LogEntry[]): number {
  let n = 0;
  for (let i = 0; i < entries.length - 1; i++) {
    const a = entries[i].k, b = entries[i + 1].k;
    if ((a === 'u' && b === '<C-r>') || (a === '<C-r>' && b === 'u')) n++;
  }
  return n;
}

function detectRapidSaves(entries: LogEntry[]): number {
  const saves = entries.filter(e => e.k === ':w' || e.k === 'ZZ');
  let n = 0;
  for (let i = 1; i < saves.length; i++) {
    if (saves[i].t - saves[i - 1].t < 10) n++;
  }
  return n;
}

function detectTextObjectOpportunities(entries: LogEntry[]): number {
  let n = 0;
  for (let i = 0; i < entries.length - 2; i++) {
    const a = entries[i].k, b = entries[i + 1].k, c = entries[i + 2].k;
    if ((a === '^' || a === '0') &&
        (b === 'd' || b === 'c' || b === 'y') &&
        (c === 'w' || c === 'e' || c === '$')) n++;
  }
  return n;
}

function detectRepeatOpportunities(entries: LogEntry[]): number {
  let n = 0;
  for (let i = 0; i < entries.length - 4; i++) {
    if (entries[i].m !== 'n') continue;
    const [a1, a2, b1, b2] = [entries[i].k, entries[i+1].k, entries[i+2].k, entries[i+3].k];
    if (a1 === b1 && a2 === b2 && entries[i+2].t - entries[i+1].t < 10) n++;
  }
  return n;
}

// ── New detectors ─────────────────────────────────────────────────────────────

function detectStarHashUsage(entries: LogEntry[]): number {
  return entries.filter(e => (e.k === '*' || e.k === '#') && e.m === 'n').length;
}

function detectJumpListUsage(entries: LogEntry[]): number {
  return entries.filter(e => (e.k === '<C-o>' || e.k === '<C-i>') && e.m === 'n').length;
}

function detectMacroRecord(entries: LogEntry[]): number {
  return entries.filter(e => e.k === 'q' && e.m === 'n').length;
}

function detectMacroPlay(entries: LogEntry[]): number {
  return entries.filter(e => e.k === '@' && e.m === 'n').length;
}

function detectIndentRuns(entries: LogEntry[]): number {
  // Runs of > or < in normal mode (should use = operator or count instead)
  const indentEntries = entries.filter(e => (e.k === '>' || e.k === '<') && e.m === 'n');
  let runs = 0;
  let i = 0;
  while (i < indentEntries.length) {
    const key = indentEntries[i].k;
    let j = i;
    while (j < indentEntries.length && indentEntries[j].k === key) j++;
    if (j - i >= 2) runs++;
    i = j === i ? i + 1 : j;
  }
  return runs;
}

function detectEndOfLineInsert(entries: LogEntry[]): number {
  // Detect $a, $i, 0i, 0a sequences — user should use A, I instead
  let n = 0;
  for (let i = 0; i < entries.length - 1; i++) {
    const a = entries[i], b = entries[i + 1];
    if (b.t - a.t > 5) continue;
    if (a.m !== 'n') continue;
    const isEndMove  = a.k === '$' || a.k === 'g_';
    const isStartMove = a.k === '0' || a.k === '^';
    const isInsert = b.k === 'a' || b.k === 'i' || b.k === 'A' || b.k === 'I';
    if ((isEndMove || isStartMove) && isInsert) n++;
  }
  return n;
}

function detectSubstituteUsage(seqs: Record<string, number>): number {
  // Count :s and :%s commands found in sequence reconstruction
  let n = 0;
  for (const [key, count] of Object.entries(seqs)) {
    if (key.startsWith(':s') || key.startsWith(':%s')) n += count;
  }
  return n;
}

function detectSplitUsage(entries: LogEntry[]): number {
  return entries.filter(e => e.k === '<C-w>' && e.m === 'n').length;
}

function detectPercentUsage(entries: LogEntry[]): number {
  return entries.filter(e => e.k === '%' && e.m === 'n').length;
}

function detectCgnOpportunities(entries: LogEntry[]): number {
  // Detect n+c sequences: user goes to next match then changes — cgn+. would be faster
  let n = 0;
  for (let i = 0; i < entries.length - 1; i++) {
    const a = entries[i], b = entries[i + 1];
    if (a.m !== 'n' || b.m !== 'n') continue;
    if (a.k === 'n' && (b.k === 'c' || b.k === 's') && b.t - a.t < 5) n++;
  }
  return n;
}

function detectDdMovePattern(entries: LogEntry[]): number {
  // Detect dd + movement + p/P — user is moving lines, should use :m
  const MOVE_KEYS = new Set(['j','k','h','l','G','g','w','b','e','}','{',
    '<C-d>','<C-u>','<C-f>','<C-b>']);
  let n = 0;
  for (let i = 0; i < entries.length - 2; i++) {
    const a = entries[i], b = entries[i + 1];
    // Detect 'dd' — two d's in quick succession (second may be in operator-pending mode)
    if (a.k !== 'd' || b.k !== 'd') continue;
    if (b.t - a.t > 3) continue;
    // Scan ahead for movement then paste
    for (let j = i + 2; j < Math.min(i + 20, entries.length); j++) {
      const e = entries[j];
      if (e.t - b.t > 30) break;
      if (MOVE_KEYS.has(e.k)) continue;
      if (e.k === 'p' || e.k === 'P') { n++; }
      break;
    }
  }
  return n;
}

// ── Last session ──────────────────────────────────────────────────────────────

export interface SessionSummary {
  keystrokes: number;
  startTs: number;
  endTs: number;
  durationSecs: number;
  topKeys: Array<{ key: string; count: number }>;
}

export function getLastSession(): SessionSummary | null {
  const all = readLogs();
  if (all.length === 0) return null;

  // Split into sessions, take the last one
  const sessions: LogEntry[][] = [];
  let current: LogEntry[] = [all[0]];
  for (let i = 1; i < all.length; i++) {
    if (all[i].t - all[i - 1].t > SESSION_GAP_SECS) {
      sessions.push(current);
      current = [];
    }
    current.push(all[i]);
  }
  sessions.push(current);

  const last = sessions[sessions.length - 1];
  if (!last || last.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const e of last) {
    if (e.m === 'n' && e.k !== '<session-start>') {
      counts[e.k] = (counts[e.k] ?? 0) + 1;
    }
  }

  const topKeys = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, count]) => ({ key, count }));

  return {
    keystrokes: last.length,
    startTs: last[0].t,
    endTs: last[last.length - 1].t,
    durationSecs: last[last.length - 1].t - last[0].t,
    topKeys,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function analyze(opts: AnalyzeOptions = {}): Stats | null {
  const all = readLogs();
  const entries = filterEntries(all, opts);
  if (entries.length === 0) return null;

  const sessions = splitIntoSessions(entries);

  const sourceBreakdown: Record<string, number> = {};
  for (const e of entries) sourceBreakdown[e.s] = (sourceBreakdown[e.s] ?? 0) + 1;

  const modeBreakdown: Record<string, number> = {};
  const modeNames: Record<string, string> = { n: 'Normal', i: 'Insert', v: 'Visual', V: 'Visual-Line', c: 'Command' };
  for (const e of entries) {
    const name = modeNames[e.m] ?? e.m;
    modeBreakdown[name] = (modeBreakdown[name] ?? 0) + 1;
  }

  const keyCounts = countKeys(entries);
  const normalEntries = entries.filter(e => e.m === 'n');
  const normalKeyCounts = countKeys(normalEntries);
  const sequences = detectSequences(entries);

  return {
    totalKeystrokes: entries.length,
    sessionCount: sessions.length,
    sourceBreakdown,
    modeBreakdown,
    keyCounts,
    normalKeyCounts,
    runs: detectRuns(entries),
    sequences,
    undoRedoOscillation: detectUndoRedoOscillation(entries),
    rapidSaves: detectRapidSaves(entries),
    textObjectOpportunities: detectTextObjectOpportunities(entries),
    repeatOpportunities: detectRepeatOpportunities(entries),
    starHashUsage: detectStarHashUsage(entries),
    jumpListUsage: detectJumpListUsage(entries),
    macroRecordCount: detectMacroRecord(entries),
    macroPlayCount: detectMacroPlay(entries),
    indentRuns: detectIndentRuns(entries),
    endOfLineInsertPattern: detectEndOfLineInsert(entries),
    substituteUsage: detectSubstituteUsage(sequences),
    splitUsage: detectSplitUsage(entries),
    percentUsage: detectPercentUsage(entries),
    cgnOpportunities: detectCgnOpportunities(entries),
    ddMovePattern: detectDdMovePattern(entries),
    firstSeen: new Date(entries[0].t * 1000),
    lastSeen:  new Date(entries[entries.length - 1].t * 1000),
    activeSource: opts.source ?? 'all',
    activeSince:  opts.since  ?? 'all',
  };
}
