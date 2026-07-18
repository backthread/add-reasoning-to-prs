// guidance.ts — the instruction ("template + guardrails") the hook injects when it denies
// a commit / PR-create that lacks a why-block.
//
// This text is what the LIVE model reads on the denial and acts on: it composes the
// forward-only block from the session's real deliberation and re-runs the command. The
// hook itself never authors the block — it only asks for it. The guidance is surface-
// aware (PR body vs commit message use different delimiters) and enumerates all four
// primitives; the model includes only the sections that genuinely apply.

import {
  renderBlock,
  HEADINGS,
  PRIMITIVES,
  isEmptyBlock,
  type Surface,
  type WhyPrimitives,
} from './template.js';
import { SKIP_TOKEN } from './repoConfig.js';

// Re-export so existing importers (hook.ts) keep a single import site for Surface.
export type { Surface } from './template.js';

interface SurfaceCopy {
  moment: string;
  where: string;
}

function surfaceCopy(surface: Surface): SurfaceCopy {
  return surface === 'pr'
    ? {
        moment: 'this pull request is opened',
        where: 'the pull request description (the --body / --body-file text)',
      }
    : {
        moment: 'this commit lands on the default branch',
        where: 'the commit message body',
      };
}

/** A filled-in-shape example of the block for a surface, rendered from the canonical
 * template so the guidance can never drift from what the block actually looks like. */
function exampleBlock(surface: Surface): string {
  const placeholder = ['<one concise line — omit this whole section if it does not apply>'];
  return renderBlock(surface, {
    decisions: placeholder,
    assumptions: placeholder,
    tradeoffs: placeholder,
    limitations: placeholder,
  });
}

/** Render accumulated (earlier-session) primitives as a plain, readable list. */
function renderAccumulated(p: WhyPrimitives): string {
  const lines: string[] = [];
  for (const key of PRIMITIVES) {
    const items = (p[key] ?? []).filter(Boolean);
    if (items.length === 0) continue;
    lines.push(`${HEADINGS[key]}:`);
    for (const it of items) lines.push(`- ${it}`);
  }
  return lines.join('\n');
}

/**
 * Build the guidance for a surface. The SAME text is used for both the
 * `permissionDecisionReason` (the reliable floor, honored on every Claude Code version)
 * and `additionalContext` (a progressive enhancement), so the model always sees it.
 *
 * When `accumulated` primitives are supplied (banked earlier on this branch, possibly by
 * a different session), they're surfaced so the block can cover the WHOLE branch — the
 * model folds the still-relevant ones in rather than pasting them verbatim.
 */
export function buildGuidance(surface: Surface, accumulated?: WhyPrimitives): string {
  const c = surfaceCopy(surface);
  const earlier =
    accumulated && !isEmptyBlock(accumulated)
      ? `\n\nEarlier work on this branch (possibly a different session) already recorded these — fold the still-relevant points into the block instead of pasting them, and drop anything now stale:\n\n${renderAccumulated(accumulated)}\n`
      : '';
  return `add-reasoning-to-prs: before ${c.moment}, add a short, forward-only "why" block to ${c.where}, then re-run the command.${earlier}

Compose the block ONLY from what you actually decided in THIS session — never invent. Include only the sections that genuinely apply, and drop any that don't:

- Decisions — the choices you made and why (not what changed; the diff already shows that).
- Assumptions — what you took as given that a reviewer should confirm.
- Trade-offs — what you knowingly gave up, and the alternative you rejected.
- Limitations — known gaps, risks, or follow-ups you're deliberately deferring.

Rules:
- Forward-only: capture what the diff can't show — the why, and the risks knowingly taken. Never summarize the changes.
- Grounded: every line must trace to real deliberation in this session. Cut anything padded, generic, or inferred.
- Keep it tight: a few lines per section at most.
- Write it plainly — the reviewer may not be a native English speaker. One idea per sentence; prefer several short sentences over one long one with stacked clauses.
- Use plain words, not idioms or metaphors — say the literal thing ("follow foreign keys", not "hop the graph"; "turn it off", not "kill-switch"). Keep real names (tables, flags, functions, endpoints, keys) exactly — never trade a concrete name for a vague one.
- Avoid "X → Y" / "X: Y" logic shorthand; write it as a sentence (a relationship example like \`a\` → \`b\` is fine). For a risk, end with a short action the reviewer can take, e.g. "Check: review both lists".
- Wrap the block EXACTLY between the two markers below so it is detected and left untouched on later runs:

${exampleBlock(surface)}

Self-check BEFORE you write — a quick grounded pass, no tools or network needed:
- Take each candidate line and name the specific point in THIS session where that decision, assumption, trade-off, or limitation actually came up. If you can't point to one, delete the line.
- Delete anything that just restates the diff ("added X", "refactored Y") without a why, and any generic filler ("improves code quality", "various cleanups").
- Whatever survives is the block. If NOTHING survives, there is no block to add: re-run your original command unchanged, or add ${SKIP_TOKEN} to it to opt out explicitly. Never manufacture filler to fill the template — an empty block is the correct outcome for a session that didn't deliberate.

Otherwise, re-run your original command with the surviving block included in ${c.where}.`;
}

/**
 * The best-effort nudge injected (as non-blocking additionalContext) on a feature-branch
 * commit: bank this session's why to the branch scratchpad so the eventual PR — even one
 * opened by a different session — can cover the whole branch.
 */
export function buildScratchNudge(): string {
  return `add-reasoning-to-prs: you're committing on a feature branch, so this commit isn't touched. If this chunk of work involved a notable decision, assumption, trade-off, or limitation, bank it now — the eventual PR's why-block will fold it in, even if a different session opens the PR:

  add-reasoning-to-prs scratch add --json '{"decisions":["..."],"tradeoffs":["..."]}'

It's 100% local (nothing is committed) and stores only the why, never code. Skip it if there was nothing notable this time.`;
}
