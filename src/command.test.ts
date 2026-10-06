import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCommand } from './command.js';

test('detects plain git commit forms', () => {
  assert.equal(classifyCommand('git commit'), 'git-commit');
  assert.equal(classifyCommand('git commit -m "add feature"'), 'git-commit');
  assert.equal(classifyCommand('git commit -am "wip"'), 'git-commit');
  assert.equal(classifyCommand('git commit --amend --no-edit'), 'git-commit');
});

test('detects git commit through global options and their values', () => {
  assert.equal(classifyCommand('git -C /some/path commit -m x'), 'git-commit');
  assert.equal(classifyCommand('git -c user.email=a@b.co commit -m x'), 'git-commit');
  assert.equal(classifyCommand('git --git-dir=/r/.git commit'), 'git-commit');
});

test('detects git commit with env prefixes, path prefixes, and in a chain', () => {
  assert.equal(classifyCommand('GIT_AUTHOR_NAME=me git commit -m x'), 'git-commit');
  assert.equal(classifyCommand('/usr/bin/git commit -m x'), 'git-commit');
  assert.equal(classifyCommand('cd repo && git commit -m x'), 'git-commit');
  assert.equal(classifyCommand('git add -A && git commit -m x'), 'git-commit');
});

test('detects gh pr create', () => {
  assert.equal(classifyCommand('gh pr create'), 'gh-pr-create');
  assert.equal(classifyCommand('gh pr create --title "T" --body "B"'), 'gh-pr-create');
  assert.equal(classifyCommand('gh pr create --fill && echo done'), 'gh-pr-create');
});

test('does NOT match look-alikes', () => {
  assert.equal(classifyCommand('git push'), 'other');
  assert.equal(classifyCommand('git log --grep commit'), 'other');
  assert.equal(classifyCommand('git commitfoo'), 'other');
  assert.equal(classifyCommand('gh pr list'), 'other');
  assert.equal(classifyCommand('gh pr view 12'), 'other');
  assert.equal(classifyCommand('echo git commit'), 'other');
  assert.equal(classifyCommand('cat commit.txt'), 'other');
});

test('handles empty / junk input safely', () => {
  assert.equal(classifyCommand(''), 'other');
  assert.equal(classifyCommand('   '), 'other');
  // @ts-expect-error — defensive: non-string input must not throw.
  assert.equal(classifyCommand(undefined), 'other');
});

test('gh pr create wins over git commit in one chained command', () => {
  // Seen in the wild: one Bash call that commits, pushes and opens the PR. Stopping at the
  // first match classified it as a commit, and the PR opened without a block.
  const chained = [
    "git add a b && git commit -q -F - <<'EOF'",
    'fix: something',
    'EOF',
    "git push -q -u origin feature && gh pr create --title \"fix\" --body-file - <<'EOF'",
    'body',
    'EOF',
  ].join('\n');
  assert.equal(classifyCommand(chained), 'gh-pr-create');
  assert.equal(classifyCommand('git commit -m x && gh pr create'), 'gh-pr-create');
  assert.equal(classifyCommand('gh pr create && git commit -m x'), 'gh-pr-create');
  assert.equal(classifyCommand('git commit -m x && git push'), 'git-commit');
});
