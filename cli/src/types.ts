export interface LogEntry {
  t: number;   // unix timestamp
  k: string;   // key name
  m: string;   // mode: n, i, v, V, c
  s: string;   // source: nvim, vscode, scriptout
}

export interface AnalyzeOptions {
  source?: string;
  since?: string;
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
  undoRedoOscillation: number;
  rapidSaves: number;
  textObjectOpportunities: number;
  repeatOpportunities: number;
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
