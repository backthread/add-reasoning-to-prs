// scratch.ts — the local, per-branch, multi-session scratchpad.
//
// Why-primitives banked during one session (or one commit) on a branch are persisted here
// so a LATER session — the one that opens the PR, whose model wasn't present for the
// earlier deliberation — can fold them into the PR's why-block. It accumulates across
// sessions and is READ + CLEARED at PR-create, so the block covers the whole branch.
//
// 100% LOCAL, and stores EXTRACTED WHY ONLY (never source): it lives in the config dir
// (NOT the repo — nothing to gitignore, nothing to accidentally commit), keyed by repo
// root + branch. Being per-machine, a fresh machine simply starts empty — the
// "cross-machine → current-session fallback" the design calls for. Every write is scrubbed
// (critique.scrubPrimitives) so filler and duplicates never accumulate.

import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, mkdir, rm, chmod } from 'node:fs/promises';
import { scrubPrimitives } from './critique.js';
import { isEmptyBlock, PRIMITIVES, type WhyPrimitives } from './template.js';

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/** The scratchpad directory (under the shared config dir; env-overridable for tests). */
export function scratchDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ADD_REASONING_TO_PRS_STATE_DIR;
  const base = override && override.trim().length > 0 ? override : join(homedir(), '.add-reasoning-to-prs');
  return join(base, 'scratch');
}

function scratchPath(repoRoot: string, branch: string, env: NodeJS.ProcessEnv): string {
  const key = createHash('sha256').update(`${repoRoot}\n${branch}`).digest('hex').slice(0, 32);
  return join(scratchDir(env), `${key}.json`);
}

/** Coerce loose JSON into WhyPrimitives — keep only the four known keys as string arrays. */
export function coercePrimitives(obj: unknown): WhyPrimitives {
  const out: WhyPrimitives = {};
  if (!obj || typeof obj !== 'object') return out;
  const rec = obj as Record<string, unknown>;
  for (const key of PRIMITIVES) {
    const v = rec[key];
    if (Array.isArray(v)) {
      const items = v.filter((s): s is string => typeof s === 'string');
      if (items.length) out[key] = items;
    }
  }
  return out;
}

function merge(a: WhyPrimitives, b: WhyPrimitives): WhyPrimitives {
  const out: WhyPrimitives = {};
  for (const key of PRIMITIVES) out[key] = [...(a[key] ?? []), ...(b[key] ?? [])];
  return scrubPrimitives(out); // scrub the merge → dedupe across sessions, drop filler
}

/** Read the accumulated (scrubbed) primitives for a branch. Empty object if none. */
export async function readScratch(
  repoRoot: string,
  branch: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<WhyPrimitives> {
  try {
    const raw = await readFile(scratchPath(repoRoot, branch, env), 'utf8');
    return scrubPrimitives(coercePrimitives(JSON.parse(raw)));
  } catch {
    return {};
  }
}

/** Append primitives to a branch's scratchpad (merged + scrubbed). Returns the merged
 * result. Best-effort — never throws. */
export async function appendScratch(
  repoRoot: string,
  branch: string,
  add: WhyPrimitives,
  env: NodeJS.ProcessEnv = process.env,
): Promise<WhyPrimitives> {
  const merged = merge(await readScratch(repoRoot, branch, env), add);
  try {
    const dir = scratchDir(env);
    await mkdir(dir, { recursive: true, mode: DIR_MODE });
    const path = scratchPath(repoRoot, branch, env);
    await writeFile(path, JSON.stringify(merged) + '\n', { mode: FILE_MODE });
    await chmod(path, FILE_MODE).catch(() => {});
  } catch {
    // best-effort
  }
  return merged;
}

/** Delete a branch's scratchpad (called after PR-create consumes it). Never throws. */
export async function clearScratch(
  repoRoot: string,
  branch: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  try {
    await rm(scratchPath(repoRoot, branch, env), { force: true });
  } catch {
    // best-effort
  }
}

/** True if the scratchpad has nothing worth surfacing. */
export function isScratchEmpty(p: WhyPrimitives): boolean {
  return isEmptyBlock(p);
}
