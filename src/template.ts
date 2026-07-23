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

/**
 * The four forward-only primitives that render on EVERY surface, in canonical render order.
 * (Recommended follow-ups is a fifth primitive, but it renders on the PR surface only — see
 * PR_ONLY_PRIMITIVES — so it is kept out of this list, which callers treat as surface-neutral.)
 */
export const PRIMITIVES = ['decisions', 'assumptions', 'tradeoffs', 'limitations'] as const;

/**
 * Primitives that render on the PR surface ONLY. A commit message is immutable once pushed
 * and has no backlog/thread home, so a forward-looking to-do belongs on the review surface.
 */
export const PR_ONLY_PRIMITIVES = ['followups'] as const;

/** Every primitive, in canonical render order (PR-only ones last). */
export const ALL_PRIMITIVES = [...PRIMITIVES, ...PR_ONLY_PRIMITIVES] as const;
export type PrimitiveKey = (typeof ALL_PRIMITIVES)[number];

export interface WhyPrimitives {
  /** The choices made and why (not what changed — the diff shows that). */
  decisions?: string[];
  /** What was taken as given that a reviewer should confirm. */
  assumptions?: string[];
  /** What was knowingly given up, and the rejected alternative. */
  tradeoffs?: string[];
  /** Known gaps, risks, or deliberately-deferred follow-ups. */
  limitations?: string[];
  /**
   * Forward-looking next steps the in-session reasoning surfaced that a reviewer could NOT
   * get from this PR's diff alone (bias to cross-file / cross-repo / cross-service). PR
   * surface only; kept deliberately rare (precision over coverage).
   */
  followups?: string[];
}

/** Human headings for each primitive (canonical wording). */
export const HEADINGS: Record<PrimitiveKey, string> = {
  decisions: 'Decisions',
  assumptions: 'Assumptions',
  tradeoffs: 'Trade-offs',
  limitations: 'Limitations',
  followups: 'Recommended follow-ups',
};

/** The primitives that render on a given surface, in canonical order. */
export function primitivesForSurface(surface: Surface): readonly PrimitiveKey[] {
  return surface === 'pr' ? ALL_PRIMITIVES : PRIMITIVES;
}

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

/** True if the primitives carry nothing worth recording (→ the block is omitted).
 * Considers EVERY primitive (including the PR-only ones), so a set carrying only a
 * follow-up still counts as non-empty. */
export function isEmptyBlock(p: WhyPrimitives): boolean {
  return ALL_PRIMITIVES.every((k) => clean(p[k]).length === 0);
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
  const keys = primitivesForSurface(surface);
  // Emptiness is judged PER SURFACE: a follow-up-only set renders on the PR surface but is
  // empty on the commit surface (which excludes follow-ups), so return '' there.
  if (keys.every((k) => clean(p[k]).length === 0)) return '';
  const { open, close } = delimiters(surface);
  const isPr = surface === 'pr';
  const lines: string[] = [open];
  for (const key of keys) {
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
