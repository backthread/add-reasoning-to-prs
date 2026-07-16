// repoConfig.ts — the trigger controls: a per-repo OFF switch and a per-invocation SKIP.
//
// Installing the hook is the opt-in (auto-on once installed), so these are the escape
// hatches:
//   • OFF (per repo, sticky):  `git config add-reasoning-to-prs.disabled true`
//                              or ADD_REASONING_TO_PRS_DISABLE=1 (global, via the env).
//   • SKIP (one command):      include the token [skip-why] anywhere in the command
//                              (e.g. in the commit message, PR body, or a trailing
//                              `# [skip-why]`), or set ADD_REASONING_TO_PRS_SKIP=1.
//
// Note on the env flags: a hook runs in the environment Claude Code launched with, so
// these env vars work as a session/global toggle (set them before starting Claude Code).
// They are NOT read from a `VAR=… git commit` prefix on the command — that prefix scopes
// to the git process, not this hook. The in-command [skip-why] token is the true
// per-invocation escape hatch.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pexec = promisify(execFile);

/** The per-invocation skip token to drop into a command to opt out just this once. */
export const SKIP_TOKEN = '[skip-why]';

function envTrue(v: string | undefined): boolean {
  if (typeof v !== 'string') return false;
  const s = v.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

/** True if the hook is disabled for this repo (git config) or globally (env var). */
export async function isDisabled(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (envTrue(env.ADD_REASONING_TO_PRS_DISABLE)) return true;
  try {
    const { stdout } = await pexec(
      'git',
      ['config', '--get', 'add-reasoning-to-prs.disabled'],
      { cwd, timeout: 3000, windowsHide: true },
    );
    return envTrue(stdout);
  } catch {
    // git exits non-zero when the key is unset (and on any error) → not disabled.
    return false;
  }
}

/** True if THIS command opts out — the skip token is present, or the env flag is set. */
export function isSkipped(command: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (envTrue(env.ADD_REASONING_TO_PRS_SKIP)) return true;
  return typeof command === 'string' && command.includes(SKIP_TOKEN);
}
