#!/usr/bin/env node
// The `add-reasoning-to-prs` bin entrypoint. Kept thin: it dispatches argv through the
// pure `run` function (unit-tested without spawning a process) and maps the result to an
// exit code. esbuild bundles THIS file into the single self-contained
// dist-bundle/add-reasoning-to-prs.js that the Claude Code plugin and `npx` invoke.
//
// FAIL-OPEN posture: this tool must NEVER disrupt the user's git workflow, so a thrown
// error degrades to a clean exit 0 rather than surfacing a crash to the caller.
import { run } from '../cli.js';

run(process.argv)
  .then((code) => process.exit(code))
  .catch(() => process.exit(0));
