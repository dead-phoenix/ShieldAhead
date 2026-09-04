import { describe, expect, it } from 'vitest'
import { parseManualLocationQuery } from './resolveSearchLocation'

describe('manual location parsing', () => {
  it('treats four digits as a postcode', () => {
    expect(parseManualLocationQuery('3453')).toEqual({ kind: 'postcode', postcode: '3453' })
  })

  it('pulls an embedded Victorian postcode out of a suburb line', () => {
    expect(parseManualLocationQuery('Harcourt 3453')).toEqual({ kind: 'postcode', postcode: '3453' })
  })

  it('keeps suburb names for a later lookup', () => {
    expect(parseManualLocationQuery('Bendigo')).toEqual({ kind: 'place', query: 'Bendigo' })
  })
})
