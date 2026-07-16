import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isSkipped, isDisabled, SKIP_TOKEN } from './repoConfig.js';

const pexec = promisify(execFile);

test('isSkipped: the token in the command opts out', () => {
  assert.equal(isSkipped(`git commit -m "wip ${SKIP_TOKEN}"`, {}), true);
  assert.equal(isSkipped('gh pr create --title T', {}), false);
});

test('isSkipped: the env flag opts out (any truthy form)', () => {
  assert.equal(isSkipped('gh pr create', { ADD_REASONING_TO_PRS_SKIP: '1' }), true);
  assert.equal(isSkipped('gh pr create', { ADD_REASONING_TO_PRS_SKIP: 'true' }), true);
  assert.equal(isSkipped('gh pr create', { ADD_REASONING_TO_PRS_SKIP: '0' }), false);
  assert.equal(isSkipped('gh pr create', {}), false);
});

test('isDisabled: the global env flag disables', async () => {
  assert.equal(await isDisabled('/nonexistent', { ADD_REASONING_TO_PRS_DISABLE: '1' }), true);
});

test('isDisabled: reads the per-repo git config, defaulting to enabled', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'arp-cfg-'));
  await pexec('git', ['init', '-q'], { cwd: dir });
  // Unset → not disabled.
  assert.equal(await isDisabled(dir, {}), false);
  // Set the per-repo off switch → disabled.
  await pexec('git', ['config', 'add-reasoning-to-prs.disabled', 'true'], { cwd: dir });
  assert.equal(await isDisabled(dir, {}), true);
  // Explicit false → re-enabled.
  await pexec('git', ['config', 'add-reasoning-to-prs.disabled', 'false'], { cwd: dir });
  assert.equal(await isDisabled(dir, {}), false);
});
