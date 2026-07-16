#!/usr/bin/env node

// src/version.ts
var VERSION = "0.1.0" ? "0.1.0" : readPackageVersion();

// src/stdin.ts
async function readRawStdin(env = process.env, stdin = process.stdin) {
  const fromEnv = env.ADD_REASONING_TO_PRS_HOOK_INPUT;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv;
  if (stdin.isTTY) return "";
  return new Promise((resolve2) => {
    let data = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => data += chunk);
    stdin.on("end", () => resolve2(data));
    stdin.on("error", () => resolve2(data));
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
async function branchInfo(cwd) {
  const current = await currentBranch(cwd);
  if (!current) return { current: null, isDefault: false };
  const def = await defaultBranch(cwd);
  const isDefault = def ? current === def : current === "main" || current === "master";
  return { current, isDefault };
}

// src/bodyFile.ts
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
var FILE_FLAGS = /* @__PURE__ */ new Set(["--body-file", "--file", "-F"]);
var MAX_BODY_FILE_BYTES = 1e6;
function shellSplit(command) {
  const tokens = [];
  let cur = "";
  let quote = null;
  let started = false;
  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      started = true;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) {
        tokens.push(cur);
        cur = "";
        started = false;
      }
    } else {
      cur += ch;
      started = true;
    }
  }
  if (started) tokens.push(cur);
  return tokens;
}
function extractBodyFilePath(command) {
  if (typeof command !== "string") return null;
  const tokens = shellSplit(command);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const eq = t.indexOf("=");
    if (eq > 0 && t.startsWith("-")) {
      if (FILE_FLAGS.has(t.slice(0, eq))) {
        const val = t.slice(eq + 1);
        return val && val !== "-" ? val : null;
      }
      continue;
    }
    if (FILE_FLAGS.has(t)) {
      const val = tokens[i + 1] ?? "";
      return val && val !== "-" ? val : null;
    }
  }
  return null;
}
async function readBodyFile(path, cwd) {
  try {
    const full = isAbsolute(path) ? path : resolve(cwd, path);
    const s = await stat(full);
    if (!s.isFile() || s.size > MAX_BODY_FILE_BYTES) return "";
    return await readFile(full, "utf8");
  } catch {
    return "";
  }
}

// src/repoConfig.ts
import { execFile as execFile2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
var pexec2 = promisify2(execFile2);
var SKIP_TOKEN = "[skip-why]";
function envTrue(v) {
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}
async function isDisabled(cwd, env = process.env) {
  if (envTrue(env.ADD_REASONING_TO_PRS_DISABLE)) return true;
  try {
    const { stdout } = await pexec2(
      "git",
      ["config", "--get", "add-reasoning-to-prs.disabled"],
      { cwd, timeout: 3e3, windowsHide: true }
    );
    return envTrue(stdout);
  } catch {
    return false;
  }
}
function isSkipped(command, env = process.env) {
  if (envTrue(env.ADD_REASONING_TO_PRS_SKIP)) return true;
  return typeof command === "string" && command.includes(SKIP_TOKEN);
}

// src/promptState.ts
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile as readFile2, writeFile, mkdir, chmod } from "node:fs/promises";
var DIR_MODE = 448;
var FILE_MODE = 384;
var MAX_KEYS = 500;
function stateDir(env = process.env) {
  const override = env.ADD_REASONING_TO_PRS_STATE_DIR;
  return override && override.trim().length > 0 ? override : join(homedir(), ".add-reasoning-to-prs");
}
function statePath(env) {
  return join(stateDir(env), "prompted");
}
function promptKey(sessionId, surface, branch) {
  return `${sessionId ?? "no-session"}::${surface}::${branch ?? "no-branch"}`;
}
async function hasPrompted(key, env = process.env) {
  try {
    const raw = await readFile2(statePath(env), "utf8");
    return raw.split("\n").some((line) => line.trim() === key);
  } catch (e) {
    return e?.code === "ENOENT" ? false : true;
  }
}
async function markPrompted(key, env = process.env) {
  try {
    const dir = stateDir(env);
    await mkdir(dir, { recursive: true, mode: DIR_MODE });
    let keys = [];
    try {
      const raw = await readFile2(statePath(env), "utf8");
      keys = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    } catch {
    }
    if (keys.includes(key)) return true;
    keys.push(key);
    if (keys.length > MAX_KEYS) keys = keys.slice(keys.length - MAX_KEYS);
    const path = statePath(env);
    await writeFile(path, keys.join("\n") + "\n", { mode: FILE_MODE });
    await chmod(path, FILE_MODE).catch(() => {
    });
    return true;
  } catch {
    return false;
  }
}

