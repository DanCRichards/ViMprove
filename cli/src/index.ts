import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { analyze, listSources, getLastSession, LOG_DIR, VALID_SOURCES, parseSince, parseSinceSecs } from './analyzer.js';
import { TIPS } from './tips.js';
import { parse as parseScriptout } from './scriptout.js';
import { getDismissed, dismissTip, undismissTip } from './config.js';
import type { Stats, ParsedArgs } from './types.js';

// ── Colours ───────────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY || process.env.FORCE_COLOR === '1';
const c = isTTY
  ? {
      reset: '\x1b[0m',  bold: '\x1b[1m',    dim: '\x1b[2m',
      red: '\x1b[31m',   green: '\x1b[32m',  yellow: '\x1b[33m',
      cyan: '\x1b[36m',  magenta: '\x1b[35m',
    }
  : Object.fromEntries(
      ['reset','bold','dim','red','green','yellow','cyan','magenta'].map(k => [k, ''])
    ) as Record<string, string>;

// ── Layout helpers ────────────────────────────────────────────────────────────

const W = Math.min(process.stdout.columns || 80, 100);

const hr  = (ch = '─') => ch.repeat(W);
const num = (n: number) => n.toLocaleString();

function box(title: string, subtitle = ''): void {
  const bare = title + (subtitle ? `  ${subtitle}` : '');
  const inner = subtitle ? `${title}  ${c.dim}${subtitle}${c.reset}${c.cyan}${c.bold}` : title;
  const pad = ' '.repeat(Math.max(0, Math.floor((W - bare.length - 4) / 2)));
  console.log(c.cyan + c.bold + hr('━') + c.reset);
  console.log(`${c.cyan}${c.bold}${pad}  ${inner}  ${c.reset}`);
  console.log(c.cyan + c.bold + hr('━') + c.reset);
}

function section(title: string): void {
  console.log(`\n${c.bold}${c.yellow}▸ ${title}${c.reset}`);
  console.log(c.dim + hr() + c.reset);
}

function kv(label: string, value: string, color = ''): void {
  const l = `  ${label}`.padEnd(28);
  console.log(`${c.dim}${l}${c.reset}${color}${value}${color ? c.reset : ''}`);
}

function bar(value: number, max: number, width = 20): string {
  const filled = Math.round((value / Math.max(max, 1)) * width);
  return c.cyan + '█'.repeat(filled) + c.dim + '░'.repeat(width - filled) + c.reset;
}

function severityBadge(s: number): string {
  if (s >= 3) return `${c.red}${c.bold}HIGH${c.reset} `;
  if (s >= 2) return `${c.yellow}${c.bold}MED ${c.reset} `;
  return              `${c.green}${c.bold}LOW ${c.reset} `;
}

function relativeTime(unixSecs: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSecs;
  if (diff < 60)         return 'just now';
  if (diff < 3600)       return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)      return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSecs * 1000).toLocaleDateString();
}

function duration(secs: number): string {
  if (secs < 60)    return `${secs}s`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(argv: string[]): ParsedArgs {
  const flags = { source: 'all', since: 'all' };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '--source' || argv[i] === '-s') && argv[i + 1]) {
      flags.source = argv[++i];
    } else if (argv[i] === '--since' && argv[i + 1]) {
      flags.since = argv[++i];
    } else if (argv[i].startsWith('--source=')) {
      flags.source = argv[i].slice('--source='.length);
    } else if (argv[i].startsWith('--since=')) {
      flags.since = argv[i].slice('--since='.length);
    } else {
      positional.push(argv[i]);
    }
  }

  return { flags, positional };
}

function filterLabel(flags: ParsedArgs['flags']): string {
  const parts: string[] = [];
  if (flags.source !== 'all') parts.push(`source: ${flags.source}`);
  if (flags.since  !== 'all') parts.push(`last ${flags.since}`);
  return parts.length ? `[${parts.join(' · ')}]` : '';
}

function validateFlags(flags: ParsedArgs['flags']): string[] {
  const errors: string[] = [];
  if (flags.source !== 'all' && !VALID_SOURCES.includes(flags.source as typeof VALID_SOURCES[number])) {
    errors.push(`Unknown source "${flags.source}". Valid values: ${VALID_SOURCES.join(', ')}, all`);
  }
  if (flags.since !== 'all' && !/^\d+(h|d)$/.test(flags.since)) {
    errors.push(`Unknown --since value "${flags.since}". Examples: 1h, 24h, 7d, 30d`);
  }
  return errors;
}

