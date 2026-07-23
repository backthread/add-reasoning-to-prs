import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlock, isEmptyBlock } from './template.js';
import { hasMarker, PR_MARKER_OPEN, PR_MARKER_CLOSE, COMMIT_MARKER_OPEN } from './marker.js';

test('renders the PR surface: invisible HTML-comment delimiters, markdown headings, only non-empty sections', () => {
  const block = renderBlock('pr', { decisions: ['chose X over Y'], tradeoffs: ['gave up Z'] });
  assert.ok(block.startsWith(PR_MARKER_OPEN));
  assert.ok(block.trimEnd().endsWith(PR_MARKER_CLOSE));
  assert.match(block, /\*\*Decisions\*\*/);
  assert.match(block, /- chose X over Y/);
  assert.match(block, /\*\*Trade-offs\*\*/);
  // Sections with no items are omitted entirely.
  assert.doesNotMatch(block, /Assumptions/);
  assert.doesNotMatch(block, /Limitations/);
  assert.equal(hasMarker(block), true);
});

test('renders the commit surface: plain sentinel delimiters and plain-text headings', () => {
  const block = renderBlock('commit', { decisions: ['keep it local'] });
  assert.ok(block.startsWith(COMMIT_MARKER_OPEN));
  assert.match(block, /Decisions:/);
  assert.doesNotMatch(block, /\*\*Decisions\*\*/); // no markdown bold in a commit message
  assert.equal(hasMarker(block), true);
});

test('renders sections in canonical order regardless of input order', () => {
  const block = renderBlock('commit', {
    limitations: ['l'],
    decisions: ['d'],
    tradeoffs: ['t'],
    assumptions: ['a'],
  });
  const order = ['Decisions', 'Assumptions', 'Trade-offs', 'Limitations'].map((h) =>
    block.indexOf(h),
  );
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
});

test('empty primitives render nothing (leave-empty → omit the block)', () => {
  assert.equal(renderBlock('pr', {}), '');
  assert.equal(renderBlock('commit', { decisions: [], tradeoffs: ['   '] }), '');
  assert.equal(isEmptyBlock({}), true);
  assert.equal(isEmptyBlock({ decisions: ['  ', ''] }), true);
  assert.equal(isEmptyBlock({ assumptions: ['real'] }), false);
});

test('Recommended follow-ups renders on the PR surface, after Limitations', () => {
  const block = renderBlock('pr', {
    limitations: ['left the backfill for a follow-up PR'],
    followups: ['the mobile client still sends a legacy retryCount field the API no longer reads; drop it in apps/mobile/src/api.ts'],
  });
  assert.match(block, /\*\*Recommended follow-ups\*\*/);
  assert.match(block, /- the mobile client still sends a legacy retryCount field/);
  // Ordering: follow-ups come after limitations.
  assert.ok(block.indexOf('Limitations') < block.indexOf('Recommended follow-ups'));
});

test('Recommended follow-ups NEVER renders on the commit surface', () => {
  const block = renderBlock('commit', {
    decisions: ['keep it local'],
    followups: ['a cross-repo consequence a commit has no home for'],
  });
  assert.doesNotMatch(block, /Recommended follow-ups/);
  assert.doesNotMatch(block, /cross-repo consequence/);
  // The other sections still render normally.
  assert.match(block, /Decisions:/);
});

test('a follow-up-only set renders on the PR surface but is empty on the commit surface', () => {
  const followupOnly = { followups: ['applyDiscount duplicates the pricing branch order in the checkout service'] };
  assert.match(renderBlock('pr', followupOnly), /\*\*Recommended follow-ups\*\*/);
  assert.equal(renderBlock('commit', followupOnly), ''); // commit excludes follow-ups → nothing to render
  assert.equal(isEmptyBlock(followupOnly), false); // but the set itself is not empty
});
