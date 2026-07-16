// hook.ts — the PreToolUse/Bash hook orchestrator.
//
// Claude Code runs this synchronously BEFORE a Bash tool call and reads its stdout for a
// decision. When the command is a `git commit` (on the default branch) or a `gh pr create`
// that lacks a why-block — and the hook is enabled and not skipped — we DENY once with a
// reason + injected guidance, so the live model composes the block and re-runs. Everything
// else → an empty `{}` (no injection, the tool proceeds).
//
// NON-NEGOTIABLE POSTURE (fail-open): this must NEVER block or delay the user's git op.
// Every failure mode — unparseable payload, missing git, unwritable state, a throw
// anywhere — resolves to `{}` and exit 0. It never exits 2, never hard-blocks, and (via
// the deny cap) never denies the same operation twice.

import { classifyCommand } from './command.js';
import { hasMarker } from './marker.js';
import { branchInfo } from './git.js';
import { extractBodyFilePath, readBodyFile } from './bodyFile.js';
import { isDisabled, isSkipped } from './repoConfig.js';
import { hasPrompted, markPrompted, promptKey } from './promptState.js';
import { buildGuidance, type Surface } from './guidance.js';

/** The PreToolUse hook output. `{}` = no injection (fail-open); otherwise a deny. */
export interface PreToolUseHookOutput {
  hookSpecificOutput?: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'deny';
    permissionDecisionReason: string;
    additionalContext: string;
  };
}

export interface HookDeps {
  /** Fallback cwd when the payload omits one. Defaults to process.cwd(). */
  cwd?: string;
  /** Environment (skip/disable flags + state-dir override). Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Test seam: current-branch + default-ness. Defaults to git.branchInfo. */
  branchInfoImpl?: (cwd: string) => Promise<{ current: string | null; isDefault: boolean }>;
  /** Test seam: the per-repo/global off switch. Defaults to repoConfig.isDisabled. */
  isDisabledImpl?: (cwd: string, env: NodeJS.ProcessEnv) => Promise<boolean>;
}

function deny(surface: Surface): PreToolUseHookOutput {
  const guidance = buildGuidance(surface);
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: guidance,
      // Progressive enhancement. Claude Code exposes no version signal to hooks, so we
      // always emit additionalContext too: newer versions surface it, older ones ignore
      // the unknown field, and the reason above carries the guidance either way.
      additionalContext: guidance,
    },
  };
}

/**
 * Build the PreToolUse hook output for a raw stdin payload. NEVER throws — any problem
 * yields `{}` (no injection; the git op proceeds).
 */
export async function runHook(rawStdin: string, deps: HookDeps = {}): Promise<PreToolUseHookOutput> {
  const env = deps.env ?? process.env;
  try {
    let payload: unknown;
    try {
      payload = JSON.parse(rawStdin);
    } catch {
      return {}; // unparseable payload → no injection
    }
    const rec = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;

    // Only act on the Bash tool (the matcher already scopes this, but be defensive).
    if (rec.tool_name !== undefined && rec.tool_name !== 'Bash') return {};

    const toolInput = rec.tool_input;
    const command =
      toolInput && typeof toolInput === 'object'
        ? (toolInput as Record<string, unknown>).command
        : undefined;
    if (typeof command !== 'string' || command.trim().length === 0) return {};

    const kind = classifyCommand(command);
    if (kind === 'other') return {};

    // Per-invocation skip (a [skip-why] token in the command, or the env flag). Cheap
    // string check — do it before any git/filesystem work.
    if (isSkipped(command, env)) return {};

    const cwd = typeof rec.cwd === 'string' && rec.cwd ? rec.cwd : (deps.cwd ?? process.cwd());

    // Idempotency: the command already carries a block (the model's own retry, or a
    // hand-written one), inline or in a --body-file/-F/--file → leave it alone.
    if (hasMarker(command)) return {};
    const bodyFilePath = extractBodyFilePath(command);
    if (bodyFilePath && hasMarker(await readBodyFile(bodyFilePath, cwd))) return {};

    // Per-repo / global off switch.
    if (await (deps.isDisabledImpl ?? isDisabled)(cwd, env)) return {};

    // Surface routing (one git query for both the name and default-ness):
    // `gh pr create` → the PR body. A `git commit` gets a block only on the DEFAULT branch
    // (the direct-push surface); a feature-branch commit defers to PR-create.
    const info = await (deps.branchInfoImpl ?? branchInfo)(cwd).catch(() => ({
      current: null as string | null,
      isDefault: false,
    }));
    let surface: Surface;
    if (kind === 'gh-pr-create') {
      surface = 'pr';
    } else {
      if (!info.isDefault) return {};
      surface = 'commit';
    }

    // Anti-loop DENY CAP: deny at most once per (session, surface, branch). We deny ONLY
    // after recording the cap; if we've already prompted, or can't persist the cap, we
    // stand down — so the same operation is never denied twice (see promptState.ts).
    const sessionId = typeof rec.session_id === 'string' ? rec.session_id : undefined;
    const key = promptKey(sessionId, surface, info.current);
    if (await hasPrompted(key, env)) return {};
    if (!(await markPrompted(key, env))) return {};

    return deny(surface);
  } catch {
    return {}; // belt-and-braces: any failure → no injection, the git op proceeds
  }
}
