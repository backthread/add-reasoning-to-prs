import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPadding, isPaddingFollowup, scrubLines, scrubFollowups, scrubPrimitives } from './critique.js';

test('drops padded/filler lines but keeps genuine deliberation (the fixture)', () => {
  const input = [
    'Various minor improvements',
    'Chose polling over webhooks because the vendor exposes no webhook API',
    'Improved code quality',
    'Assumed the 30s vendor timeout is stable; revisit if they change it',
    'N/A',
    'cleanup',
  ];
  const out = scrubLines(input);
  assert.deepEqual(out, [
    'Chose polling over webhooks because the vendor exposes no webhook API',
    'Assumed the 30s vendor timeout is stable; revisit if they change it',
  ]);
});

test('a genuine why-line that starts with a change verb is NOT dropped', () => {
  // The scrub must never confuse "what changed + why" with pure filler.
  assert.equal(
    isPadding('Added exponential backoff because the vendor rate-limits aggressively'),
    false,
  );
  assert.equal(isPadding('Refactored the parser to isolate the retry boundary for testability'), false);
  assert.equal(isPadding('Removed the cache since staleness caused the incident'), false);
});

test('recognizes unambiguous filler as padding', () => {
  for (const f of [
    'various improvements',
    'minor changes',
    'improves code quality',
    'made the code cleaner',
    'general cleanup',
    'refactoring',
    'N/A',
    'none',
    'tbd',
    'No notable decisions',
    '   ',
    '- ',
  ]) {
    assert.equal(isPadding(f), true, `expected isPadding(${JSON.stringify(f)}) === true`);
  }
});

test('de-duplicates (case-insensitive) and strips bullets', () => {
  assert.deepEqual(scrubLines(['- Chose Postgres', 'chose postgres', 'Chose Redis']), [
    'Chose Postgres',
    'Chose Redis',
  ]);
});

test('scrubPrimitives cleans every section and leaves empties empty', () => {
  const out = scrubPrimitives({
    decisions: ['Picked A because B', 'various improvements'],
    assumptions: ['none'],
    tradeoffs: [],
    limitations: ['Skipped the migration for the follow-up PR'],
  });
  assert.deepEqual(out, {
    decisions: ['Picked A because B'],
    assumptions: [],
    tradeoffs: [],
    limitations: ['Skipped the migration for the follow-up PR'],
  });
  // No followups key was supplied → none is added (keeps the scratchpad JSON clean).
  assert.ok(!('followups' in out));
});

test('scrubFollowups drops generic to-dos at the stricter bar but keeps concrete cross-boundary items', () => {
  const kept = 'The mobile and web clients still send a legacy retryCount field the API now ignores; drop it in apps/mobile/src/api.ts';
  const out = scrubFollowups([
    'Add tests',
    'consider refactoring later',
    'improve error handling',
    'update the docs',
    'handle edge cases',
    'add monitoring',
    'follow-up',
    kept,
  ]);
  assert.deepEqual(out, [kept]);
});

test('the stricter follow-up bar is a SUPERSET of the base bar', () => {
  // Generic to-dos are padding for follow-ups but NOT for the base primitives.
  assert.equal(isPaddingFollowup('Add tests'), true);
  assert.equal(isPadding('Add tests'), false);
  assert.equal(isPaddingFollowup('consider refactoring later'), true);
  // A concrete item that merely starts with a generic verb survives both.
  const concrete = 'Add tests for the cross-service billing webhook contract in packages/billing/webhook.ts';
  assert.equal(isPaddingFollowup(concrete), false);
  // Base filler is still filler for follow-ups.
  assert.equal(isPaddingFollowup('various improvements'), true);
});

test('scrubPrimitives applies the stricter bar to followups only', () => {
  const out = scrubPrimitives({
    decisions: ['Add tests'], // NOT dropped — the base bar keeps change-verb lines
    followups: ['Add tests', 'applyDiscount duplicates the pricing branch order in the checkout service'],
  });
  assert.deepEqual(out.decisions, ['Add tests']);
  assert.deepEqual(out.followups, [
    'applyDiscount duplicates the pricing branch order in the checkout service',
  ]);
});
