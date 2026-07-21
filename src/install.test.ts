import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInstall, installedBinPath } from './install.js';

async function fixture() {
  const claude = await mkdtemp(join(tmpdir(), 'arp-claude-'));
  const state = await mkdtemp(join(tmpdir(), 'arp-inst-'));
  const srcDir = await mkdtemp(join(tmpdir(), 'arp-src-'));
  const source = join(srcDir, 'bundle.js');
  await writeFile(source, '#!/usr/bin/env node\n// a stand-in bundle\n');
  const logs: string[] = [];
  const env = { CLAUDE_CONFIG_DIR: claude, ADD_REASONING_TO_PRS_STATE_DIR: state };
  return { claude, state, source, env, logs, log: (m: string) => logs.push(m) };
}

const settingsOf = async (claude: string) =>
  JSON.parse(await readFile(join(claude, 'settings.json'), 'utf8'));

test('install copies the bundle and adds the PreToolUse/Bash hook', async () => {
  const f = await fixture();
  const code = await runInstall({ env: f.env, sourceBinPath: f.source, log: f.log });
  assert.equal(code, 0);
  // The self-contained bundle is copied to a stable path.
  assert.match(await readFile(installedBinPath(f.env), 'utf8'), /stand-in bundle/);
  // settings.json gains our hook.
  const pre = (await settingsOf(f.claude)).hooks.PreToolUse;
  assert.equal(pre.length, 1);
  assert.equal(pre[0].matcher, 'Bash');
  assert.match(pre[0].hooks[0].command, /add-reasoning-to-prs\.js" hook$/);
  // The hosted-version note is printed.
  assert.match(f.logs.join('\n'), /https:\/\/backthread\.dev\s+\(the hosted upgrade\)/);
});

test('install is idempotent (a second run does not duplicate the hook)', async () => {
  const f = await fixture();
  await runInstall({ env: f.env, sourceBinPath: f.source, log: () => {} });
  await runInstall({ env: f.env, sourceBinPath: f.source, log: () => {} });
  assert.equal((await settingsOf(f.claude)).hooks.PreToolUse.length, 1);
});

test('install preserves existing settings and other hooks', async () => {
  const f = await fixture();
  await mkdir(f.claude, { recursive: true });
  await writeFile(
    join(f.claude, 'settings.json'),
    JSON.stringify({
      model: 'opus',
      hooks: { PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'echo hi' }] }] },
    }),
  );
  await runInstall({ env: f.env, sourceBinPath: f.source, log: () => {} });
  const s = await settingsOf(f.claude);
  assert.equal(s.model, 'opus'); // untouched
  assert.equal(s.hooks.PreToolUse.length, 2); // existing + ours
  assert.ok(s.hooks.PreToolUse.some((e: { matcher: string }) => e.matcher === 'Read'));
  assert.ok(
    s.hooks.PreToolUse.some((e: { hooks: { command: string }[] }) =>
      e.hooks[0].command.includes('add-reasoning-to-prs'),
    ),
  );
});

test('install refuses to clobber an unparseable settings.json', async () => {
  const f = await fixture();
  await mkdir(f.claude, { recursive: true });
  await writeFile(join(f.claude, 'settings.json'), '{ not valid json ');
  const code = await runInstall({ env: f.env, sourceBinPath: f.source, log: f.log });
  assert.equal(code, 1);
  assert.equal(await readFile(join(f.claude, 'settings.json'), 'utf8'), '{ not valid json ');
});
