// template.ts — the canonical forward-only "why" block: its four primitives, the
// surface-appropriate delimiters, and a renderer.
//
// The block is AUTHORED by the live model, but this module defines its SHAPE — the
// primitive set + order, the per-surface delimiters, the "only non-empty sections" and
// "empty → omit the whole block" rules — so the guidance we inject, the tests, and the
// multi-session scratchpad all agree on exactly one format.

import {
  PR_MARKER_OPEN,
  PR_MARKER_CLOSE,
  COMMIT_MARKER_OPEN,
  COMMIT_MARKER_CLOSE,
} from './marker.js';

/** Where a block lands: a PR description (markdown) or a commit message (plain text). */
export type Surface = 'pr' | 'commit';

/** The four forward-only primitives, in canonical render order. */
export const PRIMITIVES = ['decisions', 'assumptions', 'tradeoffs', 'limitations'] as const;
export type PrimitiveKey = (typeof PRIMITIVES)[number];

export interface WhyPrimitives {
  /** The choices made and why (not what changed — the diff shows that). */
  decisions?: string[];
  /** What was taken as given that a reviewer should confirm. */
  assumptions?: string[];
  /** What was knowingly given up, and the rejected alternative. */
  tradeoffs?: string[];
  /** Known gaps, risks, or deliberately-deferred follow-ups. */
  limitations?: string[];
}

/** Human headings for each primitive (canonical wording). */
export const HEADINGS: Record<PrimitiveKey, string> = {
  decisions: 'Decisions',
  assumptions: 'Assumptions',
  tradeoffs: 'Trade-offs',
  limitations: 'Limitations',
};

export function delimiters(surface: Surface): { open: string; close: string } {
  return surface === 'pr'
    ? { open: PR_MARKER_OPEN, close: PR_MARKER_CLOSE }
    : { open: COMMIT_MARKER_OPEN, close: COMMIT_MARKER_CLOSE };
}

/** Trim + drop blank entries from a primitive's items. */
function clean(items: string[] | undefined): string[] {
  if (!Array.isArray(items)) return [];
  return items.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean);
}

/** True if the primitives carry nothing worth recording (→ the block is omitted). */
export function isEmptyBlock(p: WhyPrimitives): boolean {
  return PRIMITIVES.every((k) => clean(p[k]).length === 0);
}

/**
 * Render the block for a surface, including ONLY the non-empty sections in canonical
 * order, wrapped in that surface's delimiters. Returns '' when nothing is worth
 * recording (the "leave empty → omit the block" rule) so callers can drop it entirely.
 *
 * PR bodies render as markdown (bold headings — the delimiters are invisible HTML
 * comments); commit messages render as plain text between sentinel lines.
 */
export function renderBlock(surface: Surface, p: WhyPrimitives): string {
  if (isEmptyBlock(p)) return '';
  const { open, close } = delimiters(surface);
  const isPr = surface === 'pr';
  const lines: string[] = [open];
  for (const key of PRIMITIVES) {
    const items = clean(p[key]);
    if (items.length === 0) continue;
    lines.push(isPr ? `**${HEADINGS[key]}**` : `${HEADINGS[key]}:`);
    for (const item of items) lines.push(`- ${item}`);
    if (isPr) lines.push(''); // a blank line between markdown sections
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  lines.push(close);
  return lines.join('\n');
}
