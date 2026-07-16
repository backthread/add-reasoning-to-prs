// bodyFile.ts — find and read a body/message FILE passed to the command, so idempotency
// covers a block that lives in a file rather than inline in the command string.
//
// Handles the flags that read the PR body / commit message from a file:
//   gh pr create:  --body-file <f> | --body-file=<f> | -F <f> | -F=<f>
//   git commit:    -F <f> | --file <f> | --file=<f>
// A path of '-' (stdin) yields null — unreadable from here.

import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

const FILE_FLAGS = new Set(['--body-file', '--file', '-F']);

// A message/body file is small; refuse to read anything larger so a pathological path
// can't stall the (synchronous) hook.
const MAX_BODY_FILE_BYTES = 1_000_000;

function unquote(s: string): string {
  const t = s.trim();
  if (
    t.length >= 2 &&
    ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

/** The path of a body/message file passed to the command, or null if none. */
export function extractBodyFilePath(command: string): string | null {
  if (typeof command !== 'string') return null;
  const tokens = command.split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const eq = t.indexOf('=');
    if (eq > 0) {
      // --flag=value
      if (FILE_FLAGS.has(t.slice(0, eq))) {
        const val = unquote(t.slice(eq + 1));
        return val && val !== '-' ? val : null;
      }
      continue;
    }
    // --flag value
    if (FILE_FLAGS.has(t)) {
      const val = unquote(tokens[i + 1] ?? '');
      return val && val !== '-' ? val : null;
    }
  }
  return null;
}

/**
 * Read a body/message file's contents, resolved relative to the command's cwd. Returns
 * '' when the file is missing, too large, or unreadable — the caller treats that as "no
 * marker found" (so it proceeds to inject; never a crash). Never throws.
 */
export async function readBodyFile(path: string, cwd: string): Promise<string> {
  try {
    const full = isAbsolute(path) ? path : resolve(cwd, path);
    const s = await stat(full);
    if (!s.isFile() || s.size > MAX_BODY_FILE_BYTES) return '';
    return await readFile(full, 'utf8');
  } catch {
    return '';
  }
}
