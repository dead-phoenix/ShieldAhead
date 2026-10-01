import { describe, expect, it } from 'vitest'
import { matchCrisisKind, matchCrisisStage } from './matchCrisisQuery'

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

describe('matchCrisisStage', () => {
  it('matches the two example queries to different stages, not both to "before"', () => {
    expect(matchCrisisStage('what should i do when bushfire is came in my home')).toBe('during')
    expect(matchCrisisStage('whatshould i do after bushfire')).toBe('after')
  })

  it('matches other during-stage phrasing', () => {
    expect(matchCrisisStage('the flood is happening right now')).toBe('during')
    expect(matchCrisisStage('power has gone out during the storm')).toBe('during')
    expect(matchCrisisStage('the fire has started near my street')).toBe('during')
  })

  it('matches other after-stage phrasing', () => {
    expect(matchCrisisStage('clean up after the flood')).toBe('after')
    expect(matchCrisisStage('recovery support after bushfire')).toBe('after')
  })

  it('matches before-stage phrasing', () => {
    expect(matchCrisisStage('How should I prepare for bushfire')).toBe('before')
    expect(matchCrisisStage('getting ready for flood season')).toBe('before')
  })

  it('returns undefined when no stage is implied', () => {
    expect(matchCrisisStage('can i survive bushfire')).toBeUndefined()
    expect(matchCrisisStage('')).toBeUndefined()
  })
})
