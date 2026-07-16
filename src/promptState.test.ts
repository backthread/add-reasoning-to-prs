import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasPrompted, markPrompted, promptKey } from './promptState.js';

async function freshEnv(): Promise<NodeJS.ProcessEnv> {
  const dir = await mkdtemp(join(tmpdir(), 'arp-prompt-'));
  return { ADD_REASONING_TO_PRS_STATE_DIR: dir };
}

test('promptKey distinguishes surface and branch, and tolerates a missing session', () => {
  assert.equal(promptKey('s1', 'pr', 'feat/a'), 's1::pr::feat/a');
  assert.notEqual(promptKey('s1', 'pr', 'feat/a'), promptKey('s1', 'pr', 'feat/b'));
  assert.notEqual(promptKey('s1', 'pr', 'main'), promptKey('s1', 'commit', 'main'));
  assert.match(promptKey(undefined, 'pr', null), /no-session::pr::no-branch/);
});

test('first run is not prompted; after markPrompted it is (and mark is idempotent)', async () => {
  const env = await freshEnv();
  const key = promptKey('s1', 'pr', 'feat/a');
  assert.equal(await hasPrompted(key, env), false, 'ENOENT / first run → not prompted');
  assert.equal(await markPrompted(key, env), true, 'mark persists → true');
  assert.equal(await hasPrompted(key, env), true, 'now prompted');
  assert.equal(await markPrompted(key, env), true, 're-marking an existing key is fine');
});

test('distinct keys are tracked independently', async () => {
  const env = await freshEnv();
  await markPrompted(promptKey('s1', 'pr', 'feat/a'), env);
  assert.equal(await hasPrompted(promptKey('s1', 'pr', 'feat/a'), env), true);
  assert.equal(await hasPrompted(promptKey('s1', 'pr', 'feat/b'), env), false);
  assert.equal(await hasPrompted(promptKey('s2', 'pr', 'feat/a'), env), false);
});
