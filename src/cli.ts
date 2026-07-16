// cli.ts — the pure `add-reasoning-to-prs` command dispatcher.
//
// Kept side-effect-free (no process.exit, no auto-run) so it can be unit-tested by
// calling `run()` directly. The thin bin entrypoint (bin/add-reasoning-to-prs.ts) maps
// its return value to a process exit code.
//
// Handles --version / --help and the `hook` subcommand (the PreToolUse handler Claude
// Code invokes). `install` lands later.

import { VERSION } from './version.js';
import { readRawStdin } from './stdin.js';
import { runHook } from './hook.js';

export function help(): string {
  return `add-reasoning-to-prs ${VERSION}

A Claude Code hook that writes a forward-only "why" block — the decisions, trade-offs,
assumptions, and limitations behind a change — into your PR description (or your commit
message on a direct push) at the moment the PR is opened.

Usage:
  add-reasoning-to-prs --version    Print the version and exit
  add-reasoning-to-prs --help       Show this help

Install into Claude Code:
  npx add-reasoning-to-prs
`;
}

/**
 * Dispatch a CLI invocation. Takes the full `process.argv` (argv[0]=node, argv[1]=bin),
 * writes any output, and resolves to the intended exit code. Async so later subcommands
 * (which read stdin / touch the filesystem) fit without changing the entrypoint.
 */
export async function run(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  const cmd = args[0];

  if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
    process.stdout.write(VERSION + '\n');
    return 0;
  }

  // The PreToolUse hook entrypoint: read the payload off stdin, print the decision JSON,
  // and ALWAYS exit 0. runHook never throws (any error → `{}` = no injection), so this
  // path can never block the user's git op.
  if (cmd === 'hook') {
    const raw = await readRawStdin();
    const out = await runHook(raw);
    process.stdout.write(JSON.stringify(out));
    return 0;
  }

  // Default (no args) and explicit help both print usage.
  process.stdout.write(help());
  return 0;
}