// ── Commands ──────────────────────────────────────────────────────────────────

function cmdHelp(): void {
  box('Vim Improver');
  console.log(`
  Captures your Vim keystrokes and shows you where you can improve.

  ${c.bold}Commands:${c.reset}
    ${c.green}sources${c.reset}            Show what data is available per source
    ${c.green}stats${c.reset}              Keystroke statistics
    ${c.green}tips${c.reset}               Personalized improvement tips
    ${c.green}report${c.reset}             Full stats + tips  ${c.dim}(default)${c.reset}
    ${c.green}progress${c.reset}           Compare this period vs the previous period
    ${c.green}session${c.reset}            Summary of your most recent Vim session
    ${c.green}import ${c.dim}<file>${c.reset}       Import a Vim scriptout (-w) file
    ${c.green}dismiss ${c.dim}<tip-id>${c.reset}    Suppress a tip you've already absorbed
    ${c.green}undismiss ${c.dim}<id>${c.reset}      Re-enable a dismissed tip
    ${c.green}clear${c.reset}              Delete all collected log data

  ${c.bold}Filters:${c.reset}  ${c.dim}(work with stats, tips, report, progress)${c.reset}
    ${c.cyan}--source${c.reset} ${c.dim}<name>${c.reset}    Only analyse this source
                       ${c.dim}nvim · vscode · scriptout · all (default)${c.reset}
    ${c.cyan}--since${c.reset} ${c.dim}<period>${c.reset}   Only analyse data from this window
                       ${c.dim}1h · 24h · 7d · 30d · all (default)${c.reset}

  ${c.bold}Options:${c.reset}
    ${c.cyan}--all${c.reset}               Show all tips including dismissed ones

  ${c.bold}Examples:${c.reset}
    vimprove report --source nvim
    vimprove tips   --source vscode --since 7d
    vimprove stats  --since 24h
    vimprove progress --since 7d
    vimprove dismiss wq_vs_ZZ

  ${c.bold}Log directory:${c.reset} ${c.dim}${LOG_DIR}${c.reset}

  ${c.bold}Automatic logging:${c.reset}
    Run ${c.cyan}./install.sh${c.reset} to set up the NeoVim plugin and VSCode extension.

  ${c.bold}Manual logging with Vim's ${c.cyan}-w${c.reset}${c.bold} flag:${c.reset}
    nvim -w ~/.vim-improver/session.sout  myfile.txt
    vimprove import ~/.vim-improver/session.sout
`);
}

function cmdSources(): void {
  box('Vim Improver — Sources');
  const data = listSources();
  const total = Object.values(data).reduce((s, v) => s + v.count, 0);

  if (total === 0) {
    console.log(`\n  ${c.yellow}No data recorded yet.${c.reset}`);
    console.log(`  Run ${c.cyan}./install.sh${c.reset} to set up logging.\n`);
    return;
  }

  const SOURCE_LABELS: Record<string, string> = {
    nvim:      'NeoVim plugin',
    vscode:    'VSCode extension',
    scriptout: 'Vim -w scriptout',
  };

  section('Available sources');
  const maxCount = Math.max(...Object.values(data).map(v => v.count), 1);

  for (const src of VALID_SOURCES) {
    const { count, lastSeen } = data[src];
    const hasData = count > 0;
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
    const barStr = hasData ? bar(count, maxCount) : c.dim + '░'.repeat(20) + c.reset;
    const lastStr = hasData && lastSeen
      ? c.dim + relativeTime(lastSeen) + c.reset
      : c.dim + 'no data' + c.reset;
    const countStr = hasData
      ? `${c.bold}${num(count)}${c.reset} keystrokes ${c.dim}(${pct}%)${c.reset}`
      : c.dim + '—' + c.reset;

    console.log();
    console.log(`  ${c.bold}${c.cyan}${src}${c.reset}  ${c.dim}${SOURCE_LABELS[src]}${c.reset}`);
    console.log(`    ${barStr}  ${countStr}`);
    console.log(`    ${c.dim}Last seen:${c.reset}  ${lastStr}`);
  }

  console.log();
  console.log(c.dim + '  ' + hr() + c.reset);
  console.log(`\n  ${c.dim}Total: ${num(total)} keystrokes across all sources${c.reset}`);

  const activeSrcs = VALID_SOURCES.filter(s => data[s].count > 0);
  if (activeSrcs.length > 1) {
    console.log(`\n  ${c.bold}Filter to a single source:${c.reset}`);
    for (const src of activeSrcs) {
      console.log(`    vimprove report ${c.cyan}--source ${src}${c.reset}`);
    }
  }
  console.log();
}

