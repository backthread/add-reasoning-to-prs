// critique.ts — the LOCAL, deterministic half of the never-fabricate posture.
//
// Fabrication is prevented in two $0/local ways (no server, ever):
//   1. The model's own IN-TURN self-critique — instructed by the injected guidance
//      (guidance.ts): before writing, it re-checks each line against what it actually
//      decided this session and drops anything it can't ground. That's the SEMANTIC pass;
//      only the model can judge "did this really come up?".
//   2. This mechanical scrub — a deterministic filter that drops UNAMBIGUOUS filler and
//      duplicate lines. It deliberately does NOT try to judge grounding or why-vs-what
//      (a syntactic rule can't tell "Added retries" from "Added retries because the API
//      is flaky" — dropping the latter would destroy a real decision). It only removes
//      lines that are content-free no matter the context.
//
// The scrub is what keeps the multi-session scratchpad clean before its accumulated
// primitives are rendered back into the guidance.

import type { WhyPrimitives } from './template.js';

// Whole-line filler: matched anchored (^…$) against the de-bulleted, trimmed line, so a
// genuine line that merely CONTAINS one of these words is never dropped.
const FILLER_PATTERNS: RegExp[] = [
  /^(n\/?a|none|nil|tbd|todo|-{1,}|\.{1,})$/i,
  // One or more filler adjectives ("various", "minor", …) + a filler noun, whole-line.
  /^((various|minor|misc\.?|miscellaneous|small|some|general|other)\s+)+(changes?|improvements?|updates?|fixes|tweaks|edits|stuff|things)\.?$/i,
  /^(general\s+|misc\.?\s+)?clean(ed)?[\s-]*up\.?$/i,
  /^improve[sd]?\s+(the\s+)?code\s+quality\.?$/i,
  /^(made|make)\s+(the\s+)?code\s+(better|cleaner|nicer)\.?$/i,
  /^(better|cleaner|improved)\s+code\.?$/i,
  /^(code\s+)?(quality|cleanup|refactor(ing)?|polish)\.?$/i,
  /^no\s+(notable\s+)?(decisions?|changes?|deliberation)\.?$/i,
];

// STRICTER whole-line filler for the Recommended-follow-ups section only. A follow-up must
// name a concrete, not-derivable-from-the-diff consequence; a bare generic to-do ("add
// tests", "consider refactoring later", "improve error handling") is exactly the padding the
// higher bar exists to cut. Anchored (^…$) against the de-bulleted line, so a follow-up that
// merely STARTS with one of these but carries a concrete target survives (e.g. "Add tests for
// the cross-service billing webhook contract in packages/billing/webhook.ts" is kept — it says more than "add
// tests"). This stays deterministic filler removal; it never tries to judge grounding.
const FOLLOWUP_FILLER_PATTERNS: RegExp[] = [
  /^(add|write)\s+(more\s+|extra\s+|unit\s+|integration\s+)?tests?\.?$/i,
  /^(add|improve|better|more)\s+(the\s+)?(error[\s-]?handling|logging|validation|documentation|docs|comments?|monitoring|observability|metrics|telemetry|type\s+safety|test\s+coverage|coverage)\.?$/i,
  /^update\s+(the\s+)?(docs|documentation|readme)\.?$/i,
  /^(consider\s+|maybe\s+)?refactor(ing)?(\s+(this|it|later))?\.?$/i,
  /^(optimi[sz]e|clean\s*up|polish|revisit|monitor|review|simplify)(\s+(this|it|later|performance))?\.?$/i,
  /^(handle|cover)\s+(the\s+)?(remaining\s+)?edge\s+cases?\.?$/i,
  /^(add|set\s*up)\s+(monitoring|alerting|observability|metrics)\.?$/i,
  /^follow[\s-]?ups?\.?$/i,
];

/** Strip a leading markdown bullet and surrounding whitespace. */
function debullet(line: string): string {
  return line.replace(/^\s*[-*]\s*/, '').trim();
}

/** True if a line is content-free filler (or empty) that should be dropped. */
export function isPadding(line: string): boolean {
  const t = debullet(line);
  if (t.length === 0) return true;
  return FILLER_PATTERNS.some((re) => re.test(t));
}

/** True if a Recommended-follow-ups line is padding at the STRICTER bar (the base filler
 * test plus the generic-to-do patterns above). */
export function isPaddingFollowup(line: string): boolean {
  if (isPadding(line)) return true;
  return FOLLOWUP_FILLER_PATTERNS.some((re) => re.test(debullet(line)));
}

/** Drop filler + exact-duplicate lines, preserving order and original wording. `isFiller`
 * selects the bar — the default base filter, or the stricter follow-up filter. */
export function scrubLines(
  lines: string[],
  isFiller: (line: string) => boolean = isPadding,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of Array.isArray(lines) ? lines : []) {
    if (typeof raw !== 'string') continue;
    if (isFiller(raw)) continue;
    const key = debullet(raw).toLowerCase();
    if (seen.has(key)) continue; // de-duplicate (case-insensitive)
    seen.add(key);
    out.push(debullet(raw));
  }
  return out;
}

/** Scrub Recommended-follow-ups lines at the stricter bar (generic to-dos cut as padding). */
export function scrubFollowups(lines: string[]): string[] {
  return scrubLines(lines, isPaddingFollowup);
}

/** Scrub every primitive's lines. Empty sections simply become empty arrays. The PR-only
 * `followups` field is scrubbed at the stricter bar and only included when it was present. */
export function scrubPrimitives(p: WhyPrimitives): WhyPrimitives {
  const out: WhyPrimitives = {
    decisions: scrubLines(p.decisions ?? []),
    assumptions: scrubLines(p.assumptions ?? []),
    tradeoffs: scrubLines(p.tradeoffs ?? []),
    limitations: scrubLines(p.limitations ?? []),
  };
  if (p.followups !== undefined) out.followups = scrubFollowups(p.followups ?? []);
  return out;
}
