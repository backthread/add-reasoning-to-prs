import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractBodyFilePath, readBodyFile } from './bodyFile.js';
import { PR_MARKER_OPEN } from './marker.js';

test('extracts a body/message file path across the flag forms', () => {
  assert.equal(extractBodyFilePath('gh pr create --body-file notes.md'), 'notes.md');
  assert.equal(extractBodyFilePath('gh pr create --body-file=notes.md'), 'notes.md');
  assert.equal(extractBodyFilePath('gh pr create -F notes.md'), 'notes.md');
  assert.equal(extractBodyFilePath('git commit -F msg.txt'), 'msg.txt');
  assert.equal(extractBodyFilePath('git commit --file msg.txt'), 'msg.txt');
  assert.equal(extractBodyFilePath('git commit --file=msg.txt'), 'msg.txt');
  assert.equal(extractBodyFilePath("gh pr create --body-file 'notes.md'"), 'notes.md');
  // Quoted path containing spaces survives as one token (both flag forms).
  assert.equal(extractBodyFilePath('gh pr create --body-file "my notes.md"'), 'my notes.md');
  assert.equal(extractBodyFilePath('gh pr create --body-file="my notes.md"'), 'my notes.md');
});

test('does not treat a non-flag VAR=value token as a file flag', () => {
  assert.equal(extractBodyFilePath('FOO=bar git commit -m x'), null);
});

test('returns null when there is no file (inline body, or stdin "-")', () => {
  assert.equal(extractBodyFilePath('gh pr create --body "inline"'), null);
  assert.equal(extractBodyFilePath('git commit -m "inline"'), null);
  assert.equal(extractBodyFilePath('git commit -F -'), null);
  assert.equal(extractBodyFilePath(''), null);
});

test('readBodyFile reads contents, and degrades to "" on a missing file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'arp-body-'));
  const file = join(dir, 'notes.md');
  await writeFile(file, `Body\n${PR_MARKER_OPEN}\nDecisions:\n- x\n`, 'utf8');
  const contents = await readBodyFile('notes.md', dir);
  assert.match(contents, /backthread:why/);
  assert.equal(await readBodyFile('does-not-exist.md', dir), '');
});