function cmdStats(stats: Stats, flags: ParsedArgs['flags']): void {
  box('Vim Improver — Stats', filterLabel(flags));

  section('Overview');
  kv('Total keystrokes', num(stats.totalKeystrokes), c.cyan + c.bold);
  kv('Sessions', num(stats.sessionCount));
  kv('First recorded', stats.firstSeen.toLocaleString());
  kv('Last recorded',  stats.lastSeen.toLocaleString());

  section('Source breakdown');
  const sources = Object.entries(stats.sourceBreakdown).sort((a, b) => b[1] - a[1]);
  const srcMax = Math.max(...sources.map(([, v]) => v));
  for (const [src, count] of sources) {
    kv(src, `${bar(count, srcMax)}  ${num(count)} (${((count / stats.totalKeystrokes) * 100).toFixed(1)}%)`);
  }

  section('Mode breakdown');
  const modes = Object.entries(stats.modeBreakdown).sort((a, b) => b[1] - a[1]);
  const modeMax = Math.max(...modes.map(([, v]) => v));
  for (const [mode, count] of modes) {
    kv(mode, `${bar(count, modeMax)}  ${num(count)} (${((count / stats.totalKeystrokes) * 100).toFixed(1)}%)`);
  }

  section('Top 15 normal-mode keys');
  const topKeys = Object.entries(stats.normalKeyCounts)
    .filter(([k]) => k !== '<session-start>')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  const keyMax = topKeys[0]?.[1] ?? 1;
  for (const [key, count] of topKeys) {
    kv(key, `${bar(count, keyMax)}  ${num(count)} (${((count / stats.totalKeystrokes) * 100).toFixed(1)}%)`);
  }
  console.log();
}

function cmdTips(stats: Stats, flags: ParsedArgs['flags'], showAll = false): void {
  box('Vim Improver — Tips', filterLabel(flags));

  const dismissed = getDismissed();

  const triggered = TIPS
    .map(tip => ({ tip, score: tip.detect(stats) }))
    .filter(({ tip, score }) => score >= tip.threshold)
    .filter(({ tip }) => showAll || !dismissed.includes(tip.id))
    .sort((a, b) => b.tip.severity - a.tip.severity || b.score - a.score);

  const hiddenCount = showAll ? 0 : TIPS
    .map(tip => ({ tip, score: tip.detect(stats) }))
    .filter(({ tip, score }) => score >= tip.threshold && dismissed.includes(tip.id))
    .length;

  if (triggered.length === 0) {
    console.log(`\n  ${c.green}${c.bold}No inefficiencies detected!${c.reset}`);
    console.log(`  ${c.dim}Either your Vim-fu is strong, or there isn't enough data yet.${c.reset}`);
    if (flags.source !== 'all' || flags.since !== 'all') {
      console.log(`\n  ${c.dim}Try widening the filter:  vimprove tips${c.reset}`);
    }
    if (hiddenCount > 0) {
      console.log(`\n  ${c.dim}${hiddenCount} dismissed tip(s) not shown — run vimprove tips --all to see them.${c.reset}`);
    }
    console.log();
    return;
  }

  console.log(`\n  Found ${c.bold}${triggered.length}${c.reset} area(s) to improve, sorted by impact:\n`);

  for (let i = 0; i < triggered.length; i++) {
    const { tip, score } = triggered[i];
    const n = `${i + 1}`.padStart(2);

    console.log(
      `  ${c.bold}${c.cyan}${n}. ${tip.title}${c.reset}  ` +
      `${severityBadge(tip.severity)}` +
      `${c.dim}(seen ${score}×)  category: ${tip.category}${c.reset}`
    );
    console.log(`     ${c.dim}id: ${tip.id}${c.reset}`);
    console.log();
    console.log(`     ${tip.description}`);
    console.log();
    console.log(`     ${c.red}Instead of:${c.reset}  ${c.dim}${tip.before}${c.reset}`);
    console.log(`     ${c.green}Try:${c.reset}`);

    const afters = Array.isArray(tip.after) ? tip.after : [tip.after];
    for (const line of afters) {
      console.log(`       ${c.green}${line}${c.reset}`);
    }

    if (tip.keys?.length) {
      console.log();
      console.log(`     ${c.dim}Keys: ${tip.keys.join('  ')}${c.reset}`);
    }

    console.log();
    console.log(`     ${c.dim}Dismiss this tip:  vimprove dismiss ${tip.id}${c.reset}`);
    console.log();
    console.log(c.dim + '  ' + hr() + c.reset);
    console.log();
  }

  if (hiddenCount > 0) {
    console.log(`  ${c.dim}${hiddenCount} dismissed tip(s) hidden — run vimprove tips --all to see them.${c.reset}\n`);
  }
}