// src/template.ts
var PRIMITIVES = ["decisions", "assumptions", "tradeoffs", "limitations"];
var HEADINGS = {
  decisions: "Decisions",
  assumptions: "Assumptions",
  tradeoffs: "Trade-offs",
  limitations: "Limitations"
};
function delimiters(surface) {
  return surface === "pr" ? { open: PR_MARKER_OPEN, close: PR_MARKER_CLOSE } : { open: COMMIT_MARKER_OPEN, close: COMMIT_MARKER_CLOSE };
}
function clean(items) {
  if (!Array.isArray(items)) return [];
  return items.map((s) => typeof s === "string" ? s.trim() : "").filter(Boolean);
}
function isEmptyBlock(p) {
  return PRIMITIVES.every((k) => clean(p[k]).length === 0);
}
function renderBlock(surface, p) {
  if (isEmptyBlock(p)) return "";
  const { open, close } = delimiters(surface);
  const isPr = surface === "pr";
  const lines = [open];
  for (const key of PRIMITIVES) {
    const items = clean(p[key]);
    if (items.length === 0) continue;
    lines.push(isPr ? `**${HEADINGS[key]}**` : `${HEADINGS[key]}:`);
    for (const item of items) lines.push(`- ${item}`);
    if (isPr) lines.push("");
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  lines.push(close);
  return lines.join("\n");
}

// src/guidance.ts
function surfaceCopy(surface) {
  return surface === "pr" ? {
    moment: "this pull request is opened",
    where: "the pull request description (the --body / --body-file text)"
  } : {
    moment: "this commit lands on the default branch",
    where: "the commit message body"
  };
}
function exampleBlock(surface) {
  const placeholder = ["<one concise line \u2014 omit this whole section if it does not apply>"];
  return renderBlock(surface, {
    decisions: placeholder,
    assumptions: placeholder,
    tradeoffs: placeholder,
    limitations: placeholder
  });
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
- Keep it tight: a few lines per section at most.
- Wrap the block EXACTLY between the two markers below so it is detected and left untouched on later runs:

${exampleBlock(surface)}

Self-check BEFORE you write \u2014 a quick grounded pass, no tools or network needed:
- Take each candidate line and name the specific point in THIS session where that decision, assumption, trade-off, or limitation actually came up. If you can't point to one, delete the line.
- Delete anything that just restates the diff ("added X", "refactored Y") without a why, and any generic filler ("improves code quality", "various cleanups").
- Whatever survives is the block. If NOTHING survives, there is no block to add: re-run your original command unchanged, or add ${SKIP_TOKEN} to it to opt out explicitly. Never manufacture filler to fill the template \u2014 an empty block is the correct outcome for a session that didn't deliberate.

Otherwise, re-run your original command with the surviving block included in ${c.where}.`;
}

// src/hook.ts
function deny(surface) {
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
}
async function runHook(rawStdin, deps = {}) {
  const env = deps.env ?? process.env;
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
    if (isSkipped(command, env)) return {};
    const cwd = typeof rec.cwd === "string" && rec.cwd ? rec.cwd : deps.cwd ?? process.cwd();
    if (hasMarker(command)) return {};
    const bodyFilePath = extractBodyFilePath(command);
    if (bodyFilePath && hasMarker(await readBodyFile(bodyFilePath, cwd))) return {};
    if (await (deps.isDisabledImpl ?? isDisabled)(cwd, env)) return {};
    const info = await (deps.branchInfoImpl ?? branchInfo)(cwd).catch(() => ({
      current: null,
      isDefault: false
    }));
    let surface;
    if (kind === "gh-pr-create") {
      surface = "pr";
    } else {
      if (!info.isDefault) return {};
      surface = "commit";
    }
    const sessionId = typeof rec.session_id === "string" ? rec.session_id : void 0;
    const key = promptKey(sessionId, surface, info.current);
    if (await hasPrompted(key, env)) return {};
    if (!await markPrompted(key, env)) return {};
    return deny(surface);
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
