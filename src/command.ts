// command.ts — classify a Bash `tool_input.command` string.
//
// The PreToolUse matcher only matches the TOOL NAME (Bash), so the hook itself has to
// look inside the command string to decide whether it's a `git commit` or a
// `gh pr create` — the two moments we want a "why" block. This is intentionally a
// lightweight classifier, not a shell parser: it splits on the common control operators
// and inspects each simple-command segment. Anything it can't confidently classify is
// `other` (→ the hook does nothing), so a false "other" is always the safe direction.

import { basename } from 'node:path';

export type CommandKind = 'git-commit' | 'gh-pr-create' | 'other';

// Split a command line into simple-command segments on shell control operators
// (`&&`, `||`, `;`, `|`, `&`, newline). Good enough to isolate the invocation we care
// about from surrounding `cd …`, pipes, and chains.
const SEGMENT_SPLIT = /&&|\|\||[;\n|&]/;

// git "global" options (before the subcommand) that consume the FOLLOWING token as their
// value — so we skip that value when scanning for the subcommand (e.g. `git -C path commit`).
const GIT_GLOBAL_OPTS_WITH_VALUE = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--exec-path',
]);

/** Classify a full command line by its first recognizable git/gh invocation. */
export function classifyCommand(command: string): CommandKind {
  if (typeof command !== 'string' || command.trim().length === 0) return 'other';
  for (const segment of command.split(SEGMENT_SPLIT)) {
    const kind = classifySegment(segment);
    if (kind !== 'other') return kind;
  }
  return 'other';
}

function classifySegment(segment: string): CommandKind {
  const tokens = segment.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  // Skip leading `VAR=value` env assignments and a bare `env` wrapper.
  while (i < tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]) || tokens[i] === 'env')) {
    i++;
  }
  if (i >= tokens.length) return 'other';

  const prog = basename(tokens[i]);

  if (prog === 'git') {
    // Find the subcommand: the first non-option token after `git`, skipping global
    // options and any value they consume.
    for (let j = i + 1; j < tokens.length; j++) {
      const t = tokens[j];
      if (t.startsWith('-')) {
        if (GIT_GLOBAL_OPTS_WITH_VALUE.has(t)) j++; // its value is the next token — skip it
        continue;
      }
      return t === 'commit' ? 'git-commit' : 'other';
    }
    return 'other';
  }

  if (prog === 'gh') {
    // `gh pr create` — the first two non-option words after `gh` must be `pr` then
    // `create` (flags may follow). Options before the subcommand are uncommon for gh.
    const words = tokens.slice(i + 1).filter((t) => !t.startsWith('-'));
    return words[0] === 'pr' && words[1] === 'create' ? 'gh-pr-create' : 'other';
  }

  return 'other';
}
