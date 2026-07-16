// version.ts — the package version, embedded at BUILD time.
//
// The published bin is a single self-contained esbuild bundle; a runtime read of
// package.json from inside that bundle is unreliable (its on-disk neighbour depends on
// how the package was installed). So esbuild `define`s __PKG_VERSION__ from package.json
// at bundle time (see esbuild.config.mjs). The dev/tsx path (no bundle, no define) falls
// back to reading package.json relative to this module.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Replaced by esbuild `define` in the bundled bin. Undeclared on the dev/tsx path — but
// `typeof` on an undeclared identifier is safe (yields 'undefined', never throws).
declare const __PKG_VERSION__: string;

function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // dev/tsx layout: src/version.ts -> ../package.json
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
      version?: unknown;
    };
    if (typeof pkg.version === 'string' && pkg.version) return pkg.version;
  } catch {
    // fall through to the sentinel below
  }
  return '0.0.0';
}

export const VERSION: string =
  typeof __PKG_VERSION__ === 'string' && __PKG_VERSION__ ? __PKG_VERSION__ : readPackageVersion();
