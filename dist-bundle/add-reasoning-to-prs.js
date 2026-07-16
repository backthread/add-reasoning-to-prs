#!/usr/bin/env node

// src/version.ts
var VERSION = "0.1.0" ? "0.1.0" : readPackageVersion();

// src/stdin.ts
async function readRawStdin(env = process.env, stdin = process.stdin) {
  const fromEnv = env.ADD_REASONING_TO_PRS_HOOK_INPUT;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv;
  if (stdin.isTTY) return "";
  return new Promise((resolve) => {
    let data = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => data += chunk);
    stdin.on("end", () => resolve(data));
    stdin.on("error", () => resolve(data));
  });
}

// src/command.ts
import { basename } from "node:path";
var SEGMENT_SPLIT = /&&|\|\||[;\n|&]/;
var GIT_GLOBAL_OPTS_WITH_VALUE = /* @__PURE__ */ new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path"
]);
function classifyCommand(command) {
  if (typeof command !== "string" || command.trim().length === 0) return "other";
  for (const segment of command.split(SEGMENT_SPLIT)) {
    const kind = classifySegment(segment);
    if (kind !== "other") return kind;
  }
  return "other";
}
function classifySegment(segment) {
  const tokens = segment.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]) || tokens[i] === "env")) {
    i++;
  }
  if (i >= tokens.length) return "other";
  const prog = basename(tokens[i]);
  if (prog === "git") {
    for (let j = i + 1; j < tokens.length; j++) {
      const t = tokens[j];
      if (t.startsWith("-")) {
        if (GIT_GLOBAL_OPTS_WITH_VALUE.has(t)) j++;
        continue;
      }
      return t === "commit" ? "git-commit" : "other";
    }
    return "other";
  }
  if (prog === "gh") {
    const words = tokens.slice(i + 1).filter((t) => !t.startsWith("-"));
    return words[0] === "pr" && words[1] === "create" ? "gh-pr-create" : "other";
  }
  return "other";
}

// src/marker.ts
var MARKER_TOKEN = "backthread:why";
var PR_MARKER_OPEN = "<!-- backthread:why -->";
var PR_MARKER_CLOSE = "<!-- /backthread:why -->";
var COMMIT_MARKER_OPEN = "--- backthread:why ---";
var COMMIT_MARKER_CLOSE = "--- backthread:why end ---";
function hasMarker(text) {
  if (typeof text !== "string" || text.length === 0) return false;
  return text.includes(MARKER_TOKEN);
}

// src/git.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var pexec = promisify(execFile);
async function git(args, cwd) {
  try {
    const { stdout } = await pexec("git", args, { cwd, timeout: 3e3, windowsHide: true });
    return stdout.trim();
  } catch {
    return null;
  }
}
async function currentBranch(cwd) {
  return git(["symbolic-ref", "--quiet", "--short", "HEAD"], cwd);
}
async function defaultBranch(cwd) {
  const head = await git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], cwd);
  if (head) return head.replace(/^origin\//, "");
  return null;
}
async function isDefaultBranch(cwd) {
  const current = await currentBranch(cwd);
  if (!current) return false;
  const def = await defaultBranch(cwd);
  if (def) return current === def;
  return current === "main" || current === "master";
}

// src/guidance.ts
function surfaceCopy(surface) {
  if (surface === "pr") {
    return {
      open: PR_MARKER_OPEN,
      close: PR_MARKER_CLOSE,
      moment: "this pull request is opened",
      where: "the pull request description (the --body / --body-file text)"
    };
  }
  return {
    open: COMMIT_MARKER_OPEN,
    close: COMMIT_MARKER_CLOSE,
    moment: "this commit lands on the default branch",
    where: "the commit message body"
  };
}
function buildGuidance(surface) {
  const c = surfaceCopy(surface);
  return `add-reasoning-to-prs: before ${c.moment}, add a short, forward-only "why" block to ${c.where}, then re-run the command.

Compose the block ONLY from what you actually decided in THIS session \u2014 never invent. Include only the sections that genuinely apply, and drop any that don't:

- Decisions \u2014 the choices you made and why (not what changed; the diff already shows that).
- Assumptions \u2014 what you took as given that a reviewer should confirm.
- Trade-offs \u2014 what you knowingly gave up, and the alternative you rejected.
- Limitations \u2014 known gaps, risks, or follow-ups you're deliberately deferring.

Rules:
- Forward-only: capture what the diff can't show \u2014 the why, and the risks knowingly taken. Never summarize the changes.
- Grounded: every line must trace to real deliberation in this session. Cut anything padded, generic, or inferred.
- If the session had no genuine decisions to record, that's fine \u2014 leave it out rather than manufacture filler.
- Keep it tight: a few lines per section at most.
- Wrap the block EXACTLY between these two markers so it is detected and left untouched on later runs:

${c.open}
Decisions:
- <one concise line per decision>
Trade-offs:
- <...>
${c.close}

Then re-run your original command with the block included in ${c.where}.`;
}

// src/hook.ts
async function runHook(rawStdin, deps = {}) {
  try {
    let payload;
    try {
      payload = JSON.parse(rawStdin);
    } catch {
      return {};
    }
    const rec = payload && typeof payload === "object" ? payload : {};
    if (rec.tool_name !== void 0 && rec.tool_name !== "Bash") return {};
    const toolInput = rec.tool_input;
    const command = toolInput && typeof toolInput === "object" ? toolInput.command : void 0;
    if (typeof command !== "string" || command.trim().length === 0) return {};
    const kind = classifyCommand(command);
    if (kind === "other") return {};
    if (hasMarker(command)) return {};
    const cwd = typeof rec.cwd === "string" && rec.cwd ? rec.cwd : deps.cwd ?? process.cwd();
    let surface;
    if (kind === "gh-pr-create") {
      surface = "pr";
    } else {
      const onDefault = await (deps.isDefaultBranchImpl ?? isDefaultBranch)(cwd).catch(() => false);
      if (!onDefault) return {};
      surface = "commit";
    }
    const guidance = buildGuidance(surface);
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: guidance,
        // Progressive enhancement. Claude Code exposes no version signal to hooks, so we
        // always emit additionalContext too: newer versions surface it, older ones ignore
        // the unknown field, and the reason above carries the guidance either way.
        additionalContext: guidance
      }
    };
  } catch {
    return {};
  }
}

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
  if (cmd === "hook") {
    const raw = await readRawStdin();
    const out = await runHook(raw);
    process.stdout.write(JSON.stringify(out));
    return 0;
  }
  process.stdout.write(help());
  return 0;
}

// src/bin/add-reasoning-to-prs.ts
run(process.argv).then((code) => process.exit(code)).catch(() => process.exit(0));
