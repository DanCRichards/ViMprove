'use strict';
// Tips database.
// Each tip has a detector (run against the analysed key sequence data)
// and advice shown in the CLI output.

// severity: 1 (minor) → 3 (high impact)

const TIPS = [
  // ── Navigation ────────────────────────────────────────────────────────────

  {
    id: 'repeated_j',
    category: 'Navigation',
    severity: 3,
    title: 'Holding j to move down many lines',
    detect: (stats) => stats.runs['j'] || 0,
    threshold: 5,
    description:
      'Tapping j many times to reach a line wastes keystrokes. Vim has faster ' +
      'vertical motions for every distance — pick the right one for how far you need to go.',
    before: 'jjjjjjjj  (8 taps to move 8 lines)',
    after: [
      '── Short jumps (2–10 lines) ─────────────────────────',
      '8j             — count + j: move exactly 8 lines',
      ':set relativenumber — shows the count for every line at a glance',
      '',
      '── Structural jumps (paragraphs / blocks) ───────────',
      '}              — next blank-line-delimited paragraph or code block',
      '{              — previous paragraph',
      ']]  ][         — next / previous section (works in code & markdown)',
      '',
      '── Large jumps (anywhere in the file) ──────────────',
      '<C-d>          — half-page down  (keeps cursor centred)',
      '<C-f>          — full page down',
      'G              — bottom of file',
      '42G  or  :42   — jump to line 42',
      '',
      '── Jump to content directly ─────────────────────────',
      '/word<CR>      — search down; n repeats',
      '*              — jump to next occurrence of word under cursor',
      '%              — jump to matching bracket / brace',
      "''             — jump back to where you last jumped from",
    ],
    keys: ['8j', '}', '{', '<C-d>', 'G', ':42', '/', '*', '%'],
  },

  {
    id: 'repeated_k',
    category: 'Navigation',
    severity: 3,
    title: 'Holding k to move up many lines',
    detect: (stats) => stats.runs['k'] || 0,
    threshold: 5,
    description:
      'Same problem as j-spam, moving up. Every technique that applies to j has an ' +
      'upward equivalent.',
    before: 'kkkkkkk  (7 taps)',
    after: [
      '7k             — count + k',
      '{              — previous paragraph',
      '<C-u>          — half-page up',
      '<C-b>          — full page up',
      'gg             — top of file',
      '?word<CR>      — search upwards; n repeats',
      '#              — previous occurrence of word under cursor',
      "''             — jump back to where you last jumped from",
    ],
    keys: ['7k', '{', '<C-u>', 'gg', '?', '#'],
  },

  {
    id: 'repeated_h',
    category: 'Navigation',
    severity: 2,
    title: 'Holding h to move left along a line',
    detect: (stats) => stats.runs['h'] || 0,
    threshold: 4,
    description:
      'h is fine for 1–2 characters. Beyond that, use word-back motions or ' +
      'character-search to land exactly where you want.',
    before: 'hhhhhh  (6 taps to move 6 chars left)',
    after: [
      '── Word-based ───────────────────────────────────────',
      'b              — back to start of previous word',
      'B              — back to start of previous WORD  (ignores punctuation)',
      'ge             — back to end of previous word',
      '',
      '── Line-based ───────────────────────────────────────',
      '0              — column 0 (absolute start of line)',
      '^              — first non-blank character on the line',
      '',
      '── Character search (most precise) ─────────────────',
      'F<char>        — jump back to <char> on the current line',
      'T<char>        — jump to just after <char> going left',
      ';  /  ,        — repeat last f/F/t/T forward / backward',
    ],
    keys: ['b', 'B', 'ge', '0', '^', 'F', 'T', ';', ','],
  },

  {
    id: 'repeated_l',
    category: 'Navigation',
    severity: 2,
    title: 'Holding l to move right along a line',
    detect: (stats) => stats.runs['l'] || 0,
    threshold: 4,
    description:
      'l is fine for 1–2 characters. For anything further, character search or word ' +
      'motions get you there in 2 keystrokes regardless of distance.',
    before: 'lllllll  (7 taps)',
    after: [
      '── Word-based ───────────────────────────────────────',
      'w              — start of next word',
      'e              — end of current / next word',
      'W  /  E        — same, but WORD (whitespace-delimited)',
      '',
      '── Line-based ───────────────────────────────────────',
      '$              — end of line',
      'g_             — last non-blank character on the line',
      '',
      '── Character search (most precise) ─────────────────',
      'f<char>        — jump to next <char> on the line',
      't<char>        — jump to just before <char>',
      ';              — repeat last f/t forward',
      ',              — repeat last f/t backward',
      '',
      '── Tip ──────────────────────────────────────────────',
      'Combine with operators: df,  ct(  etc. to edit and move in one step',
    ],
    keys: ['w', 'e', 'W', 'E', '$', 'f', 't', ';', ','],
  },

  {
    id: 'arrow_keys',
    category: 'Navigation',
    severity: 3,
    title: 'Using arrow keys',
    detect: (stats) => (stats.keyCounts['<Left>'] || 0) +
                       (stats.keyCounts['<Right>'] || 0) +
                       (stats.keyCounts['<Up>'] || 0) +
                       (stats.keyCounts['<Down>'] || 0),
    threshold: 10,
    description:
      'Arrow keys move your right hand off the home row on every press. ' +
      'hjkl keep both hands in position. The habit usually takes 1–2 weeks to stick.',
    before: '<Up><Up><Up><Right><Right>  (arrow keys)',
    after: [
      'h j k l        — left, down, up, right',
      '',
      'Force the habit by disabling arrows in your config for a week:',
      '  noremap <Left>  <Nop>',
      '  noremap <Right> <Nop>',
      '  noremap <Up>    <Nop>',
      '  noremap <Down>  <Nop>',
      '',
      'Also disable in insert mode:',
      '  inoremap <Left>  <Nop>',
      '  inoremap <Right> <Nop>',
      '  inoremap <Up>    <Nop>',
      '  inoremap <Down>  <Nop>',
    ],
    keys: ['h', 'j', 'k', 'l'],
  },

  // ── Editing ───────────────────────────────────────────────────────────────

  {
    id: 'repeated_x',
    category: 'Editing',
    severity: 3,
    title: 'Using x repeatedly to delete',
    detect: (stats) => stats.runs['x'] || 0,
    threshold: 3,
    description:
      'Using x multiple times to delete characters is tedious. Use d with a ' +
      'motion or count to delete multiple characters or words at once.',
    before: 'xxxxx  (delete 5 characters one by one)',
    after: [
      '5x          — delete 5 characters',
      'dw          — delete to end of next word',
      'diw         — delete inner word (under cursor)',
      'daw         — delete a word including surrounding space',
      'd$  or  D   — delete to end of line',
      'dt<char>    — delete up to (not including) <char>',
      'df<char>    — delete up to and including <char>',
    ],
    keys: ['5x', 'dw', 'diw', 'daw', 'D', 'dt', 'df'],
  },

  {
    id: 'd_dollar',
    category: 'Editing',
    severity: 2,
    title: 'Using d$ instead of D',
    detect: (stats) => stats.sequences['d$'] || 0,
    threshold: 3,
    description:
      'd$ deletes to end of line, which is exactly what the D shortcut does.',
    before: 'd$',
    after: ['D   — equivalent to d$, one keystroke shorter'],
    keys: ['D'],
  },

  {
    id: 'c_dollar',
    category: 'Editing',
    severity: 2,
    title: 'Using c$ instead of C',
    detect: (stats) => stats.sequences['c$'] || 0,
    threshold: 3,
    description:
      'c$ changes to end of line. C does the same in one keystroke.',
    before: 'c$',
    after: ['C   — equivalent to c$'],
    keys: ['C'],
  },

  {
    id: 'i_esc_immediately',
    category: 'Editing',
    severity: 2,
    title: 'Entering insert mode then immediately escaping',
    detect: (stats) => stats.sequences['i<Esc>'] || 0,
    threshold: 3,
    description:
      'Pressing i then immediately Esc (without inserting text) often means ' +
      'you wanted to use a normal-mode operator like r (replace), or you ' +
      'accidentally entered insert mode.',
    before: 'i<Esc>  (enter and immediately leave insert mode)',
    after: [
      'r<char>     — replace the character under cursor',
      's           — delete char and enter insert mode (substitute)',
      'If it was accidental, consider mapping jk or jj to <Esc>:',
      "  inoremap jk <Esc>",
    ],
    keys: ['r', 's'],
  },

  {
    id: 'excessive_undo',
    category: 'Editing',
    severity: 2,
    title: 'Many consecutive undos',
    detect: (stats) => stats.runs['u'] || 0,
    threshold: 5,
    description:
      'Pressing u many times might mean you are making large mistakes or not ' +
      'using undo branching. Vim has a full undo tree.',
    before: 'uuuuuuu  (7 undos)',
    after: [
      '5u          — undo 5 changes at once',
      'U           — undo all changes on the current line',
      'Ctrl-r      — redo',
      ':earlier 5m — go back 5 minutes in time',
      ':later 5m   — go forward 5 minutes',
      'Consider: undotree plugin for visual undo history',
    ],
    keys: ['5u', 'U', '<C-r>', ':earlier'],
  },

  {
    id: 'undo_redo_oscillation',
    category: 'Editing',
    severity: 2,
    title: 'Oscillating between undo and redo',
    detect: (stats) => stats.undoRedoOscillation || 0,
    threshold: 3,
    description:
      'Frequently alternating between u and Ctrl-r suggests you are not sure ' +
      'about a change. Consider using marks to save position before a risky edit.',
    before: 'u u u <C-r> u <C-r>  (back and forth)',
    after: [
      "ma          — set mark 'a' at current position",
      "`a          — jump back to mark 'a'",
      ':earlier / :later — time-travel through changes',
    ],
    keys: ['m', '`', ':earlier', ':later'],
  },

  // ── Workflow ──────────────────────────────────────────────────────────────

  {
    id: 'frequent_save',
    category: 'Workflow',
    severity: 1,
    title: 'Very frequent :w saves',
    detect: (stats) => stats.rapidSaves || 0,
    threshold: 5,
    description:
      'Saving every few seconds is often a sign of anxiety about losing work. ' +
      'Consider enabling auto-save instead.',
    before: ':w  :w  :w  (every few seconds)',
    after: [
      "Set up auto-save in NeoVim:",
      "  autocmd TextChanged,InsertLeave * silent! write",
      'Or use :set autowrite',
      'ZZ  — save and quit (faster than :wq)',
    ],
    keys: ['ZZ', ':set autowrite'],
  },

  {
    id: 'wq_vs_ZZ',
    category: 'Workflow',
    severity: 1,
    title: 'Using :wq instead of ZZ',
    detect: (stats) => stats.sequences[':wq'] || 0,
    threshold: 5,
    description:
      ':wq saves and quits but requires switching to command mode. ZZ does the ' +
      'same from normal mode in 2 keystrokes.',
    before: ':wq<CR>  (4 keystrokes)',
    after: ['ZZ  — write and quit (2 keystrokes)'],
    keys: ['ZZ'],
  },

  // ── Text Objects ──────────────────────────────────────────────────────────

  {
    id: 'missing_text_objects',
    category: 'Text Objects',
    severity: 3,
    title: 'Not using text objects',
    detect: (stats) => stats.textObjectOpportunities || 0,
    threshold: 5,
    description:
      'Text objects (iw, i", i(, etc.) let you operate on semantic units of code ' +
      'without moving the cursor first. They are one of Vim\'s most powerful features.',
    before: 'Moving to start of word, then d to end: ^dw',
    after: [
      'diw         — delete inner word (wherever cursor is)',
      'daw         — delete a word including space',
      'di"         — delete inside quotes',
      'da"         — delete quotes and content',
      'di(  di)    — delete inside parentheses',
      'dit         — delete inside HTML/XML tag',
      'ci{         — change inside curly braces',
      'Combine with any operator: d, c, y, v, =, >, <',
    ],
    keys: ['diw', 'daw', 'di"', 'ci{', 'dit'],
  },

  // ── Repeat ────────────────────────────────────────────────────────────────

  {
    id: 'not_using_dot',
    category: 'Repeat',
    severity: 3,
    title: 'Repeating the same change manually',
    detect: (stats) => stats.repeatOpportunities || 0,
    threshold: 3,
    description:
      'The . command repeats your last change. If you find yourself making the ' +
      'same edit multiple times, . can do it in one keystroke.',
    before: 'dw dw dw  (delete word 3 times)',
    after: [
      'dw..        — delete word, then repeat twice with .',
      'n.          — go to next search match, repeat change',
      'cgn         — change next match, then use . to change each subsequent match',
    ],
    keys: ['.', 'cgn'],
  },
];

module.exports = { TIPS };
