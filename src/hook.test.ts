import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runHook } from './hook.js';
import { PR_MARKER_OPEN, PR_MARKER_CLOSE } from './marker.js';

/** Build a PreToolUse/Bash payload string. */
function payload(command: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
    cwd: '/tmp/repo',
    session_id: 's1',
    ...extra,
  });
}

const onDefault = { isDefaultBranchImpl: async () => true };
const onFeature = { isDefaultBranchImpl: async () => false };

test('gh pr create without a block → deny with guidance (both channels)', async () => {
  const out = await runHook(payload('gh pr create --title T --body B'), onFeature);
  const hs = out.hookSpecificOutput;
  assert.ok(hs, 'expected a hookSpecificOutput');
  assert.equal(hs.hookEventName, 'PreToolUse');
  assert.equal(hs.permissionDecision, 'deny');
  assert.match(hs.permissionDecisionReason, /forward-only/i);
  assert.match(hs.permissionDecisionReason, /pull request description/i);
  // The reason (reliable floor) and additionalContext (progressive enhancement) both
  // carry the guidance, so the model sees it regardless of version support.
  assert.equal(hs.additionalContext, hs.permissionDecisionReason);
});

test('gh pr create that ALREADY has the block → no-op (idempotent)', async () => {
  const cmd = `gh pr create --body "Body ${PR_MARKER_OPEN} Decisions: x ${PR_MARKER_CLOSE}"`;
  const out = await runHook(payload(cmd), onFeature);
  assert.deepEqual(out, {});
});

test('git commit on the DEFAULT branch → deny with the commit-surface guidance', async () => {
  const out = await runHook(payload('git commit -m "wip"'), onDefault);
  const hs = out.hookSpecificOutput;
  assert.ok(hs);
  assert.equal(hs.permissionDecision, 'deny');
  assert.match(hs.permissionDecisionReason, /commit message body/i);
});

test('git commit on a FEATURE branch → no-op (defers to PR-create)', async () => {
  const out = await runHook(payload('git commit -m "wip"'), onFeature);
  assert.deepEqual(out, {});
});

test('non-matching command → no-op', async () => {
  assert.deepEqual(await runHook(payload('git push'), onDefault), {});
  assert.deepEqual(await runHook(payload('ls -la'), onDefault), {});
});

test('non-Bash tool → no-op', async () => {
  const raw = JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/x' } });
  assert.deepEqual(await runHook(raw, onDefault), {});
});

test('fail-open on bad / empty / missing input', async () => {
  assert.deepEqual(await runHook('not json', onDefault), {});
  assert.deepEqual(await runHook('', onDefault), {});
  assert.deepEqual(await runHook('null', onDefault), {});
  assert.deepEqual(await runHook(JSON.stringify({ tool_name: 'Bash', tool_input: {} }), onDefault), {});
});

test('fail-open when the branch check throws (git commit) → no-op, never a throw', async () => {
  const throwing = {
    isDefaultBranchImpl: async () => {
      throw new Error('git blew up');
    },
  };
  const out = await runHook(payload('git commit -m x'), throwing);
  assert.deepEqual(out, {});
});
