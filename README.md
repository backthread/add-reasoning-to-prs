# add-reasoning-to-prs

A [Claude Code](https://docs.claude.com/en/docs/claude-code) hook that writes a
short, **forward-only "why" block** — the decisions, trade-offs, assumptions, and
limitations behind a change — into your pull request description (or your commit
message on a direct push) at the moment the PR is opened.

It captures what a diff can never show: *why* the change is the way it is, and the
risks knowingly taken. The block is composed by your own coding agent, in-session,
locally — no account, no server round-trip, nothing stored.

> **Early release.** This is a `0.x` line and Claude Code only for now. Full docs
> are on the way.

## Install

One command:

```sh
npx add-reasoning-to-prs
```

This copies the self-contained hook and registers it in your Claude Code settings
(`~/.claude/settings.json`) as a `PreToolUse` hook — no build step, no dependencies.

Or install the **Claude Code plugin** from the marketplace (recommended — it registers
the hook globally from the plugin manifest and updates with the plugin, without touching
your project settings).

## Controls

- **Turn it off for a repo:** `git config add-reasoning-to-prs.disabled true`
- **Skip a single commit/PR:** put `[skip-why]` anywhere in the command.

## How it works

When you're about to open a PR (`gh pr create`) or land a direct commit on your default
branch, the hook asks your agent to add a grounded "why" block first, wrapped in an
invisible marker so it's written once and never duplicated. Feature-branch commits defer
to the eventual PR; work spread across multiple sessions is carried forward so the PR's
block covers the whole branch. Nothing is ever fabricated — if a session didn't
deliberate, no block is added. A hook error never blocks your git command.

---

Your agent writes the "why" into every PR — locally, on your own model, free. Want the
team view — the why pushed to you and searchable across your whole codebase? See
[why.backthread.dev](https://why.backthread.dev) and [get.backthread.dev](https://get.backthread.dev).

## License

MIT
