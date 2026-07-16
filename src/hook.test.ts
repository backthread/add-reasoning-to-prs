import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHook, type HookDeps } from './hook.js';
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

const AS_DEFAULT: Pick<HookDeps, 'branchInfoImpl'> = {
  branchInfoImpl: async () => ({ current: 'main', isDefault: true }),
};
const AS_FEATURE: Pick<HookDeps, 'branchInfoImpl'> = {
  branchInfoImpl: async () => ({ current: 'feat/x', isDefault: false }),
};

/** Deps with an isolated (empty) cap-state dir and the off-switch stubbed off. */
async function mkDeps(over: HookDeps = {}): Promise<HookDeps> {
  const dir = await mkdtemp(join(tmpdir(), 'arp-state-'));
  return {
    isDisabledImpl: async () => false,
    env: { ADD_REASONING_TO_PRS_STATE_DIR: dir },
    ...over,
  };
}

test('gh pr create without a block → deny with guidance (both channels)', async () => {
  const out = await runHook(payload('gh pr create --title T --body B'), await mkDeps(AS_FEATURE));
  const hs = out.hookSpecificOutput;
  assert.ok(hs, 'expected a hookSpecificOutput');
  assert.equal(hs.hookEventName, 'PreToolUse');
  assert.equal(hs.permissionDecision, 'deny');
  assert.match(hs.permissionDecisionReason, /forward-only/i);
  assert.match(hs.permissionDecisionReason, /pull request description/i);
  assert.equal(hs.additionalContext, hs.permissionDecisionReason);
});

test('gh pr create that ALREADY has the block → no-op (idempotent)', async () => {
  const cmd = `gh pr create --body "Body ${PR_MARKER_OPEN} Decisions: x ${PR_MARKER_CLOSE}"`;
  assert.deepEqual(await runHook(payload(cmd), await mkDeps(AS_FEATURE)), {});
});

test('idempotent when the block lives in a --body-file, not inline', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'arp-hook-'));
  const withBlock = join(dir, 'body.md');
  await writeFile(withBlock, `Summary\n${PR_MARKER_OPEN}\nDecisions:\n- x\n${PR_MARKER_CLOSE}\n`);
  const out = await runHook(payload(`gh pr create --body-file ${withBlock}`), await mkDeps(AS_FEATURE));
  assert.deepEqual(out, {}, 'a file-passed body with a block should be left alone');
});

test('still denies when the --body-file exists but has NO block', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'arp-hook-'));
  const noBlock = join(dir, 'body.md');
  await writeFile(noBlock, 'Just a summary, no reasoning.\n');
  const out = await runHook(payload(`gh pr create --body-file ${noBlock}`), await mkDeps(AS_FEATURE));
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
});

test('git commit on the DEFAULT branch → deny with the commit-surface guidance', async () => {
  const out = await runHook(payload('git commit -m "wip"'), await mkDeps(AS_DEFAULT));
  assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput!.permissionDecisionReason, /commit message body/i);
});

test('git commit on a FEATURE branch → no-op (defers to PR-create)', async () => {
  assert.deepEqual(await runHook(payload('git commit -m "wip"'), await mkDeps(AS_FEATURE)), {});
});

test('non-matching command / non-Bash tool → no-op', async () => {
  assert.deepEqual(await runHook(payload('git push'), await mkDeps(AS_DEFAULT)), {});
  assert.deepEqual(await runHook(payload('ls -la'), await mkDeps(AS_DEFAULT)), {});
  const read = JSON.stringify({ tool_name: 'Read', tool_input: { file_path: '/x' } });
  assert.deepEqual(await runHook(read, await mkDeps(AS_DEFAULT)), {});
});

test('fail-open on bad / empty / missing input', async () => {
  const d = await mkDeps(AS_DEFAULT);
  assert.deepEqual(await runHook('not json', d), {});
  assert.deepEqual(await runHook('', d), {});
  assert.deepEqual(await runHook('null', d), {});
  assert.deepEqual(await runHook(JSON.stringify({ tool_name: 'Bash', tool_input: {} }), d), {});
});

test('fail-open when the branch check throws (git commit) → no-op', async () => {
  const deps = await mkDeps({
    branchInfoImpl: async () => {
      throw new Error('git blew up');
    },
  });
  assert.deepEqual(await runHook(payload('git commit -m x'), deps), {});
});

// --- trigger controls -------------------------------------------------------------

test('per-invocation skip: [skip-why] token in the command → no-op', async () => {
  const out = await runHook(
    payload('gh pr create --title T --body "B [skip-why]"'),
    await mkDeps(AS_FEATURE),
  );
  assert.deepEqual(out, {});
});

test('env skip flag → no-op', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'arp-state-'));
  const out = await runHook(payload('gh pr create --title T'), {
    ...AS_FEATURE,
    isDisabledImpl: async () => false,
    env: { ADD_REASONING_TO_PRS_STATE_DIR: dir, ADD_REASONING_TO_PRS_SKIP: '1' },
  });
  assert.deepEqual(out, {});
});

test('per-repo off switch (disabled) → no-op', async () => {
  const out = await runHook(
    payload('gh pr create --title T'),
    await mkDeps({ ...AS_FEATURE, isDisabledImpl: async () => true }),
  );
  assert.deepEqual(out, {});
});

// --- anti-loop deny cap -----------------------------------------------------------

test('deny cap: the same operation is denied at most once (empty-retry does not loop)', async () => {
  const deps = await mkDeps(AS_FEATURE); // shared env (shared cap state) across both calls
  const first = await runHook(payload('gh pr create --title T'), deps);
  assert.equal(first.hookSpecificOutput?.permissionDecision, 'deny', 'first prompt denies');
  // The model finds nothing to add and re-runs the SAME command with no block:
  const second = await runHook(payload('gh pr create --title T'), deps);
  assert.deepEqual(second, {}, 'second time is capped → allow (no loop)');
});

test('deny cap: a different branch (distinct PR) in the same session is still prompted', async () => {
  const deps = await mkDeps(); // shared env
  const a = await runHook(payload('gh pr create --title A'), {
    ...deps,
    branchInfoImpl: async () => ({ current: 'feat/a', isDefault: false }),
  });
  const b = await runHook(payload('gh pr create --title B'), {
    ...deps,
    branchInfoImpl: async () => ({ current: 'feat/b', isDefault: false }),
  });
  assert.equal(a.hookSpecificOutput?.permissionDecision, 'deny');
  assert.equal(b.hookSpecificOutput?.permissionDecision, 'deny', 'distinct branch → not capped');
});
