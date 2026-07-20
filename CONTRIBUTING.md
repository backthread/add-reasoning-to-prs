# Contributing

Thanks for looking at `add-reasoning-to-prs`. It's a small, single-purpose tool
and it intends to stay that way — so the most useful contributions are bug fixes,
sharper guidance/prompt copy, edge-case coverage, and support for more agents. This
guide covers how to build it, the constraints that keep it trustworthy, and how to
propose a change.

Everyone taking part is expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## What this project is (and isn't)

It's a [Claude Code](https://docs.claude.com/en/docs/claude-code) hook that writes a
forward-only **"why" block** — decisions, trade-offs, assumptions, limitations — into
your PR description (or your commit message on a direct push). It runs locally, composes
the block with your own in-session agent, and never fabricates.

It is **not** a review bot, a diagram/wiki, or a linter, and it won't grow into one.
Feature requests that broaden the scope past "write the why into PRs" will usually be
declined — kindly, and with an explanation. If you're unsure whether an idea fits, open
a Discussion before you write code.

## The non-negotiable constraints

These aren't style preferences — they're the trust posture the whole thing rests on. A
PR that breaks one of these will be asked to change before review can go further:

- **Local-only, no network.** The hook makes **zero network calls** and has **zero
  runtime dependencies** (only Node built-ins). It never reads or transmits your source.
  A PR that adds a runtime dependency, an HTTP call, telemetry, or analytics will be
  declined. If you think you genuinely need one, open an issue first and make the case.
- **Fail-open, always.** The hook must **never** block or delay the user's git command.
  Every failure path resolves to "do nothing and let the command proceed." No throw
  reaches the user; nothing exits non-zero to abort a commit or a PR.
- **Never fabricate.** If a session didn't deliberate, no block is written. Changes to
  the guidance/critique must keep it honest — empty is a correct, expected outcome.
- **Idempotent + no double-prompting.** A block is written once (invisible marker), and
  the same operation is never denied twice.

## Development setup

Requirements: **Node ≥ 22.18** and `git`. No other toolchain.

```sh
git clone https://github.com/backthread/add-reasoning-to-prs
cd add-reasoning-to-prs
npm ci
```

Common tasks:

```sh
npm test         # unit suite + build + smoke test
npm run typecheck # tsc, no emit (src + tests)
npm run e2e      # end-to-end hook exercise (scripts/e2e.sh)
npm run bundle   # rebuild the self-contained dist-bundle
```

### The committed bundle

The published binary is the self-contained esbuild bundle at
`dist-bundle/add-reasoning-to-prs.js`, and it is **committed to git** (Claude Code runs
no build step when it installs the plugin, so the bundle has to be tracked). CI fails if
the committed bundle drifts from a fresh build.

**So: if you change anything under `src/`, run `npm run bundle` and commit the updated
`dist-bundle/add-reasoning-to-prs.js` in the same PR.** `npm test` rebuilds it for you;
just remember to stage it.

## Making a change

1. **For anything non-trivial, open an issue or a Discussion first** — it saves you from
   building something that doesn't fit the scope above. Small, obvious fixes can go
   straight to a PR.
2. Branch from `main`.
3. Keep the change focused and small. One concern per PR.
4. **Add or update tests** for any behavior change — the suite is `src/*.test.ts` and it's
   fast. Bug fixes should come with a test that would have caught the bug.
5. Run `npm test` and `npm run typecheck` locally; both must be green (CI runs them too).
6. If you touched `src/`, rebuild and commit the bundle (above).
7. Open the PR with a clear description of *what* changed and *why*. (Yes — the why. It's
   the whole point.)

Look for the **`good first issue`** and **`help wanted`** labels if you'd like somewhere
to start.

## Reporting bugs

Open an issue with: your OS, Node version, Claude Code version, the git/`gh` command that
triggered it (or didn't), and what you expected vs. what happened. Because the hook is
fail-open, "it silently did nothing" is a legitimate and useful bug report.

For anything security-sensitive, follow [SECURITY.md](./SECURITY.md) instead of opening a
public issue.

## Style

TypeScript, ES modules, Node built-ins only. Match the surrounding code — small pure
functions, explanatory header comments on each module, defensive/fail-open error handling.
No formatter config is enforced; keep diffs clean and readable.

## Licensing

By contributing, you agree that your contributions are licensed under the project's
[MIT License](./LICENSE).
