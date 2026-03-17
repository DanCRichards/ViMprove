export interface LogEntry {
  t: number;   // unix timestamp
  k: string;   // key name
  m: string;   // mode: n, i, v, V, c
  s: string;   // source: nvim, vscode, scriptout
}

export interface AnalyzeOptions {
  source?: string;
  since?: string;
  afterTs?: number;   // unix timestamp lower bound (overrides since if set)
  beforeTs?: number;  // unix timestamp upper bound
}

export interface SourceInfo {
  count: number;
  firstSeen: number | null;
  lastSeen: number | null;
}

export interface Stats {
  totalKeystrokes: number;
  sessionCount: number;
  sourceBreakdown: Record<string, number>;
  modeBreakdown: Record<string, number>;
  keyCounts: Record<string, number>;
  normalKeyCounts: Record<string, number>;
  runs: Record<string, number>;
  sequences: Record<string, number>;
  // Existing detectors
  undoRedoOscillation: number;
  rapidSaves: number;
  textObjectOpportunities: number;
  repeatOpportunities: number;
  // New detectors
  starHashUsage: number;        // * and # presses (search word under cursor)
  jumpListUsage: number;        // <C-o> and <C-i> presses
  macroRecordCount: number;     // q presses in normal mode (macro record)
  macroPlayCount: number;       // @ presses in normal mode (macro play)
  indentRuns: number;           // runs of > or < (should use = operator)
  endOfLineInsertPattern: number; // $a / $i / 0i / 0a sequences → A / I
  substituteUsage: number;      // :s commands used
  splitUsage: number;           // <C-w> presses (window splits)
  percentUsage: number;         // % presses (bracket matching)
  cgnOpportunities: number;     // n+c sequences (should use cgn + .)
  ddMovePattern: number;        // dd + move + p (should use :m)
  firstSeen: Date;
  lastSeen: Date;
  activeSource: string;
  activeSince: string;
}

export interface Tip {
  id: string;
  category: string;
  severity: number;
  title: string;
  detect: (stats: Stats) => number;
  threshold: number;
  description: string;
  before: string;
  after: string | string[];
  keys?: string[];
}

export interface ScriptoutResult {
  entries: LogEntry[];
  keyCount: number;
}

export interface ParsedArgs {
  flags: { source: string; since: string };
  positional: string[];
}
