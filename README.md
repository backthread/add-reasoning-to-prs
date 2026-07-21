<div align="center">

# add-reasoning-to-prs

**Self-documenting PRs.** A [Claude Code](https://docs.claude.com/en/docs/claude-code) hook that writes the *why* — decisions, trade-offs, assumptions, limitations — into every pull request, automatically. Composed by your own agent, on your own machine.

[![npm](https://img.shields.io/npm/v/add-reasoning-to-prs.svg)](https://www.npmjs.com/package/add-reasoning-to-prs)
[![CI](https://github.com/backthread/add-reasoning-to-prs/actions/workflows/ci.yml/badge.svg)](https://github.com/backthread/add-reasoning-to-prs/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-8A63D2.svg)](https://docs.claude.com/en/docs/claude-code)

![Before and after: a PR titled "update auth flow" with an empty description, next to the same PR with a generated Decisions / Trade-offs / Assumptions / Limitations block.](assets/demo.gif)

</div>

AI writes your code. Nobody writes down *why*. Three weeks in, your git history is a
pile of decisions you technically own but never actually made — the diff says *what*
changed, `git blame` says *who*, and the reasoning is just… gone.

This is a hook that fixes that at the source: right before your agent opens a PR (or
lands a commit on your default branch), it writes a short **"why" block** — the
decisions it made, the trade-offs it weighed, what it assumed, and what it knowingly
left — straight into the description. From the actual session. Not the diff.

## Install

One command:

```sh
npx add-reasoning-to-prs
```

That copies the self-contained, zero-dependency hook to a stable location and registers
it in your Claude Code settings (`~/.claude/settings.json`) as a `PreToolUse` hook. No
build step, no account, no config.

Or install the **Claude Code plugin** from the marketplace (recommended — it registers
the hook from the plugin manifest and updates with the plugin, without touching your
project settings).

> **Requirements:** Claude Code and Node.js ≥ 22.18. Claude Code only, for now — Cursor
> and Codex are next.

## What it does

| | |
|---|---|
| **Auto "why" block at PR-create** | When your agent runs `gh pr create` (or commits to your default branch) without one, the hook asks it to write the block first, then re-run. Zero manual steps once it's installed. |
| **Forward-only — never restates the diff** | It captures what a diff *can't* show: the reasoning and the risks knowingly taken. It leads with the one point a reviewer couldn't get from the code, and never pads with "refactored X, improved Y". |
| **Local, your own subscription, no account** | The block is composed by your own agent, in-session. No server round-trip, nothing stored, and your source never leaves your machine. |
| **Never fabricates** | Every line has to trace to a real decision in the session. If the agent didn't actually deliberate, no block is added — an empty block is the correct answer for a routine change. |

## What this does **not** do

- **It's not a review bot.** It doesn't grade your code, score your PR, or gate a merge. It sits *above the diff*, alongside review — it adds context, it doesn't judge.
- **It's not a diagram, wiki, or knowledge graph.** Nothing to browse, nothing to keep in sync. Just the why, written where reviewers already look: the PR description.
- **It doesn't read or send your source anywhere.** No account, no upload, no telemetry. The block is composed on your machine by the agent you're already running, on your own model subscription.
- **It's forward-only.** It writes the why for PRs going forward. It never rewrites your closed history, and it never touches your git command if anything goes wrong — a hook error always fails open.

**Free and MIT, for good.** [Backthread](https://backthread.dev) — the paid hosted layer
— does the cross-team, historical, and proactive-push parts a local hook structurally
can't: the why pushed to you, searchable across your whole codebase, across everyone's
agents. This hook needs none of that to be useful on its own. If you ever want the team
view, it's at [backthread.dev](https://backthread.dev).

## How it works

The hook watches for two moments: opening a PR (`gh pr create`) and landing a direct
commit on your default branch. When it sees one without a why-block, it asks your agent
to compose a grounded, forward-only block from its own session reasoning — the
**Decisions, Trade-offs, Assumptions, and Limitations** behind the change — and re-run
the command. The block is wrapped in an invisible marker, so it's written once and never
duplicated.

- **Feature-branch commits defer to the PR.** Work spread across several sessions is
  carried forward locally, so the PR's block covers the whole branch — even if a
  different session opens it.
- **Nothing is ever invented.** The agent runs a quick self-check first and drops any
  line it can't trace to a real decision; if the session didn't deliberate, no block is
  added.
- **It never blocks your git command.** Every failure mode is a silent no-op — worst
  case, no block gets added.

Each block carries a small visible attribution so reviewers can see where it came from —
and you can edit or delete it freely.

## Controls

- **Turn it off for a repo:** `git config add-reasoning-to-prs.disabled true`
- **Skip a single commit/PR:** put `[skip-why]` anywhere in the command.
- **Turn it off globally:** set `ADD_REASONING_TO_PRS_DISABLE=1` in the environment you
  launch Claude Code with.

## Roadmap

The honest state of the project — what works, what's next, and what it doesn't do yet.

- **Working today:** the "why" block at `gh pr create`, the direct-push commit-message
  fallback, multi-session carry-forward across a branch, 100% local (your own model, no
  account), never-fabricate, and fail-open.
- **Next:** Cursor and Codex support (Claude Code only for now — this is the top of the
  list) · coverage for PRs opened in the browser · a tighter why-block format.
- **Known gaps:** multi-session gather is best-effort (a local per-branch scratchpad),
  and how the block reads after a squash-merge is still being refined.

The full list lives in [Issues](../../issues) and [Discussions](../../discussions) —
👍 the limits that matter to you and they move up the list.

## Contributing

Contributions are welcome — especially bug fixes, sharper prompt/guidance copy,
edge-case coverage, and support for more agents. It's a small, single-purpose tool and
means to stay that way, so scope-broadening requests are usually declined (kindly, with
a reason). Start with the [contributing guide](CONTRIBUTING.md) and the
[`good first issue`](../../labels/good%20first%20issue) label; if you're unsure whether
an idea fits, open a [Discussion](../../discussions) first.

## Star it

If this saves you one archaeological dig back through your own PRs, a ⭐ helps other
people find it.

## License

MIT © [Backthread](https://backthread.dev). Do whatever you want with it.