function cmdReport(stats: Stats, flags: ParsedArgs['flags'], showAll = false): void {
  cmdStats(stats, flags);
  cmdTips(stats, flags, showAll);
}

// ── Progress ──────────────────────────────────────────────────────────────────

function cmdProgress(flags: ParsedArgs['flags']): void {
  const periodLabel = flags.since !== 'all' ? flags.since : '7d';
  const periodSecs  = parseSinceSecs(periodLabel) || 7 * 86400;
  const now = Math.floor(Date.now() / 1000);

  const currentStart = now - periodSecs;
  const prevStart    = currentStart - periodSecs;

  const currentStats = analyze({ source: flags.source !== 'all' ? flags.source : undefined, afterTs: currentStart, beforeTs: now });
  const prevStats    = analyze({ source: flags.source !== 'all' ? flags.source : undefined, afterTs: prevStart,    beforeTs: currentStart });

  box('Vim Improver — Progress', `[${periodLabel} vs ${periodLabel} prior]`);

  if (!currentStats && !prevStats) {
    console.log(`\n  ${c.yellow}No data found for either period.${c.reset}\n`);
    return;
  }

  // Overall keystrokes trend
  section('Keystroke volume');
  const curKeys  = currentStats?.totalKeystrokes ?? 0;
  const prevKeys = prevStats?.totalKeystrokes ?? 0;
  const keysDiff = prevKeys > 0 ? Math.round(((curKeys - prevKeys) / prevKeys) * 100) : null;
  const keysArrow = keysDiff === null ? '' : keysDiff > 0
    ? `  ${c.green}↑ ${keysDiff}% more activity${c.reset}`
    : keysDiff < 0
    ? `  ${c.yellow}↓ ${Math.abs(keysDiff)}% less activity${c.reset}`
    : `  ${c.dim}— no change${c.reset}`;
  kv('This period',  `${num(curKeys)} keystrokes`);
  kv('Prior period', `${num(prevKeys)} keystrokes${keysArrow}`);

  // Tip-by-tip comparison
  section('Tip trends');
  console.log(`  ${'Tip'.padEnd(38)} ${'This'.padStart(6)}  ${'Prior'.padStart(6)}  Change`);
  console.log(c.dim + '  ' + hr() + c.reset);

  let improved = 0, regressed = 0;

  for (const tip of TIPS) {
    const curScore  = currentStats ? tip.detect(currentStats) : 0;
    const prevScore = prevStats    ? tip.detect(prevStats)    : 0;

    const isTriggeredNow  = curScore  >= tip.threshold;
    const isTriggeredPrev = prevScore >= tip.threshold;

    // Only show tips that were or are relevant in at least one period
    if (!isTriggeredNow && !isTriggeredPrev) continue;

    const curStr  = isTriggeredNow  ? `${curScore}×` : '—';
    const prevStr = isTriggeredPrev ? `${prevScore}×` : '—';

    let changeStr = `${c.dim}—${c.reset}`;
    if (isTriggeredPrev && !isTriggeredNow) {
      changeStr = `${c.green}✓ resolved${c.reset}`;
      improved++;
    } else if (!isTriggeredPrev && isTriggeredNow) {
      changeStr = `${c.yellow}⚠ new${c.reset}`;
      regressed++;
    } else if (isTriggeredPrev && isTriggeredNow) {
      const pct = prevScore > 0 ? Math.round(((curScore - prevScore) / prevScore) * 100) : 0;
      if (pct <= -10) { changeStr = `${c.green}↓ ${Math.abs(pct)}% better${c.reset}`; improved++; }
      else if (pct >= 10) { changeStr = `${c.red}↑ ${pct}% worse${c.reset}`; regressed++; }
      else { changeStr = `${c.dim}→ flat${c.reset}`; }
    }

    const title = tip.title.length > 36 ? tip.title.slice(0, 35) + '…' : tip.title;
    console.log(
      `  ${c.dim}${title.padEnd(38)}${c.reset}` +
      ` ${curStr.padStart(6)}  ${prevStr.padStart(6)}  ${changeStr}`
    );
  }

  console.log();
  if (improved > 0 || regressed > 0) {
    console.log(
      `  ${c.green}${improved} improved${c.reset}  ` +
      `${regressed > 0 ? c.red : c.dim}${regressed} regressed${c.reset}\n`
    );
  } else {
    console.log(`  ${c.dim}No significant change between periods.${c.reset}\n`);
  }
}

