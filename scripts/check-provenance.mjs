#!/usr/bin/env node
// Guard: every `npm publish` this repo can perform must carry `--provenance`, so each published
// package always ships a verifiable, tamper-evident build attestation.
//
// This replaces a one-line grep that could not fail, and then could still be fooled four ways.
// The history is worth keeping, because each step is a lesson about what a guard actually checks:
//
//   1. `grep -Eq 'npm publish[^#]*--provenance' "$wf"` — `[^#]*` forbids a `#` BETWEEN the tokens
//      but not BEFORE them, and both release workflows contain a comment reading "`npm publish
//      --provenance` with Cannot find module sigstore". That comment satisfied the pattern
//      unconditionally, so the check could not fail at all. Measured: deleting `--provenance`
//      from the real publish step left it green.
//   2. Anchoring at `^[^#]*` fixed that, and left four holes, all measured:
//        • a step `name:` carrying the tokens satisfied it while the `run:` below dropped the flag
//          — the original defect one line up;
//        • `--provenance=false` passed, because a substring is not a value;
//        • a SECOND publish step with no flag passed, because `grep -q` stops at the first hit;
//        • renaming `release-extractor.yml` to `publish-extractor.yml` escaped the glob entirely,
//          which is exactly what the old comment claimed could not happen.
//
// So it is checked as a closed allowlist over EVERY workflow, not a glob over the ones we
// remember: find every `npm publish` in `.github/workflows/*.yml`, on a `run:` line only, and
// require each one to carry `--provenance` with no falsy value. A publish outside a `release*.yml`
// is refused outright rather than silently unguarded.
//
// Dependency-free: it runs in the CI job that does no install.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_DIR = join(ROOT, '.github/workflows');

let failed = false;
function error(message) {
  console.error(`::error::${message}`);
  failed = true;
}

/**
 * Strip a YAML comment from a line, tracking quotes so a `#` inside a string survives.
 * A commented-out publish step is not a publish step, and must not be able to satisfy — or to
 * trip — this guard.
 */
function withoutComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Whether this line is executable shell rather than YAML metadata. A step's `name:` is prose and
 * must never be able to satisfy the guard on behalf of the `run:` beneath it; inside a `run: |`
 * block every line is shell, so the block is tracked by indentation.
 */
function executableLines(text) {
  const out = [];
  let blockIndent = null;
  for (const raw of text.split('\n')) {
    const line = withoutComment(raw);
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    if (blockIndent !== null) {
      if (indent > blockIndent) {
        out.push(line);
        continue;
      }
      blockIndent = null;
    }
    const runBlock = line.match(/^(\s*)-?\s*run:\s*[|>][-+]?\s*$/);
    if (runBlock) {
      blockIndent = runBlock[1].length;
      continue;
    }
    const runInline = line.match(/^\s*-?\s*run:\s*(.+)$/);
    if (runInline) out.push(runInline[1]);
  }
  return out;
}

/**
 * A shell line with quoted string CONTENTS removed, so prose cannot be mistaken for a command.
 * `echo "::group::Every npm publish keeps provenance on"` is not a publish step, and an earlier
 * version of this guard failed its own repo on exactly that line — a guard that cries wolf gets
 * switched off, which is the same outcome as one that cannot fail.
 */
function withoutQuotedStrings(line) {
  let out = '';
  let quote = null;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    out += ch;
  }
  return out;
}

const workflows = readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f));
if (workflows.length === 0) {
  error('.github/workflows contains no workflow files — refusing to report a vacuous pass');
}

let publishSteps = 0;
for (const file of workflows) {
  const text = readFileSync(join(WORKFLOW_DIR, file), 'utf8');
  for (const rawLine of executableLines(text)) {
    const line = withoutQuotedStrings(rawLine);
    if (!/\bnpm publish\b/.test(line)) continue;
    publishSteps++;
    if (!/^release/.test(file)) {
      error(
        `.github/workflows/${file} runs \`npm publish\` but is not a release*.yml — publish paths ` +
          'must be named release*.yml so every guard that globs them applies here too',
      );
    }
    if (!/--provenance(?![=\w])/.test(line) && !/--provenance=true\b/.test(line)) {
      error(
        `.github/workflows/${file}: this \`npm publish\` does not carry \`--provenance\` (or sets ` +
          `it falsy), so the package would ship without a build attestation:\n    ${rawLine.trim()}`,
      );
    }
  }
}

// A release workflow that publishes nothing is fine; ZERO publish steps across the whole repo is
// not something to silently pass, because it means this guard verified nothing.
if (publishSteps === 0) {
  error(
    'found no `npm publish` in any workflow. If publishing moved, point this guard at the new ' +
      'path; do not leave it passing over nothing.',
  );
}

if (failed) process.exit(1);
console.log(`OK — all ${publishSteps} \`npm publish\` step(s) carry --provenance, and all live in release*.yml`);
