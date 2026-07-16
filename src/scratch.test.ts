import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendScratch,
  readScratch,
  clearScratch,
  coercePrimitives,
  isScratchEmpty,
} from './scratch.js';

async function env(): Promise<NodeJS.ProcessEnv> {
  return { ADD_REASONING_TO_PRS_STATE_DIR: await mkdtemp(join(tmpdir(), 'arp-scratch-')) };
}

test('accumulates why across two sessions on the same branch (deduped, scrubbed)', async () => {
  const e = await env();
  const root = '/repo';
  const branch = 'feat/x';
  await appendScratch(root, branch, { decisions: ['Chose Postgres for the JSONB support'] }, e);
  await appendScratch(
    root,
    branch,
    {
      decisions: ['Chose Postgres for the JSONB support', 'Deferred the cache to a follow-up'],
      tradeoffs: ['various improvements'], // filler → scrubbed out
    },
    e,
  );
  const acc = await readScratch(root, branch, e);
  assert.deepEqual(acc.decisions, [
    'Chose Postgres for the JSONB support',
    'Deferred the cache to a follow-up',
  ]);
  assert.deepEqual(acc.tradeoffs, []);
});

test('scratchpads are isolated per branch and per repo', async () => {
  const e = await env();
  await appendScratch('/repo', 'feat/a', { decisions: ['A'] }, e);
  assert.deepEqual((await readScratch('/repo', 'feat/a', e)).decisions, ['A']);
  assert.ok(isScratchEmpty(await readScratch('/repo', 'feat/b', e)));
  assert.ok(isScratchEmpty(await readScratch('/other', 'feat/a', e)));
});

test('clearScratch empties the branch scratchpad', async () => {
  const e = await env();
  await appendScratch('/repo', 'feat/x', { limitations: ['Skipped the migration'] }, e);
  assert.equal(isScratchEmpty(await readScratch('/repo', 'feat/x', e)), false);
  await clearScratch('/repo', 'feat/x', e);
  assert.equal(isScratchEmpty(await readScratch('/repo', 'feat/x', e)), true);
});

test('coercePrimitives keeps only the four known keys, as string arrays', () => {
  const out = coercePrimitives({
    decisions: ['a', 2, null, 'b'],
    tradeoffs: 'not-an-array',
    bogus: ['x'],
    limitations: ['c'],
  });
  assert.deepEqual(out, { decisions: ['a', 'b'], limitations: ['c'] });
});
