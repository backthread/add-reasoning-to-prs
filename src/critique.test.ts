import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPadding, scrubLines, scrubPrimitives } from './critique.js';

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
});
