// esbuild.config.mjs — the self-contained distribution build.
//
// `npm run build` (tsc) is the DEV / typecheck path: it emits the multi-file `dist/`.
// This script is the DISTRIBUTION path: it bundles the `add-reasoning-to-prs` bin into a
// SINGLE self-contained ESM file at `dist-bundle/add-reasoning-to-prs.js` that runs with
// NO `npm install`. That artifact is what the Claude Code plugin references via
// `${CLAUDE_PLUGIN_ROOT}` and what `npx add-reasoning-to-prs` executes.
//
// The bin has ZERO runtime dependencies (the why-block is composed by the live agent in
// the session; the hook itself is pure Node string/JSON work), so there is nothing heavy
// to tree-shake — Node builtins stay external and the bundle is small.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

// Inline the package version at BUILD time so the bundled bin reports it correctly. A
// RUNTIME package.json read is unreliable from a self-contained bundle (its on-disk
// neighbour depends on how the package was installed), so we `define` it as a compile-
// time constant (version.ts has a dev/tsx fallback for the non-bundled path).
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/bin/add-reasoning-to-prs.ts'],
  outfile: 'dist-bundle/add-reasoning-to-prs.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  // Match the package's Node 22 pin (engines).
  target: 'node22',
  // Inline the package version (read above) so the bundled bin reports it correctly.
  define: { __PKG_VERSION__: JSON.stringify(version) },
  // No banner: src/bin/add-reasoning-to-prs.ts already starts with `#!/usr/bin/env node`,
  // and esbuild preserves a leading entry-point shebang on line 1. A banner would
  // duplicate it onto line 2 and break execution.
  legalComments: 'none',
  logLevel: 'info',
});