// ── Session summary ───────────────────────────────────────────────────────────

function cmdSession(): void {
  box('Vim Improver — Last Session');

  const session = getLastSession();
  if (!session) {
    console.log(`\n  ${c.yellow}No session data found.${c.reset}\n`);
    return;
  }

  section('Summary');
  kv('When',       relativeTime(session.startTs));
  kv('Duration',   duration(session.durationSecs));
  kv('Keystrokes', num(session.keystrokes), c.cyan + c.bold);

  if (session.topKeys.length > 0) {
    section('Top normal-mode keys this session');
    const maxCount = session.topKeys[0].count;
    for (const { key, count } of session.topKeys) {
      kv(key, `${bar(count, maxCount)}  ${num(count)}`);
    }
  }

  console.log();
  console.log(`  ${c.dim}Run ${c.reset}vimprove tips${c.dim} for improvement suggestions based on all your data.${c.reset}\n`);
}

// ── Dismiss ───────────────────────────────────────────────────────────────────

function cmdDismiss(tipId: string | undefined): void {
  if (!tipId) {
    console.log(`${c.red}Usage: vimprove dismiss <tip-id>${c.reset}`);
    console.log(`\nRun ${c.cyan}vimprove tips${c.reset} to see tip IDs.\n`);
    return;
  }
  const tip = TIPS.find(t => t.id === tipId);
  if (!tip) {
    console.log(`${c.red}Unknown tip ID: "${tipId}"${c.reset}`);
    console.log(`\nValid IDs: ${TIPS.map(t => t.id).join(', ')}\n`);
    return;
  }
  dismissTip(tipId);
  console.log(`\n  ${c.green}✓${c.reset} Dismissed "${tip.title}"`);
  console.log(`  ${c.dim}It will no longer appear in tips or report.${c.reset}`);
  console.log(`  ${c.dim}Undo with:  vimprove undismiss ${tipId}${c.reset}\n`);
}

function cmdUndismiss(tipId: string | undefined): void {
  if (!tipId) {
    const dismissed = getDismissed();
    if (dismissed.length === 0) {
      console.log(`\n  ${c.dim}No dismissed tips.${c.reset}\n`);
      return;
    }
    console.log(`\n  ${c.bold}Dismissed tips:${c.reset}`);
    for (const id of dismissed) {
      const tip = TIPS.find(t => t.id === id);
      console.log(`    ${c.cyan}${id}${c.reset}${tip ? `  ${c.dim}${tip.title}${c.reset}` : ''}`);
    }
    console.log(`\n  Run ${c.cyan}vimprove undismiss <tip-id>${c.reset} to re-enable.\n`);
    return;
  }
  undismissTip(tipId);
  const tip = TIPS.find(t => t.id === tipId);
  console.log(`\n  ${c.green}✓${c.reset} Re-enabled ${tip ? `"${tip.title}"` : tipId}\n`);
}

