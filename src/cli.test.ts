import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './cli.js';
import { VERSION } from './version.js';

/** Run `fn` with process.stdout.write captured, returning the exit code + written text. */
async function withCapturedStdout(
  fn: () => Promise<number>,
): Promise<{ code: number; out: string }> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as unknown as { write: (c: unknown) => boolean }).write = (c: unknown) => {
    chunks.push(String(c));
    return true;
  };
  try {
    const code = await fn();
    return { code, out: chunks.join('') };
  } finally {
    process.stdout.write = orig;
  }
}

test('--version prints the version and exits 0', async () => {
  const { code, out } = await withCapturedStdout(() => run(['node', 'bin', '--version']));
  assert.equal(code, 0);
  assert.equal(out.trim(), VERSION);
});

test('-v is an alias for --version', async () => {
  const { code, out } = await withCapturedStdout(() => run(['node', 'bin', '-v']));
  assert.equal(code, 0);
  assert.equal(out.trim(), VERSION);
});

test('--help prints usage and exits 0', async () => {
  const { code, out } = await withCapturedStdout(() => run(['node', 'bin', '--help']));
  assert.equal(code, 0);
  assert.match(out, /Usage:/);
});

test('no args runs install (writes the PreToolUse hook into settings.json)', async () => {
  // The bare `npx add-reasoning-to-prs` installs. run() reads process.env, so isolate the
  // config + state dirs to temp locations and restore them afterward.
  const claude = await mkdtemp(join(tmpdir(), 'arp-claude-'));
  const state = await mkdtemp(join(tmpdir(), 'arp-inst-'));
  const prev = {
    c: process.env.CLAUDE_CONFIG_DIR,
    s: process.env.ADD_REASONING_TO_PRS_STATE_DIR,
  };
  process.env.CLAUDE_CONFIG_DIR = claude;
  process.env.ADD_REASONING_TO_PRS_STATE_DIR = state;
  try {
    const { code } = await withCapturedStdout(() => run(['node', 'bin']));
    assert.equal(code, 0);
    const settings = await readFile(join(claude, 'settings.json'), 'utf8');
    assert.match(settings, /add-reasoning-to-prs/);
    assert.match(settings, /PreToolUse/);
  } finally {
    if (prev.c === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prev.c;
    if (prev.s === undefined) delete process.env.ADD_REASONING_TO_PRS_STATE_DIR;
    else process.env.ADD_REASONING_TO_PRS_STATE_DIR = prev.s;
  }
});
