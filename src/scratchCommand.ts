// scratchCommand.ts — the `scratch` CLI: bank / show / clear the per-branch scratchpad.
//
//   add-reasoning-to-prs scratch add --json '{"decisions":["..."],"tradeoffs":["..."]}'
//   add-reasoning-to-prs scratch show
//   add-reasoning-to-prs scratch clear
//
// `add` also accepts the JSON on stdin. Everything is best-effort: outside a git repo, or
// on bad input, it prints a note and exits 0 — banking a decision must never fail a flow.

import { repoRoot, currentBranch } from './git.js';
import { appendScratch, readScratch, clearScratch, coercePrimitives } from './scratch.js';
import { readRawStdin } from './stdin.js';

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  const prefix = `${name}=`;
  const eq = args.find((a) => a.startsWith(prefix));
  return eq ? eq.slice(prefix.length) : undefined;
}

export async function runScratch(args: string[]): Promise<number> {
  const sub = args[0];
  const cwd = process.cwd();
  const [root, branch] = await Promise.all([repoRoot(cwd), currentBranch(cwd)]);

  if (sub === 'add') {
    if (!root || !branch) {
      process.stderr.write('add-reasoning-to-prs: not in a git repo (or detached HEAD) — nothing banked.\n');
      return 0;
    }
    const raw = getFlag(args, '--json') ?? (await readRawStdin());
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      process.stderr.write(
        'add-reasoning-to-prs: scratch add expects JSON — --json \'{"decisions":["..."]}\' or piped on stdin.\n',
      );
      return 0;
    }
    const merged = await appendScratch(root, branch, coercePrimitives(parsed));
    process.stdout.write(JSON.stringify(merged) + '\n');
    return 0;
  }

  if (sub === 'show') {
    const scratch = root && branch ? await readScratch(root, branch) : {};
    process.stdout.write(JSON.stringify(scratch) + '\n');
    return 0;
  }

  if (sub === 'clear') {
    if (root && branch) await clearScratch(root, branch);
    process.stdout.write('cleared\n');
    return 0;
  }

  process.stderr.write('usage: add-reasoning-to-prs scratch <add|show|clear>\n');
  return 0;
}
