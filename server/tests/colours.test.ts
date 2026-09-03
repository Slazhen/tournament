import { describe, expect, it } from 'vitest'
import { assertCompetitionColours, assertTeamColours, isColour } from '../src/lib/colours.js'

/**
 * What may be stored in a colour field.
 *
 * These values end up inside CSS declarations on public pages, and the
 * `background` shorthand accepts `url(...)`, so the check is the only thing
 * between an organiser and every visitor of a page fetching an address of their
 * choosing. It also has to run on the create and not only on the update: a club
 * created with a bad colour keeps it, because nothing re-checks a field a later
 * PATCH does not mention. That is the bug these tests exist to keep closed.
 */
describe('isColour', () => {
  it('accepts a six-digit hex colour in either case', () => {
    expect(isColour('#ff00aa')).toBe(true)
    expect(isColour('#FF00AA')).toBe(true)
  })

  it('refuses everything else', () => {
    for (const value of [
      'url(https://example.com/p.png)',
      '#fff',
      '#ffffffff',
      '#gggggg',
      ' #ffffff',
      '#ffffff ',
      // `$` in JavaScript does not match before a trailing newline the way it
      // does in some other languages, but the case is cheap to pin down.
      '#ffffff\n',
      '#ffffff;background:url(x)',
      '',
      42,
      true,
      null,
      undefined,
      ['#ffffff'],
      { toString: () => '#ffffff' },
    ]) {
      expect(isColour(value)).toBe(false)
    }
  })
})

describe('assertTeamColours', () => {
  it('passes a record with no colours in it', () => {
    expect(() => assertTeamColours({ name: 'FC Test' })).not.toThrow()
  })

  it('accepts one or two colours and a measured crest', () => {
    expect(() =>
      assertTeamColours({
        colors: ['#ff0000', '#000000'],
        crestColor: '#0a0a0a',
        crestOpaqueBackground: true,
      }),
    ).not.toThrow()
  })

  it('lets null clear a crest that could not be measured', () => {
    expect(() =>
      assertTeamColours({ crestColor: null, crestOpaqueBackground: null }),
    ).not.toThrow()
  })

  it('refuses a colour that is not a colour', () => {
    expect(() => assertTeamColours({ colors: ['url(https://example.com/p.png)'] })).toThrow()
    expect(() => assertTeamColours({ colors: [] })).toThrow()
    expect(() => assertTeamColours({ colors: ['#fff', '#000000', '#111111'] })).toThrow()
    expect(() => assertTeamColours({ colors: '#ffffff' })).toThrow()
    expect(() => assertTeamColours({ crestColor: 'red' })).toThrow()
    expect(() => assertTeamColours({ crestOpaqueBackground: 'yes' })).toThrow()
  })
})

describe('assertCompetitionColours', () => {
  it('accepts the colour read from a logo and the organiser’s override', () => {
    expect(() =>
      assertCompetitionColours({
        logoColor: '#123456',
        themeColor: '#abcdef',
        logoOpaqueBackground: false,
      }),
    ).not.toThrow()
  })

  it('lets null clear either of them', () => {
    expect(() =>
      assertCompetitionColours({
        logoColor: null,
        themeColor: null,
        logoOpaqueBackground: null,
      }),
    ).not.toThrow()
  })

  it('refuses anything that is not a colour', () => {
    expect(() => assertCompetitionColours({ themeColor: 'url(https://example.com/p.png)' })).toThrow()
    expect(() => assertCompetitionColours({ logoColor: 42 })).toThrow()
    expect(() => assertCompetitionColours({ logoOpaqueBackground: 'yes' })).toThrow()
  })
})
