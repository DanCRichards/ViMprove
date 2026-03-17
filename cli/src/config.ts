import * as fs from 'fs';
import * as path from 'path';
import { LOG_DIR } from './analyzer.js';

const DISMISSED_FILE = path.join(LOG_DIR, 'dismissed.json');

export function getDismissed(): string[] {
  if (!fs.existsSync(DISMISSED_FILE)) return [];
  try {
    const raw = fs.readFileSync(DISMISSED_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch { /* ignore */ }
  return [];
}

function writeDismissed(ids: string[]): void {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(DISMISSED_FILE, JSON.stringify([...new Set(ids)], null, 2) + '\n');
}

export function dismissTip(id: string): void {
  writeDismissed([...getDismissed(), id]);
}

export function undismissTip(id: string): void {
  writeDismissed(getDismissed().filter(d => d !== id));
}
