# Adding Tips

Tips live in `cli/src/tips.ts` as entries in the `TIPS` array. Each tip is a `Tip` object.

## Tip structure

```typescript
interface Tip {
  id: string;           // unique snake_case identifier
  category: string;     // "Navigation" | "Editing" | "Workflow" | "Text Objects" | "Repeat"
  severity: number;     // 1 (low) | 2 (medium) | 3 (high) — affects sort order in report
  title: string;        // short description shown in the tip header
  detect: (stats: Stats) => number;  // returns observed frequency; 0 = not triggered
  threshold: number;    // minimum detect() return value to surface the tip
  description: string;  // 1–2 sentence explanation shown under the title
  before: string;       // "Instead of:" — the inefficient pattern
  after: string | string[];  // "Try:" — one or more improved alternatives
  keys?: string[];      // optional list of key sequences shown at the bottom
}
```

## The Stats object

The `detect` function receives a `Stats` object with:

```typescript
interface Stats {
  totalKeystrokes: number;
  sessionCount: number;
  sourceBreakdown: Record<string, number>;  // { nvim: 1200, vscode: 400 }
  modeBreakdown: Record<string, number>;    // { n: 900, i: 600, v: 100 }
  keyCounts: Record<string, number>;        // all keys across all modes
  normalKeyCounts: Record<string, number>;  // keys only in normal mode
  runs: Record<string, number>;             // max run length seen for each key
  sequences: Record<string, number>;        // how often each 2-key sequence appeared
  undoRedoOscillation: number;              // pairs of u/<C-r> close together
  rapidSaves: number;                       // :w presses < 2s apart
  textObjectOpportunities: number;          // '^dw' pattern frequency
  repeatOpportunities: number;              // same 2-key sequence back-to-back
  firstSeen: Date;
  lastSeen: Date;
}
```

## Existing detectors

| Field | What it counts |
|---|---|
| `runs['j']` | Longest run of consecutive `j` presses seen |
| `keyCounts['<Down>']` | Total arrow-key-down presses |
| `sequences[':wq']` | How often `:wq` appeared as a reconstructed command |
| `undoRedoOscillation` | Times `u` was followed by `<C-r>` within 5 seconds |
| `rapidSaves` | Times `:w` appeared twice within 2 seconds |
| `textObjectOpportunities` | Times `^dw` pattern appeared (start-of-line + delete word) |
| `repeatOpportunities` | Times the same 2-key sequence appeared back-to-back |

## Example: adding a new tip

Suppose you want to detect people using `dd` on an empty line instead of `J` to join lines (different scenario — this is just an example pattern):

```typescript
// In cli/src/tips.ts, add to the TIPS array:
{
  id: 'dd_for_join',
  category: 'Editing',
  severity: 2,
  title: 'Using dd to delete lines you could join',
  detect: stats => stats.sequences['dj'] ?? 0,   // 'dj' appears when deleting then moving down
  threshold: 3,
  description:
    'If you often delete a line and then want to bring the next line up, ' +
    'J joins lines directly without the delete step.',
  before: 'dd  (deletes a line to "merge" it)',
  after: [
    'J    — join current line with the line below (removes the newline)',
    'gJ   — join without adding a space',
    '3J   — join the next 3 lines',
  ],
  keys: ['J', 'gJ'],
},
```

## Tips for writing good detectors

1. **Use `normalKeyCounts` for normal-mode keys** — `keyCounts` includes insert-mode activity which is noisier.

2. **Use `runs[key]` for repetition patterns** — this is the longest consecutive run seen, not total count. A threshold of 3–5 is usually right.

3. **Use `sequences[two_key]` for two-key patterns** — the analyzer reconstructs sequences from consecutive normal-mode entries within 2 seconds.

4. **Set threshold conservatively** — a tip should only trigger when the pattern is clearly observed, not from 1–2 coincidental occurrences. `threshold: 5` is a reasonable starting point for runs; `threshold: 3` for sequences.

5. **Keep `before` concrete** — show the actual key sequence the user is probably typing, not a description.

6. **Use arrays for `after`** — multiple alternatives let you provide tiered advice (short jump vs. long jump vs. search). Empty strings create visual separation.

## Running tests

```bash
cd cli
npm run typecheck   # catches type errors in the new tip
npm run build       # produces dist/vimprove.js
node dist/vimprove.js help   # smoke test
```

There are no automated unit tests for tip detectors yet. To test manually, either use real log data or write temporary entries into `~/.vim-improver/neovim.log`:

```bash
# Generate synthetic j-spam entries
python3 -c "
import json, time, os
entries = [json.dumps({'t': int(time.time()), 'k': 'j', 'm': 'n', 's': 'nvim'}) for _ in range(20)]
print('\n'.join(entries))
" >> ~/.vim-improver/neovim.log

node dist/vimprove.js tips --source nvim
```
