import { describe, expect, it } from 'vitest'
import { matchCrisisKind, matchCrisisStage, type CrisisStage } from './matchCrisisQuery'
import type { CrisisKind } from './crisisContent'

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

  it('matches "house" synonyms (home, place, apartment, flat) and bare water-presence phrasing', () => {
    expect(matchCrisisKind('too much water in my home')).toBe('flood')
    expect(matchCrisisKind('water coming into my home')).toBe('flood')
    expect(matchCrisisKind('water in my apartment')).toBe('flood')
    expect(matchCrisisKind('my flat is under water')).toBe('flood')
    expect(matchCrisisKind('water inside the place')).toBe('flood')
    expect(matchCrisisKind('lots of water in my street')).toBe('flood')
    expect(matchCrisisKind('water everywhere help')).toBe('flood')
  })

  // Not guessed — this is the literal set of misspellings a ~800-message
  // real-world stress test produced repeatedly (people typing fast, under
  // stress, on a phone keyboard, or not fluent in English). Kept as a
  // permanent regression guard since these are shared typo-tolerant word
  // fragments reused across many phrase patterns — a change to one could
  // silently break many queries at once.
  it('tolerates common misspellings of the hazard word itself', () => {
    expect(matchCrisisKind('POWA OUT AGAIN')).toBe('power-outage')
    expect(matchCrisisKind('poewr went out')).toBe('power-outage')
    expect(matchCrisisKind('no pwr since 3 hours')).toBe('power-outage')
    expect(matchCrisisKind('energy company say planned outrage tonight')).toBe('power-outage')
    expect(matchCrisisKind('electrisity came back')).toBe('power-outage')
    expect(matchCrisisKind('black out in echuca')).toBe('power-outage')
    expect(matchCrisisKind('blackot in castlemaine')).toBe('power-outage')
    expect(matchCrisisKind('my car got washed away in the flod')).toBe('flood')
    expect(matchCrisisKind('floood water so fast')).toBe('flood')
    expect(matchCrisisKind('roads reopen after flud')).toBe('flood')
    expect(matchCrisisKind('the fload cut off our town')).toBe('flood')
    expect(matchCrisisKind('lost everything in bush-fiire')).toBe('bushfire')
    expect(matchCrisisKind('still smell smoke weeks after da bushfyre')).toBe('bushfire')
    expect(matchCrisisKind('fire went through last week')).toBe('bushfire')
    expect(matchCrisisKind('wildlife injured after the fier')).toBe('bushfire')
  })

  it('matches contextual hazard signals with no hazard-rooted word at all', () => {
    expect(matchCrisisKind('is there going to be load shedding in Charlton tmrw')).toBe('power-outage')
    expect(matchCrisisKind('heatwave coming and they say grid might fail')).toBe('power-outage')
    expect(matchCrisisKind('is the Goulburn gonna break banks?')).toBe('flood')
    expect(matchCrisisKind('the Murray is over the bridge right now')).toBe('flood')
    expect(matchCrisisKind('we need sandbags before the water comes')).toBe('flood')
    expect(matchCrisisKind('his street underwater now')).toBe('flood')
    expect(matchCrisisKind('SES told us prepare to evacuate')).toBe('flood')
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

  it('matches "when + bare hazard noun" with no auxiliary verb, as dropped by a non-native speaker', () => {
    expect(matchCrisisStage('what should i do when power cut')).toBe('during')
    expect(matchCrisisStage('what to do when bushfire')).toBe('during')
    expect(matchCrisisStage('when flood what do i do')).toBe('during')
    // "when" followed by a question word, not the hazard itself, must stay 'before'
    expect(matchCrisisStage('when should i prepare for bushfire')).toBe('before')
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

// Full combination sweep: every (hazard x stage) pair, each with several
// phrasing styles (formal, informal, broken-grammar/dropped-verb), run
// together so a fix for one query can't quietly break a different cell.
describe('matchCrisisKind + matchCrisisStage — full combination matrix', () => {
  const matrix: [string, CrisisKind, CrisisStage | undefined][] = [
    // bushfire / before
    ['How should I prepare for bushfire', 'bushfire', 'before'],
    ['what do i need before bushfire season', 'bushfire', 'before'],
    ['getting ready for bushfire', 'bushfire', 'before'],
    ['how to prepare my house for fire', 'bushfire', 'before'],
    ['bushfire plan for my family', 'bushfire', 'before'],
    // bushfire / during
    ['what should i do when bushfire is came in my home', 'bushfire', 'during'],
    ['the fire has started near my street', 'bushfire', 'during'],
    ['what to do when bushfire', 'bushfire', 'during'],
    ['fire is here now what do i do', 'bushfire', 'during'],
    ['smoke everywhere right now help', 'bushfire', 'during'],
    // bushfire / after
    ['whatshould i do after bushfire', 'bushfire', 'after'],
    ['clean up after the fire', 'bushfire', 'after'],
    ['recovery support after bushfire', 'bushfire', 'after'],
    ['is it safe to go home after fire', 'bushfire', 'after'],
    ['bushfire aftermath what to check', 'bushfire', 'after'],
    // flood / before
    ['how do i prepare for flood', 'flood', 'before'],
    ['getting ready for flood season', 'flood', 'before'],
    ['what to do before flood comes', 'flood', 'before'],
    ['flood preparation checklist', 'flood', 'before'],
    // flood / during
    ['the flood is happening right now', 'flood', 'during'],
    ['what should i do when flood', 'flood', 'during'],
    ['water is rising fast what do i do', 'flood', 'during'],
    ['flood is here now', 'flood', 'during'],
    ['my house is flooding currently', 'flood', 'during'],
    ['when flood what do i do', 'flood', 'during'],
    // flood / after
    ['clean up after the flood', 'flood', 'after'],
    ['recovery support after flood', 'flood', 'after'],
    ['is it safe after the floodwater goes down', 'flood', 'after'],
    ['what to check after flood', 'flood', 'after'],
    // flood / "house" synonyms and bare water-presence phrasing
    ['too much water in my home', 'flood', 'during'],
    ['water coming into my home', 'flood', 'during'],
    ['water in my apartment', 'flood', undefined],
    ['my flat is under water', 'flood', undefined],
    ['water inside the place', 'flood', undefined],
    ['house is under water', 'flood', undefined],
    ['lots of water in my street', 'flood', 'during'],
    ['a lot of water outside my home', 'flood', 'during'],
    ['water everywhere help', 'flood', 'during'],
    // power-outage / before
    ['how do i prepare for power outage', 'power-outage', 'before'],
    ['getting ready for blackout', 'power-outage', 'before'],
    ['what to do before power cut', 'power-outage', 'before'],
    // power-outage / during
    ['what should i do when power cut', 'power-outage', 'during'],
    ['power has gone out during the storm', 'power-outage', 'during'],
    ['blackout right now what do i do', 'power-outage', 'during'],
    ['the power just went out', 'power-outage', 'during'],
    ['no electricity currently what to do', 'power-outage', 'during'],
    // power-outage / after
    ['clean up after power outage', 'power-outage', 'after'],
    ['recovery after blackout', 'power-outage', 'after'],
    ['is my food safe after power outage', 'power-outage', 'after'],
    // bare urgency, no temporal word at all — reported as all defaulting
    // to "before" incorrectly; should read as 'during' since someone
    // typing this tersely is far more likely mid-emergency than planning
    ['fire fire what to do', 'bushfire', 'during'],
    ['power cut what to do', 'power-outage', 'during'],
    ['bushfire whom should i call', 'bushfire', 'during'],
    ['flood flood what do i do', 'flood', 'during'],
    ['flood what to do', 'flood', 'during'],
    ['who do i call flood', 'flood', 'during'],
    ['blackout blackout help', 'power-outage', 'during'],
    ['power cut who should i call', 'power-outage', 'during'],
    ['emergency bushfire', 'bushfire', 'during'],
    ['help flood water everywhere', 'flood', 'during'],
    ['fire emergency what do i do', 'bushfire', 'during'],
    // ambiguous phrasing — no clear stage signal, so no tab should be forced
    ['can i survive bushfire', 'bushfire', undefined],
    // guard against a false positive: "when" followed by a question word
    // (not the hazard itself) must stay 'before', not 'during'
    ['when should i prepare for bushfire', 'bushfire', 'before'],
  ]

  it.each(matrix)('"%s" -> kind %s, stage %s', (query, expectedKind, expectedStage) => {
    expect(matchCrisisKind(query)).toBe(expectedKind)
    expect(matchCrisisStage(query)).toBe(expectedStage)
  })
})
