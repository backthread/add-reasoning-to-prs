#!/usr/bin/env node

// src/version.ts
var VERSION = "1.0.0" ? "1.0.0" : readPackageVersion();

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
async function repoRoot(cwd) {
  return git(["rev-parse", "--show-toplevel"], cwd);
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

// src/scratch.ts
import { createHash } from "node:crypto";
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";
import { readFile as readFile3, writeFile as writeFile2, mkdir as mkdir2, rm, chmod as chmod2 } from "node:fs/promises";

// src/critique.ts
var FILLER_PATTERNS = [
  /^(n\/?a|none|nil|tbd|todo|-{1,}|\.{1,})$/i,
  // One or more filler adjectives ("various", "minor", …) + a filler noun, whole-line.
  /^((various|minor|misc\.?|miscellaneous|small|some|general|other)\s+)+(changes?|improvements?|updates?|fixes|tweaks|edits|stuff|things)\.?$/i,
  /^(general\s+|misc\.?\s+)?clean(ed)?[\s-]*up\.?$/i,
  /^improve[sd]?\s+(the\s+)?code\s+quality\.?$/i,
  /^(made|make)\s+(the\s+)?code\s+(better|cleaner|nicer)\.?$/i,
  /^(better|cleaner|improved)\s+code\.?$/i,
  /^(code\s+)?(quality|cleanup|refactor(ing)?|polish)\.?$/i,
  /^no\s+(notable\s+)?(decisions?|changes?|deliberation)\.?$/i
];
var FOLLOWUP_FILLER_PATTERNS = [
  /^(add|write)\s+(more\s+|extra\s+|unit\s+|integration\s+)?tests?\.?$/i,
  /^(add|improve|better|more)\s+(the\s+)?(error[\s-]?handling|logging|validation|documentation|docs|comments?|monitoring|observability|metrics|telemetry|type\s+safety|test\s+coverage|coverage)\.?$/i,
  /^update\s+(the\s+)?(docs|documentation|readme)\.?$/i,
  /^(consider\s+|maybe\s+)?refactor(ing)?(\s+(this|it|later))?\.?$/i,
  /^(optimi[sz]e|clean\s*up|polish|revisit|monitor|review|simplify)(\s+(this|it|later|performance))?\.?$/i,
  /^(handle|cover)\s+(the\s+)?(remaining\s+)?edge\s+cases?\.?$/i,
  /^(add|set\s*up)\s+(monitoring|alerting|observability|metrics)\.?$/i,
  /^follow[\s-]?ups?\.?$/i
];
function debullet(line) {
  return line.replace(/^\s*[-*]\s*/, "").trim();
}
function isPadding(line) {
  const t = debullet(line);
  if (t.length === 0) return true;
  return FILLER_PATTERNS.some((re) => re.test(t));
}
function isPaddingFollowup(line) {
  if (isPadding(line)) return true;
  return FOLLOWUP_FILLER_PATTERNS.some((re) => re.test(debullet(line)));
}
function scrubLines(lines, isFiller = isPadding) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const raw of Array.isArray(lines) ? lines : []) {
    if (typeof raw !== "string") continue;
    if (isFiller(raw)) continue;
    const key = debullet(raw).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(debullet(raw));
  }
  return out;
}
function scrubFollowups(lines) {
  return scrubLines(lines, isPaddingFollowup);
}
function scrubPrimitives(p) {
  const out = {
    decisions: scrubLines(p.decisions ?? []),
    assumptions: scrubLines(p.assumptions ?? []),
    tradeoffs: scrubLines(p.tradeoffs ?? []),
    limitations: scrubLines(p.limitations ?? [])
  };
  if (p.followups !== void 0) out.followups = scrubFollowups(p.followups ?? []);
  return out;
}