function cmdImport(filePath: string | undefined): void {
  if (!filePath) {
    console.log(`${c.red}Usage: vimprove import <path-to-scriptout-file>${c.reset}`);
    console.log(`\nRecord a session with:  nvim -w ~/session.sout myfile.txt`);
    return;
  }

  const resolved = path.resolve(filePath.replace(/^~/, os.homedir()));
  if (!fs.existsSync(resolved)) {
    console.log(`${c.red}File not found: ${resolved}${c.reset}`);
    return;
  }

  let result: ReturnType<typeof parseScriptout>;
  try {
    result = parseScriptout(resolved);
  } catch (e) {
    console.log(`${c.red}Failed to parse: ${(e as Error).message}${c.reset}`);
    return;
  }

  const { entries, keyCount } = result;
  if (entries.length === 0) {
    console.log(`${c.yellow}No usable entries found in ${resolved}${c.reset}`);
    return;
  }

  fs.mkdirSync(LOG_DIR, { recursive: true });
  const outFile = path.join(LOG_DIR, 'imported.log');
  fs.appendFileSync(outFile, entries.map(e => JSON.stringify(e)).join('\n') + '\n');

  console.log(`\n${c.green}${c.bold}Imported ${entries.length} entries${c.reset} from ${c.cyan}${path.basename(resolved)}${c.reset}`);
  console.log(`  Raw keystrokes  ${c.bold}${num(keyCount)}${c.reset}`);
  console.log(`  Logged entries  ${c.bold}${num(entries.length)}${c.reset}  ${c.dim}(insert-mode text excluded)${c.reset}`);
  console.log(`  Written to      ${c.dim}${outFile}${c.reset}`);
  console.log(`\nRun ${c.cyan}vimprove report --source scriptout${c.reset} to see the analysis.\n`);
}

function cmdClear(flags: ParsedArgs['flags']): void {
  if (!fs.existsSync(LOG_DIR)) { console.log('No log data to clear.'); return; }

  if (flags.source !== 'all') {
    const logFile = path.join(LOG_DIR, `${flags.source}.log`);
    if (!fs.existsSync(logFile)) { console.log(`No log file found for source "${flags.source}".`); return; }
    fs.unlinkSync(logFile);
    console.log(`${c.green}Cleared ${logFile}${c.reset}`);
    return;
  }

  const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log') || f.endsWith('.sout'));
  if (files.length === 0) { console.log('No log files found.'); return; }
  for (const file of files) fs.unlinkSync(path.join(LOG_DIR, file));
  console.log(`${c.green}Cleared ${files.length} file(s) from ${LOG_DIR}${c.reset}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

function main(): void {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const command = positional[0] ?? 'report';
  const showAll = process.argv.includes('--all');

  if (command === 'help' || command === '--help' || command === '-h') { cmdHelp(); return; }
  if (command === 'sources')    { cmdSources(); return; }
  if (command === 'session')    { cmdSession(); return; }
  if (command === 'import')     { cmdImport(positional[1]); return; }
  if (command === 'dismiss')    { cmdDismiss(positional[1]); return; }
  if (command === 'undismiss')  { cmdUndismiss(positional[1]); return; }
  if (command === 'clear')      { cmdClear(flags); return; }

  const errors = validateFlags(flags);
  if (errors.length) {
    for (const e of errors) console.log(`${c.red}Error: ${e}${c.reset}`);
    console.log(`\nRun ${c.cyan}vimprove help${c.reset} for usage.\n`);
    process.exit(1);
  }

  if (command === 'progress') { cmdProgress(flags); return; }

  const stats = analyze(flags);
  if (!stats) {
    const label = filterLabel(flags);
    console.log(`\n${c.yellow}No data found${label ? ` for ${label}` : ''}.${c.reset}`);
    if (flags.source !== 'all' || flags.since !== 'all') {
      console.log(`${c.dim}Try:  vimprove sources  — to see what's available${c.reset}`);
    } else {
      console.log(`Run ${c.cyan}./install.sh${c.reset} to set up logging, then use Vim for a while.`);
    }
    console.log();
    return;
  }

  switch (command) {
    case 'stats':  cmdStats(stats, flags);           break;
    case 'tips':   cmdTips(stats, flags, showAll);   break;
    case 'report':
    default:       cmdReport(stats, flags, showAll); break;
  }
}

main();
