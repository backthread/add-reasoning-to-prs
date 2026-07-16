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

/** Drop filler + exact-duplicate lines, preserving order and original wording. */
export function scrubLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of Array.isArray(lines) ? lines : []) {
    if (typeof raw !== 'string') continue;
    if (isPadding(raw)) continue;
    const key = debullet(raw).toLowerCase();
    if (seen.has(key)) continue; // de-duplicate (case-insensitive)
    seen.add(key);
    out.push(debullet(raw));
  }
  return out;
}

/** Scrub every primitive's lines. Empty sections simply become empty arrays. */
export function scrubPrimitives(p: WhyPrimitives): WhyPrimitives {
  return {
    decisions: scrubLines(p.decisions ?? []),
    assumptions: scrubLines(p.assumptions ?? []),
    tradeoffs: scrubLines(p.tradeoffs ?? []),
    limitations: scrubLines(p.limitations ?? []),
  };
}
