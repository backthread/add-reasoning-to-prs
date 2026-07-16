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

```sh
npx add-reasoning-to-prs
```

## License

MIT
