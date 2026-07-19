import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGuidance } from './guidance.js';
import { SKIP_TOKEN } from './repoConfig.js';
import { PR_MARKER_OPEN, COMMIT_MARKER_OPEN } from './marker.js';

test('guidance is surface-aware and lists all four primitives', () => {
  const pr = buildGuidance('pr');
  assert.match(pr, /pull request description/i);
  assert.ok(pr.includes(PR_MARKER_OPEN));
  for (const p of ['Decisions', 'Assumptions', 'Trade-offs', 'Limitations']) {
    assert.ok(pr.includes(p), `PR guidance should mention ${p}`);
  }

  const commit = buildGuidance('commit');
  assert.match(commit, /commit message body/i);
  assert.ok(commit.includes(COMMIT_MARKER_OPEN));
});

test('guidance includes an explicit before-writing self-critique pass', () => {
  const g = buildGuidance('pr');
  assert.match(g, /self-check/i);
  assert.match(g, /name the specific point in THIS session/i);
  assert.match(g, /delete the line/i);
});

test('guidance makes the leave-empty path explicit (no manufactured filler)', () => {
  const g = buildGuidance('commit');
  assert.match(g, /if nothing survives/i);
  assert.match(g, /re-run your original command unchanged/i);
  assert.ok(g.includes(SKIP_TOKEN), 'guidance should surface the explicit skip escape hatch');
  assert.match(g, /never manufacture filler/i);
});

test('guidance tells the model to write plainly (non-native-reader friendly)', () => {
  const g = buildGuidance('pr');
  assert.match(g, /native English speaker/i);
  assert.match(g, /one idea per sentence/i);
  assert.match(g, /not idioms or metaphors/i);
  assert.match(g, /never trade a concrete name for a vague one/i);
  assert.match(g, /a short action/i);
});

test('guidance carries the restraint, insight, no-self-praise, and attribution rules', () => {
  const pr = buildGuidance('pr');
  assert.match(pr, /Size the block to the change/i); // restraint
  assert.match(pr, /Lead with the one point a reviewer could NOT get from the diff/i); // insight
  assert.match(pr, /do not guess it/i); // never fabricate a why
  assert.match(pr, /claim plus its silent consequence/i); // caveat bar
  assert.match(pr, /No self-praise/i); // no self-praise
  assert.match(pr, /## Reasoning/); // visible attribution (PR surface)
  assert.match(pr, /backthread\/add-reasoning-to-prs/); // attributed to the package
});

test('commit-surface attribution is plain text (no markdown heading, HTML, or links)', () => {
  const commit = buildGuidance('commit');
  assert.match(commit, /written in-session via backthread\/add-reasoning-to-prs/);
  assert.doesNotMatch(commit, /## Reasoning/); // a commit message doesn't render markdown
  assert.doesNotMatch(commit, /<sub>/);
});
