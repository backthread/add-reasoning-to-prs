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

test('PR guidance teaches Recommended follow-ups: inclusion test, precision bar, de-dup rule', () => {
  const pr = buildGuidance('pr');
  assert.match(pr, /Recommended follow-ups/);
  // Inclusion test: reasoning-surfaced AND not derivable from this diff.
  assert.match(pr, /could not see from this PR's diff alone/i);
  // Precision over coverage + empty is correct.
  assert.match(pr, /Precision over coverage/i);
  assert.match(pr, /empty section is the normal, correct outcome/i);
  // Not a review/lint/CI lane.
  assert.match(pr, /linter, or CI already catches/i);
  // Never guess a path.
  assert.match(pr, /Never guess a path/i);
  // De-dup with the Check: tail.
  assert.match(pr, /One risk has one home/i);
  assert.match(pr, /remove the "Check: \.\.\." tail/i);
  // The example block shows the heading on the PR surface.
  assert.match(pr, /\*\*Recommended follow-ups\*\*/);
});

test('commit guidance NEVER mentions Recommended follow-ups (PR-only primitive)', () => {
  const commit = buildGuidance('commit');
  assert.doesNotMatch(commit, /Recommended follow-ups/i);
  assert.doesNotMatch(commit, /Precision over coverage/i);
});

test('commit-surface attribution is plain text (no markdown heading, HTML, or links)', () => {
  const commit = buildGuidance('commit');
  assert.match(commit, /written in-session via backthread\/add-reasoning-to-prs/);
  assert.doesNotMatch(commit, /## Reasoning/); // a commit message doesn't render markdown
  assert.doesNotMatch(commit, /<sub>/);
});
