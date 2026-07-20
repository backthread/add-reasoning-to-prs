#!/usr/bin/env bash
# demo.sh — the recorded narrative for assets/demo.tape (charmbracelet/vhs).
#
# Self-contained (no git, node, network, or the bundle required) so the GIF renders
# identically on any machine and in CI. It shows the BEFORE (thin) PR description, a
# one-line description of the hook firing at `gh pr create`, then the AFTER PR
# description carrying the generated "why" block.
#
# The why-block below is the REAL format from src/template.ts + src/guidance.ts:
#   - order: Decisions, Assumptions, Trade-offs, Limitations
#   - bold markdown headings, "- " bullets
#   - the visible attribution, wrapped in the invisible <!-- backthread:why --> markers
# Scenario: the real billing decision that later overcharged ~1000x. The assumption
# ("the estimate is close enough") + the "charged on every boot" limitation are
# captured right here — where a reviewer would have caught it on day one.
# Keep this in sync with those sources if the block shape changes.

set -uo pipefail

# High-contrast ANSI (256-color) — reads well on a dark VHS theme.
B=$'\e[1m'; DIM=$'\e[2m'; U=$'\e[4m'; R=$'\e[0m'
CYAN=$'\e[38;5;44m'; GREEN=$'\e[38;5;42m'; GREY=$'\e[38;5;246m'
RED=$'\e[38;5;203m'; YEL=$'\e[38;5;179m'; WHITE=$'\e[38;5;255m'
p(){ printf '%b\n' "$1"; }

clear
p "${CYAN}${B}add-reasoning-to-prs${R}  ${GREY}a Claude Code hook — writes the ${R}${WHITE}why${R}${GREY} into every PR${R}"
p ""
sleep 1.2

p "${GREY}You: \"open a PR for the billing change.\"  Your agent runs:${R}"
p "  ${WHITE}${B}\$ gh pr create --title \"update billing flow\"${R}"
sleep 1.6
p ""

# ---- BEFORE ----------------------------------------------------------------
p "${RED}${B}  BEFORE  ${R}  ${GREY}the description your reviewer would have gotten${R}"
p "${DIM}  ┌──────────────────────────────────────────────────────────${R}"
p "${DIM}  │${R} ${B}update billing flow${R}"
p "${DIM}  │${R}"
p "${DIM}  │${R} ${GREY}update billing flow${R}"
p "${DIM}  └──────────────────────────────────────────────────────────${R}"
sleep 2.6
p ""

# ---- HOOK FIRES ------------------------------------------------------------
p "${YEL}${B}  ->  add-reasoning-to-prs fires at gh pr create${R}"
sleep 0.7
p "${GREY}  It asks your agent for the why, from THIS session's real deliberation,${R}"
p "${GREY}  then the agent re-runs the command. Never fabricated. Runs locally.${R}"
sleep 2.2
p ""

# ---- AFTER -----------------------------------------------------------------
p "${GREEN}${B}  AFTER  ${R}   ${GREY}the same PR, now carrying the reasoning${R}"
p "${DIM}  ┌──────────────────────────────────────────────────────────${R}"
p "${DIM}  │${R} ${B}update billing flow${R}"
p "${DIM}  │${R}"
p "${DIM}  │${R} ${GREY}<!-- backthread:why -->${R}"
p "${DIM}  │${R} ${CYAN}${B}${U}Reasoning${R}"
p "${DIM}  │${R} ${DIM}written by the agent in-session via add-reasoning-to-prs${R}"
sleep 0.9
p "${DIM}  │${R}"
p "${DIM}  │${R} ${WHITE}${B}Decisions${R}"
p "${DIM}  │${R} - Bill each ingest by a token-free UPFRONT ESTIMATE (repo size,"
p "${DIM}  │${R}   PR count), not measured token spend. The estimate needs no trial"
p "${DIM}  │${R}   run, so we can gate and charge before spawning the container."
sleep 1.4
p "${DIM}  │${R}"
p "${DIM}  │${R} ${WHITE}${B}Assumptions${R}"
p "${DIM}  │${R} - Assumes the estimate stays CLOSE to the real cost — that any"
p "${DIM}  │${R}   over/under-charge is minor. Not yet checked against actual spend"
p "${DIM}  │${R}   on re-ingests or multi-boot jobs."
sleep 1.4
p "${DIM}  │${R}"
p "${DIM}  │${R} ${WHITE}${B}Trade-offs${R}"
p "${DIM}  │${R} - Chose rough-but-cheap estimation over exact metering for v0."
p "${DIM}  │${R}   Rejected metering real tokens (needs a trial run). Accepts that"
p "${DIM}  │${R}   some jobs are over- or under-charged."
sleep 1.4
p "${DIM}  │${R}"
p "${DIM}  │${R} ${WHITE}${B}Limitations${R}"
p "${DIM}  │${R} - The estimate is charged on EVERY container boot, so a job that"
p "${DIM}  │${R}   restarts pays it more than once. No reconciliation against"
p "${DIM}  │${R}   measured spend yet."
p "${DIM}  │${R} ${GREY}<!-- /backthread:why -->${R}"
p "${DIM}  └──────────────────────────────────────────────────────────${R}"
sleep 2.4
p ""
p "${GREEN}${B}  The why a diff can never show — written into the PR, automatically.${R}"
p "${GREY}  Free. MIT. On your own machine.  ${WHITE}npx add-reasoning-to-prs${R}"
sleep 2.6
