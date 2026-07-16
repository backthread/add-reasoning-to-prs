// hook.ts — the PreToolUse/Bash hook orchestrator.
//
// Claude Code runs this synchronously BEFORE a Bash tool call and reads its stdout for a
// decision. When the command is a `git commit` (on the default branch) or a `gh pr create`
// that lacks a why-block, we DENY with a reason + injected guidance, so the live model
// composes the block and re-runs the command. Everything else → an empty `{}` (no
// injection, the tool proceeds).
//
// NON-NEGOTIABLE POSTURE (fail-open): this must NEVER block or delay the user's git op.
// Every failure mode — unparseable payload, missing git, a throw anywhere — resolves to
// `{}` and exit 0. It never exits 2, never hard-blocks.

import { classifyCommand } from './command.js';
import { hasMarker } from './marker.js';
import { isDefaultBranch } from './git.js';
import { extractBodyFilePath, readBodyFile } from './bodyFile.js';
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
  /** Test seam: the default-branch check. Defaults to git.isDefaultBranch. */
  isDefaultBranchImpl?: (cwd: string) => Promise<boolean>;
}

/**
 * Build the PreToolUse hook output for a raw stdin payload. NEVER throws — any problem
 * yields `{}` (no injection; the git op proceeds).
 */
export async function runHook(rawStdin: string, deps: HookDeps = {}): Promise<PreToolUseHookOutput> {
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

    const cwd = typeof rec.cwd === 'string' && rec.cwd ? rec.cwd : (deps.cwd ?? process.cwd());

    // Idempotency: the command already carries a block (the model's own retry, or a
    // hand-written one) → leave it alone, so a re-run is a no-op and we never re-deny.
    // This covers the inline body (--body / -m) AND a body/message passed via a file
    // (--body-file / -F / --file) — we read that file and check it too.
    if (hasMarker(command)) return {};
    const bodyFilePath = extractBodyFilePath(command);
    if (bodyFilePath) {
      const contents = await readBodyFile(bodyFilePath, cwd);
      if (hasMarker(contents)) return {};
    }

    // Surface routing: `gh pr create` → the PR body. A `git commit` only gets a block on
    // the DEFAULT branch (the direct-push surface); a feature-branch commit defers to
    // PR-create and is left alone here.
    let surface: Surface;
    if (kind === 'gh-pr-create') {
      surface = 'pr';
    } else {
      const onDefault = await (deps.isDefaultBranchImpl ?? isDefaultBranch)(cwd).catch(() => false);
      if (!onDefault) return {};
      surface = 'commit';
    }

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
  } catch {
    return {}; // belt-and-braces: any failure → no injection, the git op proceeds
  }
}
