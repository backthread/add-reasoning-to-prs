// hook.ts — the PreToolUse/Bash hook orchestrator.
//
// Claude Code runs this synchronously BEFORE a Bash tool call and reads its stdout for a
// decision. When the command is a `git commit` (on the default branch) or a `gh pr create`
// that lacks a why-block — and the hook is enabled and not skipped — we DENY once with a
// reason + injected guidance, so the live model composes the block and re-runs. On a
// feature-branch commit we don't block, but we nudge (once) to bank the session's why to
// the branch scratchpad. Everything else → an empty `{}` (no injection, the tool proceeds).
//
// NON-NEGOTIABLE POSTURE (fail-open): this must NEVER block or delay the user's git op.
// Every failure mode resolves to `{}` and exit 0. It never exits 2, never hard-blocks, and
// (via the deny cap) never denies the same operation twice.

import { classifyCommand } from './command.js';
import { hasMarker } from './marker.js';
import { branchInfo, repoRoot } from './git.js';
import { extractBodyFilePath, readBodyFile } from './bodyFile.js';
import { isDisabled, isSkipped } from './repoConfig.js';
import { hasPrompted, markPrompted, promptKey } from './promptState.js';
import { readScratch, clearScratch, isScratchEmpty } from './scratch.js';
import { buildGuidance, buildScratchNudge, type Surface } from './guidance.js';
import type { WhyPrimitives } from './template.js';

/** The PreToolUse hook output. `{}` = no injection (fail-open); otherwise a deny or a
 * non-blocking context nudge. */
export interface PreToolUseHookOutput {
  hookSpecificOutput?: {
    hookEventName: 'PreToolUse';
    permissionDecision?: 'deny';
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
}

export interface HookDeps {
  /** Fallback cwd when the payload omits one. Defaults to process.cwd(). */
  cwd?: string;
  /** Environment (skip/disable flags + state-dir override). Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Test seam: current-branch + default-ness. Defaults to git.branchInfo. */
  branchInfoImpl?: (cwd: string) => Promise<{ current: string | null; isDefault: boolean }>;
  /** Test seam: repo root (for the scratchpad key). Defaults to git.repoRoot. */
  repoRootImpl?: (cwd: string) => Promise<string | null>;
  /** Test seam: the per-repo/global off switch. Defaults to repoConfig.isDisabled. */
  isDisabledImpl?: (cwd: string, env: NodeJS.ProcessEnv) => Promise<boolean>;
}

function deny(surface: Surface, accumulated?: WhyPrimitives): PreToolUseHookOutput {
  const guidance = buildGuidance(surface, accumulated);
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

/** A non-blocking context injection (no permissionDecision → the tool proceeds). */
function nudge(context: string): PreToolUseHookOutput {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: context } };
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
    // string check — before any git/filesystem work.
    if (isSkipped(command, env)) return {};

    const cwd = typeof rec.cwd === 'string' && rec.cwd ? rec.cwd : (deps.cwd ?? process.cwd());
    const sessionId = typeof rec.session_id === 'string' ? rec.session_id : undefined;

    // Idempotency: the command already carries a block (the model's own retry, or a
    // hand-written one), inline or in a --body-file/-F/--file → leave it alone.
    if (hasMarker(command)) return {};
    const bodyFilePath = extractBodyFilePath(command);
    if (bodyFilePath && hasMarker(await readBodyFile(bodyFilePath, cwd))) return {};

    // Per-repo / global off switch.
    if (await (deps.isDisabledImpl ?? isDisabled)(cwd, env)) return {};

    // One git query for both the branch name and default-ness.
    const info = await (deps.branchInfoImpl ?? branchInfo)(cwd).catch(() => ({
      current: null as string | null,
      isDefault: false,
    }));

    // Surface routing.
    let surface: Surface;
    if (kind === 'gh-pr-create') {
      surface = 'pr';
    } else {
      // `git commit` on a FEATURE branch: don't block it, but nudge ONCE per session+branch
      // to bank this session's why to the scratchpad for the eventual PR. Only when we
      // actually know the branch (an unknown/detached HEAD stays a silent no-op).
      if (!info.isDefault) {
        if (info.current) {
          const nudgeKey = promptKey(sessionId, 'scratch-nudge', info.current);
          if (!(await hasPrompted(nudgeKey, env)) && (await markPrompted(nudgeKey, env))) {
            return nudge(buildScratchNudge());
          }
        }
        return {};
      }
      surface = 'commit'; // direct commit on the default branch
    }

    // Anti-loop DENY CAP: deny at most once per (session, surface, branch). We deny ONLY
    // after recording the cap; if we've already prompted, or can't persist the cap, we
    // stand down — so the same operation is never denied twice.
    const key = promptKey(sessionId, surface, info.current);
    if (await hasPrompted(key, env)) return {};
    if (!(await markPrompted(key, env))) return {};

    // At PR-create, READ + CLEAR the branch scratchpad so the block covers the whole
    // branch (accumulated across earlier sessions). Only the PR surface accumulates.
    let accumulated: WhyPrimitives | undefined;
    if (surface === 'pr' && info.current) {
      const root = await (deps.repoRootImpl ?? repoRoot)(cwd).catch(() => null);
      if (root) {
        const scratch = await readScratch(root, info.current, env);
        if (!isScratchEmpty(scratch)) accumulated = scratch;
        await clearScratch(root, info.current, env);
      }
    }

    return deny(surface, accumulated);
  } catch {
    return {}; // belt-and-braces: any failure → no injection, the git op proceeds
  }
}
