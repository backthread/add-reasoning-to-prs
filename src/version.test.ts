import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { VERSION } from './version.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(root, rel), 'utf8'));

test('VERSION matches package.json', () => {
  assert.equal(VERSION, readJson('package.json').version);
});

// Version lockstep: the Claude Code plugin manifest ships alongside the package, so its
// version must track package.json. CI runs this; a release bumps both together.
test('plugin manifest version is in lockstep with package.json', () => {
  const pkg = readJson('package.json');
  const plugin = readJson('.claude-plugin/plugin.json');
  assert.equal(
    plugin.version,
    pkg.version,
    'update .claude-plugin/plugin.json "version" to match package.json',
  );
});
