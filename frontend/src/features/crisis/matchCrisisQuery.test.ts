import { describe, expect, it } from 'vitest'
import { matchCrisisKind } from './matchCrisisQuery'

describe('matchCrisisKind', () => {
  it('matches the mentor-provided example', () => {
    expect(matchCrisisKind('How should I prepare for bushfire')).toBe('bushfire')
  })

  it('matches an informal question regardless of grammar, not just the official phrasing', () => {
    expect(matchCrisisKind('can i survive bushfire')).toBe('bushfire')
    expect(matchCrisisKind('will my house be ok in a bush fire')).toBe('bushfire')
    expect(matchCrisisKind('so much smoke outside is it safe')).toBe('bushfire')
  })

  it('matches flood phrasing, including plain non-technical wording', () => {
    expect(matchCrisisKind('My street is flooding, what do I do')).toBe('flood')
    expect(matchCrisisKind('rising water near my house')).toBe('flood')
    expect(matchCrisisKind('there is water inside my house what should i do')).toBe('flood')
    expect(matchCrisisKind('heavy rain all night is my area safe')).toBe('flood')
  })

  it('matches power outage phrasing, including plain non-technical wording', () => {
    expect(matchCrisisKind('the power just went out')).toBe('power-outage')
    expect(matchCrisisKind('blackout in my suburb')).toBe('power-outage')
    expect(matchCrisisKind('the lights went out at my house')).toBe('power-outage')
    expect(matchCrisisKind('we have no electricity since last night')).toBe('power-outage')
    expect(matchCrisisKind('everything is dark no power')).toBe('power-outage')
  })

  it('returns undefined for unrelated or empty text', () => {
    expect(matchCrisisKind('what wifi is nearby')).toBeUndefined()
    expect(matchCrisisKind('   ')).toBeUndefined()
    expect(matchCrisisKind('')).toBeUndefined()
  })
})