// src/template.ts
var PRIMITIVES = ["decisions", "assumptions", "tradeoffs", "limitations"];
var PR_ONLY_PRIMITIVES = ["followups"];
var ALL_PRIMITIVES = [...PRIMITIVES, ...PR_ONLY_PRIMITIVES];
var HEADINGS = {
  decisions: "Decisions",
  assumptions: "Assumptions",
  tradeoffs: "Trade-offs",
  limitations: "Limitations",
  followups: "Recommended follow-ups"
};
function primitivesForSurface(surface) {
  return surface === "pr" ? ALL_PRIMITIVES : PRIMITIVES;
}
function delimiters(surface) {
  return surface === "pr" ? { open: PR_MARKER_OPEN, close: PR_MARKER_CLOSE } : { open: COMMIT_MARKER_OPEN, close: COMMIT_MARKER_CLOSE };
}
function clean(items) {
  if (!Array.isArray(items)) return [];
  return items.map((s) => typeof s === "string" ? s.trim() : "").filter(Boolean);
}
function isEmptyBlock(p) {
  return ALL_PRIMITIVES.every((k) => clean(p[k]).length === 0);
}
function renderBlock(surface, p) {
  const keys = primitivesForSurface(surface);
  if (keys.every((k) => clean(p[k]).length === 0)) return "";
  const { open, close } = delimiters(surface);
  const isPr = surface === "pr";
  const lines = [open];
  for (const key of keys) {
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

// src/scratch.ts
var DIR_MODE2 = 448;
var FILE_MODE2 = 384;
function scratchDir(env = process.env) {
  const override = env.ADD_REASONING_TO_PRS_STATE_DIR;
  const base = override && override.trim().length > 0 ? override : join2(homedir2(), ".add-reasoning-to-prs");
  return join2(base, "scratch");
}
function scratchPath(repoRoot2, branch, env) {
  const key = createHash("sha256").update(`${repoRoot2}
${branch}`).digest("hex").slice(0, 32);
  return join2(scratchDir(env), `${key}.json`);
}
function coercePrimitives(obj) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  const rec = obj;
  for (const key of PRIMITIVES) {
    const v = rec[key];
    if (Array.isArray(v)) {
      const items = v.filter((s) => typeof s === "string");
      if (items.length) out[key] = items;
    }
  }
  return out;
}
function merge(a, b) {
  const out = {};
  for (const key of PRIMITIVES) out[key] = [...a[key] ?? [], ...b[key] ?? []];
  return scrubPrimitives(out);
}
async function readScratch(repoRoot2, branch, env = process.env) {
  try {
    const raw = await readFile3(scratchPath(repoRoot2, branch, env), "utf8");
    return scrubPrimitives(coercePrimitives(JSON.parse(raw)));
  } catch {
    return {};
  }
}
async function appendScratch(repoRoot2, branch, add, env = process.env) {
  const merged = merge(await readScratch(repoRoot2, branch, env), add);
  try {
    const dir = scratchDir(env);
    await mkdir2(dir, { recursive: true, mode: DIR_MODE2 });
    const path = scratchPath(repoRoot2, branch, env);
    await writeFile2(path, JSON.stringify(merged) + "\n", { mode: FILE_MODE2 });
    await chmod2(path, FILE_MODE2).catch(() => {
    });
  } catch {
  }
  return merged;
}
async function clearScratch(repoRoot2, branch, env = process.env) {
  try {
    await rm(scratchPath(repoRoot2, branch, env), { force: true });
  } catch {
  }
}
function isScratchEmpty(p) {
  return isEmptyBlock(p);
}

// src/guidance.ts
var PACKAGE_URL = "https://github.com/backthread/add-reasoning-to-prs";
function surfaceCopy(surface) {
  return surface === "pr" ? {
    moment: "this pull request is opened",
    where: "the pull request description (the --body / --body-file text)"
  } : {
    moment: "this commit lands on the default branch",
    where: "the commit message body"
  };
}
function attributionHeader(surface) {
  return surface === "pr" ? `## Reasoning
<sub>written by the agent in-session via [\`backthread/add-reasoning-to-prs\`](${PACKAGE_URL})</sub>` : "reasoning \xB7 written in-session via backthread/add-reasoning-to-prs";
}
function attributionFooter(surface) {
  return surface === "pr" ? `<sub>\u21B3 generated by [\`backthread/add-reasoning-to-prs\`](${PACKAGE_URL}) \xB7 an open-source Claude Code hook \xB7 edit or delete freely</sub>` : "generated by backthread/add-reasoning-to-prs \u2014 an open-source Claude Code hook; edit or delete freely";
}
function exampleBlock(surface) {
  const { open, close } = delimiters(surface);
  const placeholder = ["<one concise line \u2014 omit this whole section if it does not apply>"];
  const rendered = renderBlock(surface, {
    decisions: placeholder,
    assumptions: placeholder,
    tradeoffs: placeholder,
    limitations: placeholder,
    // Renders only on the PR surface (renderBlock drops it on the commit surface).
    followups: placeholder
  });
  const body = rendered.slice(open.length, rendered.length - close.length).trim();
  return [open, attributionHeader(surface), "", body, "", attributionFooter(surface), close].join(
    "\n"
  );
}
function renderAccumulated(p) {
  const lines = [];
  for (const key of PRIMITIVES) {
    const items = (p[key] ?? []).filter(Boolean);
    if (items.length === 0) continue;
    lines.push(`${HEADINGS[key]}:`);
    for (const it of items) lines.push(`- ${it}`);
  }
  return lines.join("\n");
}
function buildGuidance(surface, accumulated) {
  const c = surfaceCopy(surface);
  const isPr = surface === "pr";
  const earlier = accumulated && !isEmptyBlock(accumulated) ? `

Earlier work on this branch (possibly a different session) already recorded these \u2014 fold the still-relevant points into the block instead of pasting them, and drop anything now stale:

${renderAccumulated(accumulated)}
` : "";
  const followupsBullet = isPr ? `
- Recommended follow-ups \u2014 a concrete next step your reasoning surfaced that a reviewer could NOT get from this diff alone. Most PRs have none.` : "";
  const followupsGuidance = isPr ? `

Recommended follow-ups (pull requests only):
- Add this section ONLY for a follow-up that your in-session reasoning surfaced AND a reviewer could not see from this PR's diff alone. Prefer a consequence in another file, another repository, or another service.
- Precision over coverage. If a careful reviewer could also reach the item by reading this diff, drop it. Most PRs have no follow-up. An empty section is the normal, correct outcome.
- Exclude anything a normal code review, a linter, or CI already catches. This is not a review checklist.
- Name the exact repository, file, or function only when it appeared in this session. Never guess a path. A wrong path is worse than none.
- One risk has one home. Keep the inline "Check: ..." tail on a risk by default; only when that action is a cross-boundary follow-up you are promoting into this section, move it here and remove the "Check: ..." tail there \u2014 so the same action is never written twice.` : "";
  return `add-reasoning-to-prs: before ${c.moment}, add a short, forward-only "why" block to ${c.where}, then re-run the command.${earlier}

Write the block ONLY from what you actually decided in THIS session \u2014 never invent. Use only the sections that apply:

- Decisions \u2014 the choices you made and why (not what changed; the diff already shows that).
- Assumptions \u2014 what you took as given that a reviewer should confirm.
- Trade-offs \u2014 what you knowingly gave up, and the option you rejected.
- Limitations \u2014 known gaps or risks you are deliberately leaving.${followupsBullet}

How much to write:
- Size the block to the change. Most PRs need one to three lines, not four full sections. A small or mechanical PR gets one line, or none.
- Lead with the one point a reviewer could NOT get from the diff \u2014 the risk you knowingly took, a default you reversed, a hidden constraint. Cut the obvious lines that ride along with it. One sharp point beats three restatements.
- Keep that one genuinely useful non-obvious point even on a small PR. Do not go silent just to look disciplined.
- If the session had no real decision, add no block. An empty block is the correct answer for a routine change.

Be honest:
- Forward-only: capture what the diff can't show \u2014 the why, and the risks knowingly taken. Never summarize the changes.
- Every line must trace to a real decision in this session. If the reason was never stated, drop the line \u2014 do not guess it.
- Never restate the diff ("added X", "refactored Y"), and never pad with filler ("improves code quality", "various cleanups").
- Write a caveat as a claim plus its silent consequence: "Assumes X; if X is wrong, Y breaks." A caveat with no named consequence is filler \u2014 cut it. End a risk with a short action, e.g. "Check: review both lists".${followupsGuidance}

Write it plainly \u2014 the reviewer may not be a native English speaker:
- One idea per sentence; prefer several short sentences over one long one with stacked clauses.
- Use plain words, not idioms or metaphors \u2014 say the literal thing ("follow foreign keys", not "hop the graph"; "turn it off", not "kill-switch"). Keep real names (tables, flags, functions, endpoints, keys) exactly \u2014 never trade a concrete name for a vague one.
- Avoid "X \u2192 Y" / "X: Y" logic shorthand; write it as a sentence (a relationship example like \`a\` \u2192 \`b\` is fine).
- Plain, factual, senior-engineer voice. No self-praise or marketing words (no "elegant", "robust", "clean", "seamless", "improves quality"). Say only what you decided and what is risky.

Format:
- Keep the headings in the order shown; include only the non-empty ones.
- Wrap the block EXACTLY between the two markers below so it is detected and left untouched on later runs.
- Add a visible attribution INSIDE the markers, scaled to the block. A substantial block uses the full attribution shown below (the heading/opening line plus the small closing note); a one- or two-line block uses only a single compact attribution line. Never a banner.

${exampleBlock(surface)}

Self-check BEFORE you write \u2014 a quick grounded pass, no tools or network needed:
- Take each candidate line and name the specific point in THIS session where that decision, assumption, trade-off, or limitation actually came up. If you can't point to one, delete the line.
- If nothing survives, there is no block to add: re-run your original command unchanged, or add ${SKIP_TOKEN} to it to opt out explicitly. Never manufacture filler \u2014 an empty block is the correct outcome for a session that didn't deliberate.

Otherwise, re-run your original command with the surviving block included in ${c.where}.`;
}
function buildScratchNudge() {
  return `add-reasoning-to-prs: you're committing on a feature branch, so this commit isn't touched. If this chunk of work involved a notable decision, assumption, trade-off, or limitation, bank it now \u2014 the eventual PR's why-block will fold it in, even if a different session opens the PR:

  add-reasoning-to-prs scratch add --json '{"decisions":["..."],"tradeoffs":["..."]}'

It's 100% local (nothing is committed) and stores only the why, never code. Skip it if there was nothing notable this time.`;
}

// src/hook.ts
function deny(surface, accumulated) {
  const guidance = buildGuidance(surface, accumulated);
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
function nudge(context) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: context } };
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
    const sessionId = typeof rec.session_id === "string" ? rec.session_id : void 0;
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
      if (!info.isDefault) {
        if (info.current) {
          const nudgeKey = promptKey(sessionId, "scratch-nudge", info.current);
          if (!await hasPrompted(nudgeKey, env) && await markPrompted(nudgeKey, env)) {
            return nudge(buildScratchNudge());
          }
        }
        return {};
      }
      surface = "commit";
    }
    const key = promptKey(sessionId, surface, info.current);
    if (await hasPrompted(key, env)) return {};
    if (!await markPrompted(key, env)) return {};
    let accumulated;
    if (surface === "pr" && info.current) {
      const root = await (deps.repoRootImpl ?? repoRoot)(cwd).catch(() => null);
      if (root) {
        const scratch = await readScratch(root, info.current, env);
        if (!isScratchEmpty(scratch)) accumulated = scratch;
        await clearScratch(root, info.current, env);
      }
    }
    return deny(surface, accumulated);
  } catch {
    return {};
  }
}

