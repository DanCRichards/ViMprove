import type { Tip } from './types.js';

export const TIPS: Tip[] = [

  // ── Navigation ───────────────────────────────────────────────────────────────

  {
    id: 'repeated_j',
    category: 'Navigation',
    severity: 3,
    title: 'Holding j to move down many lines',
    detect: stats => stats.runs['j'] ?? 0,
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
    detect: stats => stats.runs['k'] ?? 0,
    threshold: 5,
    description:
      'Same problem as j-spam, moving up. Every technique that applies to j has an upward equivalent.',
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
    detect: stats => stats.runs['h'] ?? 0,
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
    detect: stats => stats.runs['l'] ?? 0,
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
    detect: stats =>
      (stats.keyCounts['<Left>']  ?? 0) + (stats.keyCounts['<Right>'] ?? 0) +
      (stats.keyCounts['<Up>']    ?? 0) + (stats.keyCounts['<Down>']  ?? 0),
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

  {
    id: 'not_using_star_hash',
    category: 'Navigation',
    severity: 2,
    title: 'Not searching word under cursor with * or #',
    detect: stats => {
      if (stats.totalKeystrokes < 300) return 0;
      if (stats.starHashUsage >= 10) return 0;
      // Score increases with data size — more evidence that it's genuinely unused
      return Math.floor(stats.totalKeystrokes / 50);
    },
    threshold: 6,
    description:
      '* jumps to the next occurrence of the word under the cursor. # goes backwards. ' +
      'These are the fastest way to find all uses of a variable or function name without typing the search.',
    before: '/functionName<CR>  (type the name you can already see)',
    after: [
      '*         — jump to next occurrence of word under cursor',
      '#         — jump to previous occurrence',
      'n / N     — continue forward / backward through matches',
      '',
      'Combined with the . repeat:',
      '  *        — find all uses',
      '  cw       — change the word',
      '  n.n.n.   — repeat the change at each match',
      '',
      'Or use cgn for a tighter loop:',
      '  *        — find first match',
      '  cgn      — change next match',
      '  .        — repeat change at each subsequent match',
    ],
    keys: ['*', '#', 'n', 'N', 'cgn'],
  },

  {
    id: 'not_using_jump_list',
    category: 'Navigation',
    severity: 2,
    title: 'Not using the jump list (<C-o> / <C-i>)',
    detect: stats => {
      if (stats.totalKeystrokes < 300) return 0;
      if (stats.jumpListUsage >= 10) return 0;
      return Math.floor(stats.totalKeystrokes / 60);
    },
    threshold: 5,
    description:
      'Every time you jump (/, *, G, gg, %, :line) Vim records the position. ' +
      '<C-o> steps back through that history and <C-i> steps forward. ' +
      'This beats marking and jumping to marks for most navigation.',
    before: 'ma  ...navigate...  `a  (manually set and return to mark)',
    after: [
      '<C-o>     — jump back to previous position (repeatable)',
      '<C-i>     — jump forward again',
      ':jumps    — see the full jump list',
      '',
      'The jump list is populated by:  / ? * # G gg % :N nN { }',
      'Any of those navigations becomes a <C-o> checkpoint automatically.',
    ],
    keys: ['<C-o>', '<C-i>'],
  },

  {
    id: 'not_using_percent',
    category: 'Navigation',
    severity: 1,
    title: 'Not using % for bracket matching',
    detect: stats => {
      if (stats.totalKeystrokes < 300) return 0;
      if (stats.percentUsage >= 5) return 0;
      return Math.floor(stats.totalKeystrokes / 100);
    },
    threshold: 3,
    description:
      '% jumps between matching brackets, braces, and parentheses. ' +
      'It also works on HTML tags and language keywords like if/end, do/end with the matchit plugin.',
    before: 'Scrolling or searching to find the matching bracket',
    after: [
      '%         — jump to matching (, ), {, }, [, ]',
      'd%        — delete everything up to and including the matching bracket',
      'v%        — visually select to the matching bracket',
      '',
      'Enable extended matching (if/end, def/end, etc.):',
      '  :packadd matchit   (built in to Vim/NeoVim, just needs enabling)',
    ],
    keys: ['%', 'v%', 'd%'],
  },

  // ── Editing ──────────────────────────────────────────────────────────────────

  {
    id: 'repeated_x',
    category: 'Editing',
    severity: 3,
    title: 'Using x repeatedly to delete',
    detect: stats => stats.runs['x'] ?? 0,
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
    detect: stats => stats.sequences['d$'] ?? 0,
    threshold: 3,
    description: 'd$ deletes to end of line, which is exactly what the D shortcut does.',
    before: 'd$',
    after: ['D   — equivalent to d$, one keystroke shorter'],
    keys: ['D'],
  },

  {
    id: 'c_dollar',
    category: 'Editing',
    severity: 2,
    title: 'Using c$ instead of C',
    detect: stats => stats.sequences['c$'] ?? 0,
    threshold: 3,
    description: 'c$ changes to end of line. C does the same in one keystroke.',
    before: 'c$',
    after: ['C   — equivalent to c$'],
    keys: ['C'],
  },

  {
    id: 'i_esc_immediately',
    category: 'Editing',
    severity: 2,
    title: 'Entering insert mode then immediately escaping',
    detect: stats => stats.sequences['i<Esc>'] ?? 0,
    threshold: 3,
    description:
      'Pressing i then immediately Esc often means you wanted to use a normal-mode ' +
      'operator like r (replace), or you accidentally entered insert mode.',
    before: 'i<Esc>  (enter and immediately leave insert mode)',
    after: [
      'r<char>     — replace the character under cursor',
      's           — delete char and enter insert mode (substitute)',
      "If accidental, map jk or jj to <Esc>:",
      "  inoremap jk <Esc>",
    ],
    keys: ['r', 's'],
  },

  {
    id: 'excessive_undo',
    category: 'Editing',
    severity: 2,
    title: 'Many consecutive undos',
    detect: stats => stats.runs['u'] ?? 0,
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
    ],
    keys: ['5u', 'U', '<C-r>', ':earlier'],
  },

  {
    id: 'undo_redo_oscillation',
    category: 'Editing',
    severity: 2,
    title: 'Oscillating between undo and redo',
    detect: stats => stats.undoRedoOscillation,
    threshold: 3,
    description:
      'Frequently alternating between u and Ctrl-r suggests uncertainty about a change. ' +
      'Use marks to save position before a risky edit.',
    before: 'u u u <C-r> u <C-r>  (back and forth)',
    after: [
      "ma          — set mark 'a' at current position",
      "`a          — jump back to mark 'a'",
      ':earlier / :later — time-travel through changes',
    ],
    keys: ['m', '`', ':earlier', ':later'],
  },

  {
    id: 'end_of_line_insert',
    category: 'Editing',
    severity: 2,
    title: 'Using $a or 0i instead of A or I',
    detect: stats => stats.endOfLineInsertPattern,
    threshold: 3,
    description:
      'Moving to end/start of line then entering insert mode is two steps. ' +
      'A appends at end of line and I inserts at first non-blank — both in one keystroke.',
    before: '$a  (move to end, then append)  /  0i  (move to start, then insert)',
    after: [
      'A         — append at end of line (equivalent to $a)',
      'I         — insert at first non-blank of line (equivalent to ^i)',
      'o         — open a new line below and enter insert mode',
      'O         — open a new line above and enter insert mode',
      '',
      'Similarly, ddO replaces a line — use S (substitute line) instead:',
      'S         — delete line content and enter insert mode',
      'cc        — same as S',
    ],
    keys: ['A', 'I', 'o', 'O', 'S'],
  },

  {
    id: 'indentation_spam',
    category: 'Editing',
    severity: 2,
    title: 'Indenting with repeated > or <',
    detect: stats => stats.indentRuns,
    threshold: 3,
    description:
      'Pressing > or < repeatedly to indent/dedent multiple levels is slow. ' +
      'The = operator auto-indents using your language rules, and > accepts counts and motions.',
    before: '>>>  (indent 3 levels with 3 keypresses)',
    after: [
      '3>         — indent 3 levels at once',
      '==         — auto-indent current line (respects your language rules)',
      '=ip        — auto-indent inner paragraph (code block)',
      '=ap        — auto-indent a paragraph including surrounding blank lines',
      'gg=G       — auto-indent the entire file',
      '',
      'In visual mode: select lines, then > or < to indent / dedent the selection',
      'Visual + = to auto-indent the selection',
    ],
    keys: ['3>', '==', '=ip', 'gg=G'],
  },

  {
    id: 'cgn_workflow',
    category: 'Editing',
    severity: 2,
    title: 'Using n+c repeatedly instead of cgn + .',
    detect: stats => stats.cgnOpportunities,
    threshold: 3,
    description:
      'When you need to change multiple occurrences of the same pattern, ' +
      'cgn (change next match) + . repeat is the most efficient workflow in Vim.',
    before: 'n  cw  new<Esc>  n  cw  new<Esc>  n  cw  new<Esc>  (repeat manually)',
    after: [
      '*          — jump to first occurrence of word under cursor',
      'cgn        — change next match (enters insert mode)',
      'new<Esc>   — type replacement, exit insert',
      '.          — repeat change at next match',
      '.          — repeat again — continue with n. if you want to skip some',
      '',
      'Or for all occurrences at once:',
      ':%s/old/new/g    — substitute throughout the file',
      ':%s/old/new/gc   — substitute with confirmation at each match',
    ],
    keys: ['cgn', '.', ':%s'],
  },

  {
    id: 'moving_lines',
    category: 'Editing',
    severity: 1,
    title: 'Moving lines with dd + p instead of :m',
    detect: stats => stats.ddMovePattern,
    threshold: 3,
    description:
      'Cutting a line with dd and pasting it elsewhere works but leaves the ' +
      'clipboard occupied. :m moves a line in place without touching registers.',
    before: 'dd  ...navigate to target...  p  (cut, move, paste)',
    after: [
      ':m+1       — move current line one line down',
      ':m-2       — move current line one line up',
      ':m 42      — move current line to after line 42',
      '',
      'In visual mode, select multiple lines then:',
      ":'>+1      — move selection one line down",
      ":'<-2      — move selection one line up",
      '',
      'Many people map these for convenience:',
      '  nnoremap <A-j> :m+1<CR>==',
      '  nnoremap <A-k> :m-2<CR>==',
    ],
    keys: [':m', ':m+1', ':m-2'],
  },

  // ── Workflow ─────────────────────────────────────────────────────────────────

  {
    id: 'frequent_save',
    category: 'Workflow',
    severity: 1,
    title: 'Very frequent :w saves',
    detect: stats => stats.rapidSaves,
    threshold: 5,
    description:
      'Saving every few seconds often signals anxiety about losing work. ' +
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
    detect: stats => stats.sequences[':wq'] ?? 0,
    threshold: 5,
    description:
      ':wq saves and quits but requires switching to command mode. ZZ does the ' +
      'same from normal mode in 2 keystrokes.',
    before: ':wq<CR>  (4 keystrokes)',
    after: ['ZZ  — write and quit (2 keystrokes)'],
    keys: ['ZZ'],
  },

  {
    id: 'not_using_macros',
    category: 'Workflow',
    severity: 3,
    title: 'Never using macros (q / @)',
    detect: stats => {
      if (stats.totalKeystrokes < 1000) return 0;
      if (stats.macroRecordCount >= 5) return 0;
      return Math.floor(stats.totalKeystrokes / 200);
    },
    threshold: 5,
    description:
      'Macros record any sequence of keystrokes and replay them with a single command. ' +
      'They are one of the highest-leverage features in Vim — one macro can replace thousands of manual edits.',
    before: 'Manually repeating the same multi-step edit on every line',
    after: [
      'qa         — start recording into register a',
      '...        — perform your sequence of edits',
      'q          — stop recording',
      '@a         — replay the macro',
      '@@         — replay the last used macro',
      '50@a       — replay 50 times',
      '',
      'Combined with a search:',
      '  /pattern  — find first line to change',
      '  qa        — start macro',
      '  ...       — make the change',
      '  n         — move to next match (inside the macro)',
      '  q         — stop',
      '  @a        — replay until done',
      '',
      ':g/pattern/norm @a  — apply macro to every matching line',
    ],
    keys: ['q', '@', '@@', ':g'],
  },

  {
    id: 'missing_splits',
    category: 'Workflow',
    severity: 1,
    title: 'Not using splits for multi-file work',
    detect: stats => {
      const eCount = stats.sequences[':e'] ?? 0;
      if (eCount < 5) return 0;
      if (stats.splitUsage >= 5) return 0;
      return eCount;
    },
    threshold: 5,
    description:
      'Repeatedly using :e to switch between files means you lose context each time. ' +
      'Splits let you view and edit multiple files simultaneously.',
    before: ':e other.js  ...  :e original.js  (switching back and forth)',
    after: [
      '<C-w>s     — split horizontally (same file)',
      '<C-w>v     — split vertically',
      ':sp file   — split and open file',
      ':vsp file  — vertical split and open file',
      '',
      'Navigate splits:',
      '  <C-w>h/j/k/l   — move between splits',
      '  <C-w>w         — cycle through splits',
      '',
      'Useful config:',
      '  nnoremap <leader>v :vsp<CR>',
      '  nnoremap <leader>s :sp<CR>',
    ],
    keys: ['<C-w>v', '<C-w>s', ':vsp', ':sp'],
  },

  // ── Text Objects ──────────────────────────────────────────────────────────────

  {
    id: 'missing_text_objects',
    category: 'Text Objects',
    severity: 3,
    title: 'Not using text objects',
    detect: stats => stats.textObjectOpportunities,
    threshold: 5,
    description:
      "Text objects (iw, i\", i(, etc.) let you operate on semantic units of code " +
      "without moving the cursor first. They are one of Vim's most powerful features.",
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

  // ── Repeat ────────────────────────────────────────────────────────────────────

  {
    id: 'not_using_dot',
    category: 'Repeat',
    severity: 3,
    title: 'Repeating the same change manually',
    detect: stats => stats.repeatOpportunities,
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
