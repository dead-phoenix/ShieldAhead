import { appRoutes } from '../../app/config/product'

// Plain keyword/regex matching, same approach as matchCrisisQuery — picks the
// page someone is asking to go to from typed or spoken text ("take me to
// wifi", "nearest hospital", "charities near me"). Checked before hazard
// matching, so "fire station" goes to the Map rather than being read as a
// bushfire question. Typo tolerance follows the same wide-net approach as
// matchCrisisQuery, since users under stress misspell and speak informally.

const MAP_CATEGORY_ROUTE = (category: string) => `${appRoutes.map}?category=${category}`

const NAVIGATION_PATTERNS: { path: string; pattern: RegExp }[] = [
  {
    path: MAP_CATEGORY_ROUTE('wifi'),
    pattern: /\bwi[\s-]?fi\b|\bwiffi\b|\bwify\b|\bwireless\b|\binternet\s+(?:spot|access|point)s?\b/i,
  },
  {
    path: MAP_CATEGORY_ROUTE('hospital'),
    pattern: /\bhospitals?\b|\bhosptal\b|\bhospitel\b|\bemergency\s+(?:room|department|ward)\b/i,
  },
  {
    path: MAP_CATEGORY_ROUTE('police'),
    pattern: /\bpolice\b|\bpolic\b|\bpolice\s+stations?\b|\bcops?\b/i,
  },
  {
    path: MAP_CATEGORY_ROUTE('fire'),
    pattern: /\bfire\s+(?:stations?|brigades?|trucks?)\b|\bfirefighters?\b/i,
  },
  {
    path: MAP_CATEGORY_ROUTE('ambulance'),
    pattern: /\bambulances?\b|\bambo\b|\bambulence\b/i,
  },
  {
    path: MAP_CATEGORY_ROUTE('support'),
    pattern: /\bcharit(?:y|ies)\b|\bcharty\b|\bfood\s+(?:banks?|relief|parcels?|hampers?)\b|\bsupport\s+services?\b|\bfinancial\s+(?:help|support|counsel+ing)\b|\bcounsel+ing\b|\bcommunity\s+support\b/i,
  },
  {
    path: appRoutes.emergencyPack,
    pattern: /\bemergency\s+(?:pack|kit|bag)s?\b|\bgo[\s-]?bags?\b/i,
  },
  {
    path: appRoutes.map,
    pattern: /\bmap\b|\bnearby\b|\bnear\s+me\b/i,
  },
]

export function matchNavigationIntent(query: string): string | undefined {
  const trimmed = query.trim()
  if (!trimmed) return undefined
  return NAVIGATION_PATTERNS.find(({ pattern }) => pattern.test(trimmed))?.path
}

/** Offline, "map", "nearby" and "near me" open the saved nearby services instead of the Map. */
export function offlineNavigationTarget(path: string, isOnline: boolean): string {
  return !isOnline && path === appRoutes.map ? appRoutes.nearby : path
}
