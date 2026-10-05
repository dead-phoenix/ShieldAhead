export const UNCONFIRMED_SUBURB = 'Area not confirmed'

/** Roughly two printed lines in a half-width A4 column. */
export const PLACE_TEXT_MAX_CHARS = 80

export interface PlaceTextInput {
  name: string
  address?: string
  suburb?: string
  postcode?: string
}

const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])
const KEEP_UPPER = new Set([
  'ABC', 'ACMI', 'CALD', 'CBD', 'CFA', 'ID', 'LGBTIQ', 'LGBTIQA', 'NDIS', 'NSW', 'QLD',
  'RMIT', 'RSL', 'SES', 'TAFE', 'UK', 'USA', 'VIC', 'VICSES', 'YMCA', 'YWCA',
])
const STATES = new Set(['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'])
const UNIT_WORD = '(?:se|ste|suite|unit|u|shop|shp|level|lvl|l|flat|apt|apartment)\\b\\.?\\s*[\\w/-]*\\d[\\w/-]*'
const UNIT_PREFIX = new RegExp(`^${UNIT_WORD}\\s+(?=\\d|${UNIT_WORD}\\s)`, 'i')
const UNIT_ONLY = new RegExp(`^${UNIT_WORD}$`, 'i')

function isAllUpperCase(text: string): boolean {
  return /[A-Z]/.test(text) && !/[a-z]/.test(text)
}

function titleCaseWord(word: string, isFirst: boolean): string {
  const bare = word.replace(/[^A-Za-z]/g, '')
  if (KEEP_UPPER.has(bare)) return word
  const lower = word.toLowerCase()
  if (!isFirst && SMALL_WORDS.has(bare.toLowerCase())) return lower
  return lower
    .replace(/(^|[-(/"])([a-z])/g, (_match, before: string, letter: string) => `${before}${letter.toUpperCase()}`)
    .replace(/^o'([a-z])/, (_match, letter: string) => `O'${letter.toUpperCase()}`)
}

export function packDisplayName(name: string): string {
  const trimmed = name.trim()
  if (!isAllUpperCase(trimmed)) return trimmed
  return trimmed.split(/\s+/).map((word, index) => titleCaseWord(word, index === 0)).join(' ')
}

function isPostcode(token: string): boolean {
  return /^\d{4}$/.test(token)
}

function stateToken(token: string): string | undefined {
  const upper = token.replace(/\.$/, '').toUpperCase()
  return STATES.has(upper) ? upper : undefined
}

function isLocalityOnly(part: string): boolean {
  return part.split(/\s+/).every((token) => isPostcode(token) || Boolean(stateToken(token)))
}

function knownSuburb(suburb: string | undefined): string {
  const trimmed = suburb?.trim() ?? ''
  return trimmed && trimmed !== UNCONFIRMED_SUBURB ? trimmed : ''
}

function rawAddress({ address, suburb, postcode }: PlaceTextInput): string {
  const locality = [knownSuburb(suburb), postcode?.trim()].filter(Boolean).join(' ')
  return address?.trim() ? [address.trim(), locality].filter(Boolean).join(', ') : locality
}

/**
 * Collapses repeated suburb, state and postcode parts and drops leading unit or suite
 * numbers. Only reorders and removes parts that are already present.
 */
export function packPlaceAddress(place: PlaceTextInput): string | undefined {
  let suburb = knownSuburb(place.suburb)
  if (!place.address?.trim() && !suburb) return undefined

  const parts = (place.address ?? '').split(',').map((part) => part.trim()).filter(Boolean)
  const street: string[] = []
  let state: string | undefined
  let postcode = place.postcode?.trim() || undefined

  parts.forEach((part, index) => {
    if (UNIT_ONLY.test(part) && /^\d/.test(parts.slice(index + 1).find((later) => !UNIT_ONLY.test(later)) ?? '')) return
    let streetPart = part
    while (street.length === 0 && UNIT_PREFIX.test(streetPart)) streetPart = streetPart.replace(UNIT_PREFIX, '')
    const tokens = streetPart.split(/\s+/)
    let hadLocalityTokens = false
    while (tokens.length > 0) {
      const last = tokens[tokens.length - 1]
      const lastState = stateToken(last)
      if (isPostcode(last)) postcode ??= last
      else if (lastState) state ??= lastState
      else break
      tokens.pop()
      hadLocalityTokens = true
    }

    let rest = tokens.join(' ')
    const lowerSuburb = suburb.toLowerCase()
    if (suburb && rest.toLowerCase() === lowerSuburb) return
    if (suburb && hadLocalityTokens && rest.toLowerCase().endsWith(` ${lowerSuburb}`)) {
      rest = rest.slice(0, -(suburb.length + 1)).trim()
    }
    if (!rest) return

    const followedByLocality = parts.length > index + 1 && parts.slice(index + 1).every(isLocalityOnly)
    if (!suburb && !/\d/.test(rest) && (hadLocalityTokens || (index > 0 && followedByLocality))) {
      suburb = rest
      return
    }
    if (!street.some((existing) => existing.toLowerCase() === rest.toLowerCase())) street.push(rest)
  })

  const locality = [suburb, state, postcode].filter(Boolean).join(' ')
  const cleaned = [street.join(', '), locality].filter(Boolean).join(', ')
  return cleaned || rawAddress(place) || undefined
}

export function clampPlaceText(text: string, maxChars = PLACE_TEXT_MAX_CHARS): string {
  if (text.length <= maxChars) return text
  const cut = text.slice(0, maxChars - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,]+$/, '')}…`
}

function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function addressKey(place: PlaceTextInput): string {
  return normalizeKey(packPlaceAddress(place) ?? '')
    .split(' ')
    .filter((token) => !stateToken(token))
    .join(' ')
}

export function distinctPlaces<T extends PlaceTextInput>(places: T[]): T[] {
  const seen = new Set<string>()
  return places.filter((place) => {
    const key = `${normalizeKey(place.name)}|${addressKey(place)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
