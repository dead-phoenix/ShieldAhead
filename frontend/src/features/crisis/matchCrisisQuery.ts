import type { CrisisKind } from './crisisContent'

// Plain keyword/regex matching (no model, no API call) — picks the hazard
// a free-text question is about regardless of how the question itself is
// phrased, e.g. "can i survive bushfire" matches on the word 'bushfire'
// alone, not the surrounding grammar. Deliberately wide keyword nets:
// our users include older people and non-native English speakers, who are
// far more likely to use plain/informal words ("the lights went out") than
// the technical terms a stricter pattern would expect, and to misspell the
// hazard word itself under stress or on a phone keyboard.
//
// The typo variants below aren't guessed — they're the literal set of
// misspellings that showed up repeatedly in a ~800-message real-world
// stress test (power -> powr/poewr/pwr/powa/powwer, flood ->
// flod/floood/flud/fload/folod, fire -> fyre/fiire/fier/frie/fiyer/fyrre).
// Built as shared word-fragments (not full literal regexes) so the same
// typo tolerance applies everywhere that word appears in a longer phrase
// ("power cut", "no power", "power is back"), instead of only matching the
// bare word.
const POWER_WORD = String.raw`(?:pow(?:a|r|er|wer)|poewr|poer|pwe?r)`
const OUTAGE_WORD = String.raw`out+[ra]+g+es?`
const ELECTRICITY_WORD = String.raw`e?lectri[cs]i?ty`
const BLACKOUT_PHRASE = String.raw`bl+ack(?:ed)?[\s-]?outs?|black[uo]ts?`
const FLOOD_WORD = String.raw`(?:flo+d|flud|fload|folod)(?:ed|ing|s)?`
const FIRE_WORD = String.raw`fires?|fyres?|fiires?|firres?|fiers?|fireee+|fiyers?|fyrres?|fre|frie|frye`

