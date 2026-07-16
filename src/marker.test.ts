import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasMarker,
  PR_MARKER_OPEN,
  PR_MARKER_CLOSE,
  COMMIT_MARKER_OPEN,
  COMMIT_MARKER_CLOSE,
  MARKER_TOKEN,
} from './marker.js';

test('every delimiter (both surfaces, open + close) is detected by hasMarker', () => {
  for (const m of [PR_MARKER_OPEN, PR_MARKER_CLOSE, COMMIT_MARKER_OPEN, COMMIT_MARKER_CLOSE]) {
    assert.equal(hasMarker(m), true, `expected hasMarker(${JSON.stringify(m)}) === true`);
    assert.ok(m.includes(MARKER_TOKEN), `expected ${JSON.stringify(m)} to embed the token`);
  }
});

test('detects a marker embedded in a larger body', () => {
  const body = `Add the widget.\n\n${PR_MARKER_OPEN}\nDecisions:\n- did a thing\n${PR_MARKER_CLOSE}\n`;
  assert.equal(hasMarker(body), true);
});

test('returns false for text without a marker and for empty/nullish input', () => {
  assert.equal(hasMarker('just a normal PR body'), false);
  assert.equal(hasMarker(''), false);
  assert.equal(hasMarker(undefined), false);
  assert.equal(hasMarker(null), false);
});
