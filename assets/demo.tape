# demo.tape — charmbracelet/vhs script for the hero before/after-PR demo.
#
# Renders the animated GIF used as the README hero + social preview: an empty/thin
# PR description ("update auth flow") vs the same PR carrying the generated
# Decisions / Assumptions / Trade-offs / Limitations "why" block.
#
# Render (run from the REPO ROOT):
#     vhs assets/demo.tape          ->  writes assets/demo.gif
#
# Install vhs first:
#     brew install vhs              # macOS  (or see github.com/charmbracelet/vhs)
#
# The narrative + the exact why-block wording live in assets/demo.sh (self-contained:
# no git, node, network, or the bundle needed — so this renders identically in CI).

Output assets/demo.gif

Require bash

Set Shell bash
Set FontFamily "JetBrains Mono"
Set FontSize 20
Set Width 1180
Set Height 780
Set Padding 28
Set Margin 0
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set PlaybackSpeed 1.0

# Start on a clean screen (hidden so the setup isn't recorded).
Hide
Type "clear"
Enter
Show

Sleep 600ms

# Kick off the narrative. demo.sh clear's the screen immediately, so the launch
# command flashes only briefly; the recorded body is the pure before/after story.
Type "bash assets/demo.sh"
Enter

# demo.sh runs ~16s of paced output; hold past its end so the final frame settles.
Sleep 19s
