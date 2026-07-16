// guidance.ts — the instruction ("template + guardrails") the hook injects when it denies
// a commit / PR-create that lacks a why-block.
//
// This text is what the LIVE model reads on the denial and acts on: it composes the
// forward-only block from the session's real deliberation and re-runs the command. The
// hook itself never authors the block — it only asks for it. The guidance is surface-
// aware (PR body vs commit message use different delimiters) and enumerates all four
// primitives; the model includes only the sections that genuinely apply.

import { renderBlock, type Surface } from './template.js';
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

/**
 * Build the guidance for a surface. The SAME text is used for both the
 * `permissionDecisionReason` (the reliable floor, honored on every Claude Code version)
 * and `additionalContext` (a progressive enhancement), so the model always sees it.
 */
export function buildGuidance(surface: Surface): string {
  const c = surfaceCopy(surface);
  return `add-reasoning-to-prs: before ${c.moment}, add a short, forward-only "why" block to ${c.where}, then re-run the command.

Compose the block ONLY from what you actually decided in THIS session — never invent. Include only the sections that genuinely apply, and drop any that don't:

- Decisions — the choices you made and why (not what changed; the diff already shows that).
- Assumptions — what you took as given that a reviewer should confirm.
- Trade-offs — what you knowingly gave up, and the alternative you rejected.
- Limitations — known gaps, risks, or follow-ups you're deliberately deferring.

Rules:
- Forward-only: capture what the diff can't show — the why, and the risks knowingly taken. Never summarize the changes.
- Grounded: every line must trace to real deliberation in this session. Cut anything padded, generic, or inferred.
- Keep it tight: a few lines per section at most.
- Wrap the block EXACTLY between the two markers below so it is detected and left untouched on later runs:

${exampleBlock(surface)}

Self-check BEFORE you write — a quick grounded pass, no tools or network needed:
- Take each candidate line and name the specific point in THIS session where that decision, assumption, trade-off, or limitation actually came up. If you can't point to one, delete the line.
- Delete anything that just restates the diff ("added X", "refactored Y") without a why, and any generic filler ("improves code quality", "various cleanups").
- Whatever survives is the block. If NOTHING survives, there is no block to add: re-run your original command unchanged, or add ${SKIP_TOKEN} to it to opt out explicitly. Never manufacture filler to fill the template — an empty block is the correct outcome for a session that didn't deliberate.

Otherwise, re-run your original command with the surviving block included in ${c.where}.`;
}