// src/scratchCommand.ts
function getFlag(args, name) {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  const prefix = `${name}=`;
  const eq = args.find((a) => a.startsWith(prefix));
  return eq ? eq.slice(prefix.length) : void 0;
}
async function runScratch(args) {
  const sub = args[0];
  const cwd = process.cwd();
  const [root, branch] = await Promise.all([repoRoot(cwd), currentBranch(cwd)]);
  if (sub === "add") {
    if (!root || !branch) {
      process.stderr.write("add-reasoning-to-prs: not in a git repo (or detached HEAD) \u2014 nothing banked.\n");
      return 0;
    }
    const raw = getFlag(args, "--json") ?? await readRawStdin();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      process.stderr.write(
        `add-reasoning-to-prs: scratch add expects JSON \u2014 --json '{"decisions":["..."]}' or piped on stdin.
`
      );
      return 0;
    }
    const merged = await appendScratch(root, branch, coercePrimitives(parsed));
    process.stdout.write(JSON.stringify(merged) + "\n");
    return 0;
  }
  if (sub === "show") {
    const scratch = root && branch ? await readScratch(root, branch) : {};
    process.stdout.write(JSON.stringify(scratch) + "\n");
    return 0;
  }
  if (sub === "clear") {
    if (root && branch) await clearScratch(root, branch);
    process.stdout.write("cleared\n");
    return 0;
  }
  process.stderr.write("usage: add-reasoning-to-prs scratch <add|show|clear>\n");
  return 0;
}

