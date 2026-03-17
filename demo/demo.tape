Output demo/demo.gif

Set Shell "zsh"
Set FontSize 13
Set Width 860
Set Height 520
Set Theme "TokyoNight"
Set Padding 20
Set TypingSpeed 40ms
Set Framerate 16
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

# ── tips — piped through less so we can scroll ────────────────────────────────
Type "FORCE_COLOR=1 vimprove tips --since 7d | less -R"
Sleep 200ms
Enter
Sleep 2500ms

# slowly scroll down through the tips output
Down@250ms 38

Sleep 1500ms

# exit less
Type "q"
Sleep 1000ms

# ── progress ───────────────────────────────────────────────────────────────────
Type "vimprove progress"
Sleep 200ms
Enter
Sleep 4500ms
