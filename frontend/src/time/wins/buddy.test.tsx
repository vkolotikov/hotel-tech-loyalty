import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import en from '../i18n/wins.en.json'
import type { RecognitionMe } from '../lib/types'
import { Buddy } from './Buddy'
import { BUDDY_KINDS, MOODS, NO_BUDDY, buddiesOn, buddyOf, cheerMood, choiceOf, crowned, moodOf, podiumBuddy, rowBuddy } from './buddyLogic'
import { BUDDY_NAMES, BUDDY_SAYS } from './words'

const today = (extra: Partial<RecognitionMe['today']> = {}): RecognitionMe['today'] => ({
  planned: 4, done: 0, goal: 3, goal_met: false, sweep: false, day_planned: false, planned_pct: 40, important_done: 0, points: 0, ...extra,
})

describe('which character, and whether any', () => {
  it('draws the four the server names and nothing it does not know', () => {
    expect(BUDDY_KINDS).toEqual(['hexi', 'pip', 'miu', 'ember'])
    expect(BUDDY_KINDS.map(buddyOf)).toEqual(['hexi', 'pip', 'miu', 'ember'])
    // None, nothing, and a character of a newer server this build cannot draw: no character.
    expect([buddyOf(null), buddyOf(undefined), buddyOf('none'), buddyOf('dragon'), buddyOf(7)]).toEqual([null, null, null, null, null])
  })

  it('reads a person’s own choice: a character, none, or nothing yet', () => {
    expect([choiceOf('miu'), choiceOf(NO_BUDDY), choiceOf(null), choiceOf('dragon')]).toEqual(['miu', 'none', null, null])
  })

  it('shows characters only where the answer says the organisation does', () => {
    expect([buddiesOn({ buddies: true }), buddiesOn({ buddies: false })]).toEqual([true, false])
    // An answer that does not say (an older server, while a release is under way): none, so nothing is offered that could not be saved.
    expect([buddiesOn({}), buddiesOn(undefined)]).toEqual([false, false])
    expect([rowBuddy({ buddies: true }, { buddy: 'pip' }), rowBuddy({ buddies: false }, { buddy: 'pip' }), rowBuddy({}, { buddy: 'pip' }), rowBuddy({ buddies: true }, { buddy: null })])
      .toEqual(['pip', null, null, null])
  })
})

describe('a character’s mood follows the day', () => {
  it('sleeps with nothing planned, is ready before the first task, busy after it, proud at the goal, and parties at a clean sweep', () => {
    expect(moodOf(today({ planned: 0 }))).toBe('sleepy')
    expect(moodOf(today())).toBe('ready')
    expect(moodOf(today({ done: 1 }))).toBe('busy')
    expect(moodOf(today({ done: 3, goal_met: true }))).toBe('proud')
    expect(moodOf(today({ done: 4, goal_met: true, sweep: true }))).toBe('party')
    // Work finished on a day with nothing planned for it (an overdue task done today): awake and busy.
    expect(moodOf(today({ planned: 0, done: 1 }))).toBe('busy')
    expect(MOODS).toEqual(['sleepy', 'ready', 'busy', 'proud', 'party'])
  })

  it('crowns the week’s leader among more than one, where places are told', () => {
    expect(crowned({ rank: 1, of: 5 })).toBe(true)
    expect([crowned({ rank: 2, of: 5 }), crowned({ rank: 1, of: 1 }), crowned({ rank: null, of: null }), crowned({ rank: 1, of: null })]).toEqual([false, false, false, false])
  })

  it('puts the winner on the podium crowned and celebrating, the others proud, and nobody without a character', () => {
    const on = { buddies: true }
    expect(podiumBuddy(on, { buddy: 'pip' }, 1)).toEqual({ kind: 'pip', mood: 'party', crown: true })
    expect(podiumBuddy(on, { buddy: 'miu' }, 2)).toEqual({ kind: 'miu', mood: 'proud', crown: false })
    expect(podiumBuddy(on, { buddy: 'ember' }, 3)).toEqual({ kind: 'ember', mood: 'proud', crown: false })
    expect([podiumBuddy(on, { buddy: null }, 1), podiumBuddy(on, {}, 2), podiumBuddy(on, { buddy: 'dragon' }, 1), podiumBuddy({ buddies: false }, { buddy: 'pip' }, 1)]).toEqual([null, null, null, null])
  })

  it('parties for the big moments of a celebration and is proud of the smaller ones', () => {
    expect([cheerMood({ big: true }), cheerMood({ big: false })]).toEqual(['party', 'proud'])
  })
})