// src/install.ts
import { homedir as homedir3 } from "node:os";
import { join as join3, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile as readFile4, writeFile as writeFile3, mkdir as mkdir3, copyFile, chmod as chmod3 } from "node:fs/promises";
var HOSTED_NOTICE = `Your agent now writes the "why" into every PR \u2014 locally, on your own model, free.
Want the team view \u2014 the why pushed to you and searchable across your whole codebase?
  \u2192 https://backthread.dev   (the hosted upgrade)`;
function claudeDir(env) {
  const override = env.CLAUDE_CONFIG_DIR;
  return override && override.trim().length > 0 ? override : join3(homedir3(), ".claude");
}
function settingsPath(env) {
  return join3(claudeDir(env), "settings.json");
}
function installDir(env) {
  const override = env.ADD_REASONING_TO_PRS_STATE_DIR;
  const base = override && override.trim().length > 0 ? override : join3(homedir3(), ".add-reasoning-to-prs");
  return join3(base, "bin");
}
function installedBinPath(env = process.env) {
  return join3(installDir(env), "add-reasoning-to-prs.js");
}
function alreadyInstalled(preToolUse) {
  if (!Array.isArray(preToolUse)) return false;
  return preToolUse.some(
    (entry) => entry && typeof entry === "object" && Array.isArray(entry.hooks) && entry.hooks.some(
      (h) => h && typeof h === "object" && typeof h.command === "string" && h.command.includes("add-reasoning-to-prs")
    )
  );
}
async function mergeHook(env, binPath) {
  const path = settingsPath(env);
  let raw = null;
  try {
    raw = await readFile4(path, "utf8");
  } catch {
    raw = null;
  }
  let settings = {};
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      settings = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return "skipped-unparseable";
    }
  }
  const hooks = settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {};
  const preToolUse = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  if (alreadyInstalled(preToolUse)) return "present";
  preToolUse.push({
    matcher: "Bash",
    hooks: [{ type: "command", command: `node ${JSON.stringify(binPath)} hook` }]
  });
  hooks.PreToolUse = preToolUse;
  settings.hooks = hooks;
  await mkdir3(dirname(path), { recursive: true });
  await writeFile3(path, JSON.stringify(settings, null, 2) + "\n");
  return "added";
}
async function runInstall(deps = {}) {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((m) => process.stdout.write(m + "\n"));
  const source = deps.sourceBinPath ?? fileURLToPath(import.meta.url);
  try {
    const dest = installedBinPath(env);
    await mkdir3(dirname(dest), { recursive: true });
    await copyFile(source, dest);
    await chmod3(dest, 493).catch(() => {
    });
    const result = await mergeHook(env, dest);
    if (result === "skipped-unparseable") {
      log(`Your ${settingsPath(env)} is not valid JSON, so it was left untouched.`);
      log("Fix it (or remove it) and re-run, or install the Claude Code plugin instead.");
      return 1;
    }
    log(
      result === "added" ? "Installed the add-reasoning-to-prs hook into Claude Code." : "add-reasoning-to-prs is already installed \u2014 settings unchanged."
    );
    log(`  Hook: PreToolUse (Bash) \u2192 node ${dest} hook`);
    log(`  Disable per repo: git config add-reasoning-to-prs.disabled true`);
    log("");
    log(HOSTED_NOTICE);
    return 0;
  } catch (e) {
    log(`Install failed: ${e.message}`);
    log("You can also install the Claude Code plugin from the marketplace instead.");
    return 1;
  }
}

// src/cli.ts
function help() {
  return `add-reasoning-to-prs ${VERSION}

A Claude Code hook that writes a forward-only "why" block \u2014 the decisions, trade-offs,
assumptions, and limitations behind a change \u2014 into your PR description (or your commit
message on a direct push) at the moment the PR is opened.

Usage:
  add-reasoning-to-prs [install]    Install the hook into Claude Code (default)
  add-reasoning-to-prs --version    Print the version and exit
  add-reasoning-to-prs --help       Show this help

Install into Claude Code:
  npx add-reasoning-to-prs           # or install the plugin from the marketplace

Turn it off for a repo:
  git config add-reasoning-to-prs.disabled true
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
  if (cmd === "scratch") {
    return runScratch(args.slice(1));
  }
  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    process.stdout.write(help());
    return 0;
  }
  if (cmd === void 0 || cmd === "install") {
    return runInstall();
  }
  process.stdout.write(help());
  return 0;
}

// src/bin/add-reasoning-to-prs.ts
run(process.argv).then((code) => process.exit(code)).catch(() => process.exit(0));
