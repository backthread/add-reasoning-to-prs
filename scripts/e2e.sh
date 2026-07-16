#!/usr/bin/env bash
# e2e.sh — end-to-end dogfood validation of the BUILT BUNDLE.
#
# Drives dist-bundle/add-reasoning-to-prs.js through every path a real Claude Code
# session would exercise, against a throwaway git repo, feeding the hook the same
# PreToolUse/Bash payloads Claude Code sends. Asserts the decision for each and — the
# load-bearing safety property — that the hook ALWAYS exits 0 (never hard-blocks a git op).
#
# The hook denies each operation AT MOST ONCE per session (the anti-loop cap), so each
# scenario runs the hook ONCE and asserts on the captured output.
#
# Run: npm run e2e   (builds the bundle first, then this).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$ROOT/dist-bundle/add-reasoning-to-prs.js"
[ -f "$BUNDLE" ] || { echo "bundle missing — run 'npm run bundle' first"; exit 1; }

WORK="$(mktemp -d)"
REPO="$WORK/repo"
export ADD_REASONING_TO_PRS_STATE_DIR="$WORK/state"
trap 'rm -rf "$WORK"' EXIT

git init -q -b main "$REPO"
git -C "$REPO" config user.email e2e@example.com
git -C "$REPO" config user.name e2e
git -C "$REPO" commit -q --allow-empty -m init

pass=0; fail=0
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s — %s\n' "$1" "$2"; fail=$((fail+1)); }
check(){ [ "$2" = "$3" ] && ok "$1" || bad "$1" "got '$2', want '$3'"; }

# Build a PreToolUse/Bash payload (JSON-safe via node).
payload(){ node -e 'const c=process.argv[1],w=process.argv[2],s=process.argv[3];process.stdout.write(JSON.stringify({tool_name:"Bash",tool_input:{command:c},cwd:w,session_id:s}))' "$1" "$REPO" "$2"; }
# Run the hook ONCE on a payload; prints its raw JSON output (and its exit code to fd path).
runhook(){ printf '%s' "$1" | node "$BUNDLE" hook; }
# Assert a node expression over a CAPTURED output string `j` / hookSpecificOutput `h`.
jget(){ printf '%s' "$1" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')||'{}');const h=j.hookSpecificOutput||{};process.stdout.write(String($2))"; }
decision(){ jget "$1" 'h.permissionDecision||(h.additionalContext?"context":"noop")'; }

echo "== add-reasoning-to-prs E2E =="

# 1. PR path — gh pr create on a feature branch, no block → deny with PR-body guidance.
git -C "$REPO" checkout -q -b feat/e2e
OUT="$(runhook "$(payload 'gh pr create --title "Add widget"' s-pr)")"
check "PR create denies (asks for a block)"        "$(decision "$OUT")" deny
check "  PR guidance targets the PR description"   "$(jget "$OUT" '/pull request description/i.test(h.permissionDecisionReason||"")')" true
check "  additionalContext present + == reason"    "$(jget "$OUT" 'String(!!h.additionalContext && h.additionalContext===h.permissionDecisionReason)')" true

# 2. Idempotent re-run — a block is already present → no-op.
OUT="$(runhook "$(payload 'gh pr create --title "Add widget" --body "done <!-- backthread:why --> x <!-- /backthread:why -->"' s-pr2)")"
check "PR with a block already present is a no-op"  "$(decision "$OUT")" noop

# 3. Direct-push path — commit on the default branch → deny with commit-message guidance.
git -C "$REPO" checkout -q main
OUT="$(runhook "$(payload 'git commit -m "hotfix"' s-commit)")"
check "commit on default branch denies"            "$(decision "$OUT")" deny
check "  commit guidance targets the message body" "$(jget "$OUT" '/commit message body/i.test(h.permissionDecisionReason||"")')" true

# 4. Feature-branch commit never denies (defers to PR-create).
git -C "$REPO" checkout -q feat/e2e
OUT="$(runhook "$(payload 'git commit -m "wip"' s-feat)")"
check "feature-branch commit never denies"         "$(jget "$OUT" 'String(h.permissionDecision!=="deny")')" true

# 5. Empty-case / anti-loop cap — a second identical PR-create in the same session is NOT
#    re-denied (the no-decision retry can't loop; nothing is written).
git -C "$REPO" checkout -q -b feat/cap
P="$(payload 'gh pr create --title "Cap"' s-cap)"
check "first prompt denies"                        "$(decision "$(runhook "$P")")" deny
check "second (empty retry) is capped → no-op"     "$(decision "$(runhook "$P")")" noop

# 6. Per-invocation skip — a [skip-why] token opts out.
OUT="$(runhook "$(payload 'gh pr create --title "Skip" --body "later [skip-why]"' s-skip)")"
check "[skip-why] token → no-op"                   "$(decision "$OUT")" noop

# 7. Per-repo off switch — git config disables the hook.
git -C "$REPO" config add-reasoning-to-prs.disabled true
OUT="$(runhook "$(payload 'gh pr create --title "Off"' s-off)")"
check "repo disabled → no-op"                      "$(decision "$OUT")" noop
git -C "$REPO" config --unset add-reasoning-to-prs.disabled

# 8. Multi-session scratchpad — bank in one "session", surface + clear at PR-create.
git -C "$REPO" checkout -q -b feat/multi
( cd "$REPO" && node "$BUNDLE" scratch add --json '{"decisions":["Chose polling; vendor has no webhook API"]}' >/dev/null )
OUT="$(runhook "$(payload 'gh pr create --title "Multi"' s-multiB)")"
check "PR-create folds the banked decision in"     "$(jget "$OUT" '/Chose polling; vendor has no webhook API/.test(h.permissionDecisionReason||"")')" true
check "  scratchpad cleared after PR-create"       "$( cd "$REPO" && node "$BUNDLE" scratch show )" '{}'

# 9. Fail-open — garbage / non-matching input is a clean no-op, and the hook ALWAYS exits 0.
check "garbage stdin → no-op"                      "$(printf 'not json' | node "$BUNDLE" hook)" '{}'
check "non-matching command → no-op"               "$(runhook "$(payload 'git push origin main' s-push)")" '{}'
printf 'not json' | node "$BUNDLE" hook >/dev/null 2>&1; check "  hook exits 0 on garbage (never hard-blocks)" "$?" 0
runhook "$(payload 'git commit -m x' s-exit)" >/dev/null 2>&1; check "  hook exits 0 even when denying" "$?" 0

echo ""
echo "== $pass passed, $fail failed =="
[ "$fail" -eq 0 ]