const CRISIS_KEYWORD_PATTERNS: { kind: CrisisKind; pattern: RegExp }[] = [
  {
    kind: 'bushfire',
    pattern: new RegExp(
      String.raw`\bb[ue]?sh[\s-]?(?:${FIRE_WORD})\b` +
      String.raw`|\bwild[\s-]?fires?\b|\bforest[\s-]?fires?\b|\bgrass[\s-]?fires?\b|\bscrub[\s-]?fires?\b|\bgrassland[\s-]?fires?\b` +
      String.raw`|\b(?:${FIRE_WORD})\b|\bflames?\b|\bsmoke\b|\bsmok\b|\bburn(?:ing|t)?\b|\bembers?\b|\bblaze\b|\bablaze\b`,
      'i',
    ),
  },
  {
    kind: 'flood',
    // "house" isn't the only word people use for where they live — "home",
    // "place", "apartment", "flat" are all common synonyms, and a bare
    // "too much water"/"water everywhere" (no location noun at all) is
    // just as clear a flood signal as any of the more specific phrases.
    pattern: new RegExp(
      String.raw`\b(?:${FLOOD_WORD})\b|\bflo+d[\s-]?waters?\b|\bflash[\s-]?floods?\b|\brising[\s-]?water\b|\bwater[\s-]?(?:is[\s-]?)?rising\b` +
      String.raw`|\bheavy[\s-]?rain\b|\bstorm[\s-]?surge\b|\binundation\b|\bdeluge\b|\bwater[\s-]?logg(?:ed|ing)\b|\boverflow(?:ing|ed)?\b` +
      String.raw`|\b(?:house|home|place|apartment|flat)\s+is\s+(?:under\s+)?water\b` +
      String.raw`|\bwater\s+(?:in|inside|coming\s+into)\s+(?:my|the)\s+(?:house|home|place|apartment|flat)\b` +
      String.raw`|\bwater\s+(?:is\s+)?comi?n?g\s+(?:in|into|inside)\b|\bwater\s+all\s+around\b` +
      String.raw`|\b(?:too\s+much|lots?\s+of|a\s+lot\s+of)\s+water\b|\bwater\s+everywhere\b` +
      // Contextual flood signals with no "flood"-rooted word at all: a
      // river breaking its banks or being "over the bridge" (common
      // Victorian phrasing for a river in flood, used by name — "the
      // Goulburn/Murray/Thomson is over the bridge" — rather than saying
      // "flood"), heavy rain, sandbags, being underwater, water at knee
      // height, a river receding leaving mud/dead fish, and VICSES
      // (Victoria's flood/storm emergency service) by name.
      String.raw`|\bbreak(?:ing)?\s+(?:its\s+)?banks?\b|\bbroke\s+(?:its\s+)?banks?\b|\bses\b` +
      String.raw`|\b(?:is|was)\s+over\s+(?:the|da)\s+br+idge\b|\bsandbaa?gs?\b|\bunderwater\b` +
      String.raw`|\bwater\s+up\s+(?:to|2)\s+(?:my|his|her|their|our)\s+knees\b` +
      String.raw`|\brain\s+(?:is\s+|still\s+)?pouring\b|\bmud\s+and\s+dead\s+fish\b`,
      'i',
    ),
  },
  {
    kind: 'power-outage',
    pattern: new RegExp(
      String.raw`\b${POWER_WORD}[\s-]?${OUTAGE_WORD}\b|\b${OUTAGE_WORD}\b|\b${POWER_WORD}[\s-]?cuts?\b|\b${POWER_WORD}[\s-]?failures?\b` +
      String.raw`|\b${BLACKOUT_PHRASE}\b|\bno[\s-]?${POWER_WORD}\b` +
      String.raw`|\b${POWER_WORD}\s+(?:maybe\s+|might\s+|may\s+)?(?:just\s+)?(?:went|goes|going|go|is|was)\s+(?:out|off)\b|\b${POWER_WORD}\s+out\b` +
      String.raw`|\b${POWER_WORD}\s+has\s+(?:just\s+)?gone\s+out\b` +
      String.raw`|\blost[\s-]?${POWER_WORD}\b|\b${POWER_WORD}[\s-]?loss\b` +
      String.raw`|\bno[\s-]?${ELECTRICITY_WORD}\b|\b${ELECTRICITY_WORD}\s+(?:is\s+)?(?:gone|out)\b|\b${ELECTRICITY_WORD}\b` +
      String.raw`|\bgenerators?\b|\bno[\s-]?lights?\b|\blights?\s+(?:went|are|is|have\s+gone|has\s+gone)\s+out\b|\blights?\s+flicker\w*\b` +
      String.raw`|\beverything(?:'s| is)?\s+(?:gone\s+)?dark\b` +
      // "the power is/not back", "power comes/came back", "power restored"
      // — resolution phrases, just as clearly about a power outage as the
      // outage itself (whether it's over or still ongoing).
      String.raw`|\b${POWER_WORD}\s+(?:is\s+|was\s+|not\s+)*(?:back|bakc|restored|resotred|returned|on)\b` +
      String.raw`|\b${POWER_WORD}\s+(?:just\s+)?comes?\s+back\b|\b${POWER_WORD}\s+(?:just\s+)?came\s+back\b` +
      String.raw`|\bsurge\s+damage\b|\btv\s+not\s+working\b` +
      // Contextual power-outage signals with no "power"-rooted word: a
      // rostered/rolling cut, or the electricity grid itself failing.
      String.raw`|\bloa+d[\s-]?shedding\b|\bgrid\s+(?:\S+\s+)?fail(?:ing|s|ed)?\b`,
      'i',
    ),
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
    // Three independent during-signals, beyond the obvious "during"/"right
    // now"/"currently":
    //  - an auxiliary verb ("is"/"was"/"has") + an ongoing/arriving verb
    //    ("coming", "rising", "gone", "started") — covers "is happening",
    //    "water is rising", "has gone out".
    //  - a bare past-tense "it just happened" verb with no auxiliary at
    //    all ("the power just went out", "water rising fast") — common
    //    when a speaker drops the helping verb entirely.
    //  - "when" immediately followed by the bare hazard noun with no verb
    //    ("what should i do when power cut") — same dropped-verb pattern,
    //    just phrased as a question. Only fires when a hazard word
    //    directly follows "when" (optionally through "it/a/the"), so it
    //    doesn't catch "when should I prepare for bushfire", where "when"
    //    is followed by "should", not the hazard itself.
    pattern: new RegExp(
      String.raw`\bduring\b|\bright\s+now\b|\bhappening\s+now\b|\bcurrently\b|\bin\s+progress\b|\bwhile\s+it'?s?\s+happening\b` +
      String.raw`|\b(?:is|was|are|has|have)\s+(?:come|coming|came|arriv\w*|here|happen(?:ing|ed)?|started|starting|going|gone|rising)\b` +
      String.raw`|\b(?:just\s+)?(?:went|gone)\s+out\b|\brising\s+(?:fast|quickly|water)\b|\bwater\s+(?:is\s+)?rising\b|\bwater\s+coming\s+(?:in|into|inside)\b` +
      String.raw`|\b(?:too\s+much|lots?\s+of|a\s+lot\s+of)\s+water\b|\bwater\s+everywhere\b` +
      String.raw`|\bwhen\s+(?:it\s+|a\s+|the\s+)?(?:bush[\s-]?${FIRE_WORD}|wild[\s-]?fires?|${FIRE_WORD}|${FLOOD_WORD}|${POWER_WORD}[\s-]?cuts?|${POWER_WORD}[\s-]?${OUTAGE_WORD}|${BLACKOUT_PHRASE})\b`,
      'i',
    ),
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

// Applied only once none of the explicit before/during/after patterns
// above matched anything. Someone typing a short, bare, urgent query with
// no temporal word at all ("fire fire what to do", "power cut what to
// do", "bushfire whom should i call") is far more likely mid-emergency
// than calmly planning ahead, so these fall back to 'during' rather than
// leaving the caller to default to the first ("before") tab. Two
// independent signals, kept as separate patterns so neither needs a
// backreference numbered against the other's capture groups:
//  - a bare action-seeking phrase ("what to do", "what should i do",
//    "who(m) should/do i call", "help", "emergency") with no accompanying
//    "before"-type word (checked above, so by this point we already know
//    there isn't one).
//  - a word repeated back-to-back ("fire fire"), a common way to express
//    alarm regardless of English fluency.
const DURING_FALLBACK_ACTION_PATTERN = /\bwhat\s+(should\s+i\s+do|do\s+i\s+do|to\s+do)\b|\bwho(m)?\s+(should|do)\s+i\s+call\b|\bhelp(\s+me)?\b|\bemergency\b/i
const REPEATED_WORD_PATTERN = /\b(\w+)\s+\1\b/i

export function matchCrisisStage(query: string): CrisisStage | undefined {
  const trimmed = query.trim()
  if (!trimmed) return undefined
  const explicit = STAGE_KEYWORD_PATTERNS.find(({ pattern }) => pattern.test(trimmed))?.stage
  if (explicit) return explicit
  if (DURING_FALLBACK_ACTION_PATTERN.test(trimmed) || REPEATED_WORD_PATTERN.test(trimmed)) return 'during'
  return undefined
}
