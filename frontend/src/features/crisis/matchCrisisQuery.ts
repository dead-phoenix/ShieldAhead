import type { CrisisKind } from './crisisContent'

// Plain keyword/regex matching (no model, no API call) — picks the hazard
// a free-text question is about regardless of how the question itself is
// phrased, e.g. "can i survive bushfire" matches on the word 'bushfire'
// alone, not the surrounding grammar. Deliberately wide keyword nets:
// our users include older people and non-native English speakers, who are
// far more likely to use plain/informal words ("the lights went out") than
// the technical terms a stricter pattern would expect.
const CRISIS_KEYWORD_PATTERNS: { kind: CrisisKind; pattern: RegExp }[] = [
  {
    kind: 'bushfire',
    pattern: /\bbush[\s-]?fires?\b|\bwild[\s-]?fires?\b|\bforest[\s-]?fires?\b|\bgrass[\s-]?fires?\b|\bscrub[\s-]?fires?\b|\bgrassland[\s-]?fires?\b|\bfires?\b|\bflames?\b|\bsmoke\b|\bburn(ing|t)?\b|\bembers?\b|\bblaze\b|\bablaze\b/i,
  },
  {
    kind: 'flood',
    pattern: /\bfloods?\b|\bflooding\b|\bflooded\b|\bflood[\s-]?water\b|\bflash[\s-]?floods?\b|\brising[\s-]?water\b|\bwater[\s-]?(is[\s-]?)?rising\b|\bheavy[\s-]?rain\b|\bstorm[\s-]?surge\b|\binundation\b|\bdeluge\b|\bwater[\s-]?logg(ed|ing)\b|\boverflow(ing|ed)?\b|\bhouse\s+is\s+(under\s+)?water\b|\bwater\s+(in|inside)\s+(my|the)\s+house\b/i,
  },
  {
    kind: 'power-outage',
    pattern: /\bpower[\s-]?outages?\b|\bpower[\s-]?cuts?\b|\bpower[\s-]?failures?\b|\bblackouts?\b|\bno[\s-]?power\b|\bpower\s+(just\s+)?(went|goes|going|is|was|has)\s+out\b|\blost[\s-]?power\b|\bpower[\s-]?loss\b|\bno[\s-]?electricity\b|\belectricity\s+(is\s+)?(gone|out)\b|\bgenerators?\b|\bno[\s-]?lights?\b|\blights?\s+(went|are|is)\s+out\b|\beverything('s| is)?\s+(gone\s+)?dark\b/i,
  },
]

export function matchCrisisKind(query: string): CrisisKind | undefined {
  const trimmed = query.trim()
  if (!trimmed) return undefined
  return CRISIS_KEYWORD_PATTERNS.find(({ pattern }) => pattern.test(trimmed))?.kind
}

export type CrisisStage = 'before' | 'during' | 'after'

// Checked in this order (during, after, before) since "during" and "after"
// are the more specific/active signals — e.g. "is came"/"is coming"/"has
// started" only make sense mid-event, so they're checked first. "before"
// is checked last since its signal words ("plan", "prepare") are common
// and safe to treat as the fallback reading when nothing more specific
// matched.
const STAGE_KEYWORD_PATTERNS: { stage: CrisisStage; pattern: RegExp }[] = [
  {
    stage: 'during',
    pattern: /\bduring\b|\bright\s+now\b|\bhappening\s+now\b|\bcurrently\b|\bin\s+progress\b|\bwhile\s+it'?s?\s+happening\b|\b(is|was|are|has|have)\s+(come|coming|came|arriv\w*|here|happen(ing|ed)?|started|starting)\b/i,
  },
  {
    stage: 'after',
    pattern: /\bafter\b|\bonce\s+it'?s?\s+(over|passed|finished|ended)\b|\bpost[\s-]?(bushfire|flood|outage)\b|\brecovery\b|\bclean(ing)?[\s-]?up\b|\baftermath\b/i,
  },
  {
    stage: 'before',
    pattern: /\bbefore\b|\bprepar(e|ing|ation|edness)\b|\bget(ting)?\s+ready\b|\bplan(ning)?\b|\bin\s+advance\b|\bahead\s+of\s+time\b/i,
  },
]

export function matchCrisisStage(query: string): CrisisStage | undefined {
  const trimmed = query.trim()
  if (!trimmed) return undefined
  return STAGE_KEYWORD_PATTERNS.find(({ pattern }) => pattern.test(trimmed))?.stage
}
