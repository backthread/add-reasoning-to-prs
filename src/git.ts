// git.ts — minimal, fail-safe git queries via the git CLI.
//
// The hook needs to know whether a `git commit` is landing on the repo's DEFAULT branch
// (the direct-push surface) or a feature branch (which defers to PR-create). Every helper
// returns a benign default (null / false) on any error — a missing git, a non-repo cwd, a
// timeout — so the hook stays fail-open and never blocks the user's git op.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(execFile);

/** Run a git command in `cwd`, returning trimmed stdout or null on any failure. */
async function git(args: string[], cwd: string): Promise<string | null> {
  try {
    const { stdout } = await pexec('git', args, { cwd, timeout: 3000, windowsHide: true });
    return stdout.trim();
  } catch {
    return null;
  }
}

/** The current branch name (e.g. "main"), or null in a detached HEAD / non-repo / error. */
export async function currentBranch(cwd: string): Promise<string | null> {
  return git(['symbolic-ref', '--quiet', '--short', 'HEAD'], cwd);
}

/** The absolute repo root (git toplevel), or null on error / non-repo. Used to key the
 * per-branch scratchpad so it's scoped to this repo (and distinct across worktrees). */
export async function repoRoot(cwd: string): Promise<string | null> {
  return git(['rev-parse', '--show-toplevel'], cwd);
}

/**
 * The repo's default branch name, best-effort and OFFLINE:
 *   1. the local `origin/HEAD` symbolic ref (set by clone / `git remote set-head`), else
 *   2. null — the caller falls back to a common-name heuristic.
 * We deliberately avoid `git remote show origin` (a network round-trip) to keep the hook
 * fast and offline-safe.
 */
export async function defaultBranch(cwd: string): Promise<string | null> {
  const head = await git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], cwd);
  if (head) return head.replace(/^origin\//, '');
  return null;
}

export interface BranchInfo {
  /** The current branch name, or null (detached HEAD / non-repo / error). */
  current: string | null;
  /** Whether `current` is the repo's default branch. */
  isDefault: boolean;
}

/**
 * The current branch name AND whether it's the repo's default — resolved in one pass so
 * the caller needn't query git twice (it needs the name for the deny-cap key and the
 * default-ness for surface routing). When the remote default is unknown (no origin/HEAD),
 * fall back to the conventional names — a direct commit onto `main`/`master` is the case
 * we care about. Any error → `{ current: null, isDefault: false }` (defer / do nothing).
 */
export async function branchInfo(cwd: string): Promise<BranchInfo> {
  const current = await currentBranch(cwd);
  if (!current) return { current: null, isDefault: false };
  const def = await defaultBranch(cwd);
  const isDefault = def ? current === def : current === 'main' || current === 'master';
  return { current, isDefault };
}
