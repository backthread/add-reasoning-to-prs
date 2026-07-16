// promptState.ts — the anti-loop DENY CAP.
//
// The hook denies in order to PROMPT the model for a block, but it must deny each
// operation AT MOST ONCE: if the model concludes the session had nothing worth recording
// and re-runs the command with no block, we have to let it through rather than deny
// forever. So we remember, per (session, surface, branch), that we already prompted — and
// stand down on the next matching command for that key.
//
// LOOP-SAFE BY CONSTRUCTION. Two invariants, enforced together with runHook:
//   1. `hasPrompted` returns false ONLY for a missing state file (first run) or a clean
//      read with the key absent; ANY other read problem returns true (→ allow), so a
//      broken/torn state file degrades to "never prompt", never to a deny-loop.
//   2. runHook denies ONLY after `markPrompted` reports success. If we can't persist the
//      cap, we don't deny — so we can never deny a second time for the same operation.
//
// State lives in a small newline-delimited file (append-membership, so it can't "corrupt"
// like JSON) under ~/.add-reasoning-to-prs, overridable via ADD_REASONING_TO_PRS_STATE_DIR.

import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_KEYS = 500; // bounded ring; oldest keys fall off so the file stays tiny

export function stateDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ADD_REASONING_TO_PRS_STATE_DIR;
  return override && override.trim().length > 0 ? override : join(homedir(), '.add-reasoning-to-prs');
}

function statePath(env: NodeJS.ProcessEnv): string {
  return join(stateDir(env), 'prompted');
}

/** The cap key for one operation. Keyed on branch so distinct PRs (distinct branches) in
 * one session are each prompted; a re-run of the SAME operation shares the key. */
export function promptKey(
  sessionId: string | undefined,
  surface: string,
  branch: string | null,
): string {
  return `${sessionId ?? 'no-session'}::${surface}::${branch ?? 'no-branch'}`;
}

/**
 * True if we've already prompted for this key — or if we can't be sure. Only a missing
 * file (first run) or a clean read with the key absent returns false; a read error on an
 * existing file returns true (play safe → don't deny again).
 */
export async function hasPrompted(
  key: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  try {
    const raw = await readFile(statePath(env), 'utf8');
    return raw.split('\n').some((line) => line.trim() === key);
  } catch (e) {
    return (e as NodeJS.ErrnoException)?.code === 'ENOENT' ? false : true;
  }
}

/**
 * Record that we prompted for this key. Returns true if the cap is now persisted (either
 * newly written or already present), false if we could not persist it. Never throws.
 */
export async function markPrompted(
  key: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  try {
    const dir = stateDir(env);
    await mkdir(dir, { recursive: true, mode: DIR_MODE });
    let keys: string[] = [];
    try {
      const raw = await readFile(statePath(env), 'utf8');
      keys = raw.split('\n').map((s) => s.trim()).filter(Boolean);
    } catch {
      // no existing file (or unreadable) → start fresh
    }
    if (keys.includes(key)) return true; // already recorded
    keys.push(key);
    if (keys.length > MAX_KEYS) keys = keys.slice(keys.length - MAX_KEYS);
    const path = statePath(env);
    await writeFile(path, keys.join('\n') + '\n', { mode: FILE_MODE });
    await chmod(path, FILE_MODE).catch(() => {});
    return true;
  } catch {
    return false; // couldn't persist → runHook will NOT deny (avoids a loop)
  }
}
