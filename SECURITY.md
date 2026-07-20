# Security

`add-reasoning-to-prs` is designed so there's very little attack surface to worry
about: it runs entirely on your machine, has no account, no server, and no network
access of its own. This document says exactly what it does with your data and how to
report a problem.

## The short version

- **It runs 100% locally.** There is no Backthread account, no server round-trip, no
  API key of ours. Nothing about your repo is sent to us or to anyone else.
- **It makes zero network calls.** The hook has **no runtime dependencies** — it's pure
  Node standard library. It is deliberately offline (it doesn't even run `git remote show
  origin`), so there is nothing to phone home *to*.
- **No telemetry, no analytics.** It doesn't count installs, report usage, or emit
  events. There is no tracking of any kind.
- **It never reads or transmits your source code.** The "why" block is composed by *your
  own* Claude Code agent, in-session, on your own model subscription. This tool's own job
  is small: inspect the git command about to run, ask git a couple of read-only questions
  (which branch, is it the default), and inject text guidance for the agent. Your source
  never passes through it.

## What it stores, and where

Everything it writes stays on your machine, in your home directory, with restrictive
permissions (directories `0700`, files `0600`):

| Path | What | Notes |
|---|---|---|
| `~/.add-reasoning-to-prs/scratch/*.json` | A per-branch scratchpad of the **extracted "why" only** (decisions/trade-offs/assumptions/limitations), so a later session that opens the PR can fold in an earlier session's reasoning. | **Never contains source.** Scrubbed on write; **read and cleared** at PR-create. Lives in your config dir, not the repo — nothing to accidentally commit. |
| `~/.add-reasoning-to-prs/prompted` | A small dedup/anti-loop record (which prompts have already fired). | No repo content. |
| `~/.claude/settings.json` | On install, the hook registration is merged in (a `PreToolUse` entry pointing at the bundled hook). | Standard Claude Code hook config. |

The installer also copies the self-contained hook bundle to a stable path under
`~/.add-reasoning-to-prs/`. It shells out only to `git` (read-only queries) — it does not
run your `gh` commands itself; it only inspects the command string Claude Code is about to
run.

*(Paths under `~/.add-reasoning-to-prs/` can be relocated via an environment override; the
defaults above are what a normal install uses.)*

## Reporting a vulnerability

Please report security issues **privately** — do not open a public GitHub issue for a
suspected vulnerability.

1. **Preferred:** use GitHub's private vulnerability reporting on this repository —
   **Security → Report a vulnerability** (GitHub → Advisories). This keeps the report
   confidential until a fix is out.
2. **Or email:** security@backthread.dev

Please include the version (`npx add-reasoning-to-prs --version`), your OS and Node
version, and steps to reproduce. We aim to acknowledge a report within a few business
days and to keep you updated as we work on a fix. Responsible disclosure is appreciated,
and we're happy to credit you when the fix ships (or to keep you anonymous — your call).

## Supported versions

This is a young project on a fast-moving line; security fixes land on the **latest
released version**. Please upgrade (`npx add-reasoning-to-prs`, or update the Claude Code
plugin) before reporting, in case the issue is already fixed.
