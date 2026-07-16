import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './cli.js';
import { VERSION } from './version.js';

/** Run `fn` with process.stdout.write captured, returning the exit code + written text. */
async function withCapturedStdout(
  fn: () => Promise<number>,
): Promise<{ code: number; out: string }> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

test('no args prints usage and exits 0', async () => {
  const { code, out } = await withCapturedStdout(() => run(['node', 'bin']));
  assert.equal(code, 0);
  assert.match(out, /add-reasoning-to-prs/);
  assert.match(out, /Usage:/);
});

test('--help prints usage and exits 0', async () => {
  const { code, out } = await withCapturedStdout(() => run(['node', 'bin', '--help']));
  assert.equal(code, 0);
  assert.match(out, /Usage:/);
});