describe('the characters as they are drawn', () => {
  const draw = (props: Parameters<typeof Buddy>[0]) => renderToStaticMarkup(<Buddy {...props} />)

  it('draws every character in every mood as decoration, with its kind and mood for the stylesheet', () => {
    for (const kind of BUDDY_KINDS) {
      for (const mood of MOODS) {
        const html = draw({ kind, mood, size: 64 })
        expect(html).toMatch(new RegExp(`^<svg viewBox="0 0 120 120" width="64" height="64" aria-hidden="true" focusable="false" data-kind="${kind}" data-mood="${mood}" class="time-buddy shrink-0 "`))
        // One body, two arms, two feet, and no words of its own.
        expect((html.match(/time-buddy-arm-[lr]/g) ?? []).length).toBe(2)
        expect((html.match(/class="time-buddy-foot"/g) ?? []).length).toBe(2)
        expect(html.replace(/<[^>]+>/g, '')).toBe('')
      }
    }
  })

  it('closes the eyes asleep, opens them awake, and laughs at a party', () => {
    const asleep = draw({ kind: 'pip', mood: 'sleepy' })
    expect(asleep).toContain('class="time-buddy-zzz"')
    expect(asleep).not.toContain('class="time-buddy-eyes"')
    expect(asleep).not.toContain('class="time-buddy-sparks"')
    for (const mood of ['ready', 'busy', 'proud'] as const) {
      const awake = draw({ kind: 'pip', mood })
      expect(awake).toContain('class="time-buddy-eyes"')
      expect(awake).not.toContain('class="time-buddy-zzz"')
    }
    const party = draw({ kind: 'pip', mood: 'party' })
    expect(party).toContain('class="time-buddy-sparks"')
    expect(party).toContain('class="time-buddy-tongue"')
    expect(party).not.toContain('class="time-buddy-eyes"')
    // Each mood has a mouth of its own.
    expect(new Set(MOODS.map(mood => draw({ kind: 'hexi', mood }).match(/<g transform="translate\(0 0\)">(.*?)<\/g>(?:<g transform|<\/g>)/)?.[1])).size).toBe(MOODS.length)
  })

  it('gives each character what is its own: an antenna, a sprout, ears and a tail, a flame’s heart', () => {
    expect(draw({ kind: 'hexi' })).toContain('class="time-buddy-bulb"')
    expect((draw({ kind: 'pip' }).match(/class="time-buddy-leaf"/g) ?? []).length).toBe(2)
    const miu = draw({ kind: 'miu' })
    expect(miu).toContain('time-buddy-tail')
    expect(miu).toContain('class="time-buddy-whisker"')
    expect((miu.match(/class="time-buddy-inner"/g) ?? []).length).toBe(2)
    expect(draw({ kind: 'ember' })).toContain('class="time-buddy-glow"')
    // A different body for each.
    expect(new Set(BUDDY_KINDS.map(kind => draw({ kind }).match(/<(polygon|circle|rect|path) class="time-buddy-skin[^>]*>/g)?.join(''))).size).toBe(4)
  })

  it('crowns the leader in place of what sits on top, and stands still in a list', () => {
    const crowned = draw({ kind: 'hexi', mood: 'party', crown: true })
    expect(crowned).toContain('data-crown="true"')
    expect(crowned).toContain('class="time-buddy-crown"')
    expect(crowned).not.toContain('class="time-buddy-bulb"')
    expect(draw({ kind: 'pip', crown: true })).not.toContain('class="time-buddy-leaf"')
    // A cat keeps its ears under the crown.
    expect(draw({ kind: 'miu', crown: true })).toContain('class="time-buddy-inner"')
    expect(draw({ kind: 'hexi' })).not.toContain('time-buddy-crown')
    expect(draw({ kind: 'hexi' })).not.toContain('data-crown')
    expect(draw({ kind: 'ember', still: true })).toContain('data-still="true"')
    expect(draw({ kind: 'ember' })).not.toContain('data-still')
    expect(draw({ kind: 'ember', size: 148, className: 'time-buddy-peek' })).toContain('class="time-buddy shrink-0 time-buddy-peek"')
  })
})

describe('the characters’ default words are the English bundle’s', () => {
  it('for every name and every call', () => {
    for (const kind of BUDDY_KINDS) expect(BUDDY_NAMES[kind]).toBe((en.buddy.name as Record<string, string>)[kind])
    for (const mood of MOODS) expect(BUDDY_SAYS[mood]).toBe((en.buddy.say as Record<string, string>)[mood])
  })
})
