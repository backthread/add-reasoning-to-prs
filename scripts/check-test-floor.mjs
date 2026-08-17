#!/usr/bin/env node
// Guard: the suite must report at least `--min` PASSING tests.
//
// Why a count and not just the exit code: the test script runs with
// `--experimental-test-isolation=none` (see .github/workflows/ci.yml), and that mode SWALLOWS a
// module-level throw once any test in the file has registered — the run exits 0 with `# fail 0`
// and quietly reports fewer tests. `npm test` is happy, the gate is green, and tests have stopped
// running. A floor is the only thing that separates "everything passed" from "less of it ran".
// `node --test` also exits 0 when its glob matches nothing, so a rename under `src/` would
// otherwise turn the job into a green tick over an empty room.
//
// FAIL-CLOSED: a missing, unreadable or unparsable log is a failure, never a pass. "I could not
// tell" and "it passed" must not share an exit code.
//
// Usage:  node scripts/check-test-floor.mjs --min=<n> <path-to-test-output>

import { readFileSync } from 'node:fs';

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const minArg = args.find((a) => a.startsWith('--min='));
const outputPath = args.find((a) => !a.startsWith('--'));
if (!minArg || !outputPath) fail('usage: check-test-floor.mjs --min=<n> <output-file>');

const min = Number(minArg.slice('--min='.length));
if (!Number.isInteger(min) || min < 1) fail(`--min must be a positive integer, got "${minArg}"`);

let output;
try {
  output = readFileSync(outputPath, 'utf8');
} catch {
  fail(`could not read the test output at ${outputPath} — refusing to assume the suite passed`);
}

const passes = [...output.matchAll(/^# pass (\d+)$/gm)].map((m) => Number(m[1]));
if (passes.length === 0) {
  fail(
    `found no \`# pass N\` line in ${outputPath} — the suite did not report, so this gate cannot ` +
      'say anything about it. If the runner renamed its summary, fix this script; do not drop it.',
  );
}
const total = passes.reduce((a, b) => a + b, 0);

if (total < min) {
  fail(
    `the suite reported ${total} passing test(s), below its floor of ${min}. Either tests stopped ` +
      'running (a module-level throw is swallowed silently in this mode, and an unmatched glob ' +
      'exits 0) or they were removed deliberately — in which case lower the floor here and say why.',
  );
}

console.log(`OK — ${total} passing test(s), floor ${min}`);
