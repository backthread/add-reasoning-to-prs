#!/usr/bin/env node

// src/version.ts
var VERSION = "0.1.0" ? "0.1.0" : readPackageVersion();

// src/cli.ts
function help() {
  return `add-reasoning-to-prs ${VERSION}

A Claude Code hook that writes a forward-only "why" block \u2014 the decisions, trade-offs,
assumptions, and limitations behind a change \u2014 into your PR description (or your commit
message on a direct push) at the moment the PR is opened.

Usage:
  add-reasoning-to-prs --version    Print the version and exit
  add-reasoning-to-prs --help       Show this help

Install into Claude Code:
  npx add-reasoning-to-prs
`;
}
async function run(argv) {
  const args = argv.slice(2);
  const cmd = args[0];
  if (cmd === "--version" || cmd === "-v" || cmd === "version") {
    process.stdout.write(VERSION + "\n");
    return 0;
  }
  process.stdout.write(help());
  return 0;
}

// src/bin/add-reasoning-to-prs.ts
run(process.argv).then((code) => process.exit(code)).catch(() => process.exit(0));
