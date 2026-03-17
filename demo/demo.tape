Output demo/demo.gif

Set Shell "zsh"
Set FontSize 13
Set Width 920
Set Height 580
Set Theme "TokyoNight"
Set Padding 20
Set TypingSpeed 40ms
Set Framerate 24
Set CursorBlink false

# Start clean
Hide
Type "clear"
Enter
Sleep 500ms
Show

# ── session recap ──────────────────────────────────────────────────────────────
Type "vimprove session"
Sleep 200ms
Enter
Sleep 3500ms

# ── tips ───────────────────────────────────────────────────────────────────────
Type "vimprove tips --since 7d"
Sleep 200ms
Enter
Sleep 2000ms

# let the first tip sit
Sleep 3000ms

# scroll to second tip
Down@500ms 18

Sleep 3000ms

# ── progress ───────────────────────────────────────────────────────────────────
Type "vimprove progress"
Sleep 200ms
Enter
Sleep 4500ms
