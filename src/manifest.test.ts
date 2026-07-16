import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(root, rel), 'utf8'));

test('plugin manifest has the required fields', () => {
  const p = readJson('.claude-plugin/plugin.json');
  assert.equal(p.name, 'add-reasoning-to-prs');
  assert.equal(typeof p.description, 'string');
  assert.equal(typeof p.version, 'string');
});

test('marketplace manifest is valid and lists the plugin at ./', () => {
  const m = readJson('.claude-plugin/marketplace.json') as {
    name: string;
    plugins: Array<Record<string, unknown>>;
  };
  assert.equal(typeof m.name, 'string');
  assert.ok(Array.isArray(m.plugins) && m.plugins.length >= 1);
  const plugin = m.plugins[0];
  assert.equal(plugin.name, 'add-reasoning-to-prs');
  assert.equal(plugin.source, './');
  assert.equal(plugin.license, 'MIT');
});

test('the plugin hook registers PreToolUse/Bash against the bundled bin', () => {
  const hooks = readJson('hooks/hooks.json') as {
    hooks: { PreToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> };
  };
  const entry = hooks.hooks.PreToolUse[0];
  assert.equal(entry.matcher, 'Bash');
  assert.match(entry.hooks[0].command, /CLAUDE_PLUGIN_ROOT.*dist-bundle\/add-reasoning-to-prs\.js.*hook/);
});
