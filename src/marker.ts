// marker.ts — the machine-readable delimiter that wraps the "why" block.
//
// SINGLE SOURCE OF TRUTH for the marker token. Two consumers must agree on it exactly:
//   1. This hook — to detect a block that's already present (idempotency / skip
//      re-injection) and to tell the model which delimiter to emit.
//   2. The ingestion side that reads git prose — so it can recognize and SKIP this
//      hook's own block instead of re-ingesting it as an independent decision.
// Anyone changing the token must change it in both places.
//
// The token is deliberately surface-appropriate:
//   • PR body is markdown, so an HTML comment renders invisibly.
//   • A commit message shows HTML comments as literal text, so it uses a plain sentinel.
// Both forms embed the same stable substring (MARKER_TOKEN) so one check finds either.

/** The stable substring present in every marker (open or close, either surface). */
export const MARKER_TOKEN = 'backthread:why';

/** PR-body (markdown) delimiters — HTML comments, invisible when rendered. */
export const PR_MARKER_OPEN = '<!-- backthread:why -->';
export const PR_MARKER_CLOSE = '<!-- /backthread:why -->';

/** Commit-message delimiters — a plain sentinel (HTML comments don't hide in git log). */
export const COMMIT_MARKER_OPEN = '--- backthread:why ---';
export const COMMIT_MARKER_CLOSE = '--- backthread:why end ---';

/**
 * True if the given text already carries a why-block marker (either surface). Used for
 * idempotency — a command that already contains the block is left alone, so a re-run is
 * a no-op and the model's own retry (with the block added) is never re-denied.
 */
export function hasMarker(text: string | undefined | null): boolean {
  if (typeof text !== 'string' || text.length === 0) return false;
  return text.includes(MARKER_TOKEN);
}
