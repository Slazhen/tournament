import { describe, expect, it } from 'vitest'
import type { Match } from '../types'
import { advanceKnockoutWinners, generateKnockoutSchedule } from './schedule'

const score = (matches: Match[], id: string, home: number, away: number): Match[] =>
  matches.map((match) => (match.id === id ? { ...match, homeGoals: home, awayGoals: away } : match))

const find = (matches: Match[], round: number, index: number, leg?: number) =>
  matches.find(
    (match) =>
      match.playoffRound === round &&
      match.playoffMatch === index &&
      !match.isThirdPlace &&
      (leg === undefined || match.tie?.leg === leg),
  )

const pairings = (matches: Match[], round: number) =>
  matches
    .filter((match) => match.playoffRound === round && !match.isThirdPlace)
    .map((match) => `${match.homeTeamId || '?'}-${match.awayTeamId || '?'}`)

describe('a bracket of one match per tie', () => {
  const four = ['a', 'b', 'c', 'd']

  it('seeds so that the top two can only meet in the final', () => {
    const matches = generateKnockoutSchedule(four)
    expect(pairings(matches, 0)).toEqual(['a-d', 'b-c'])
    expect(pairings(matches, 1)).toEqual(['?-?'])
  })

  it('moves both winners into the final', () => {
    let matches = generateKnockoutSchedule(four)
    matches = score(matches, find(matches, 0, 0)!.id, 2, 0)
    matches = score(matches, find(matches, 0, 1)!.id, 0, 1)
    matches = advanceKnockoutWinners(matches)
    expect(pairings(matches, 1)).toEqual(['a-c'])
  })

  it('leaves the final empty while a semi-final is level', () => {
    let matches = generateKnockoutSchedule(four)
    matches = score(matches, find(matches, 0, 0)!.id, 1, 1)
    matches = advanceKnockoutWinners(matches)
    expect(find(matches, 1, 0)!.homeTeamId).toBe('')
  })

  it('takes the club that won the shootout through', () => {
    let matches = generateKnockoutSchedule(four)
    const semi = find(matches, 0, 0)!.id
    matches = score(matches, semi, 1, 1)
    matches = matches.map((match) =>
      match.id === semi ? { ...match, shootout: { home: 2, away: 4 } } : match,
    )
    matches = advanceKnockoutWinners(matches)
    expect(find(matches, 1, 0)!.homeTeamId).toBe('d')
  })

  it('moves the new winner in when a result is corrected', () => {
    let matches = generateKnockoutSchedule(four)
    const semi = find(matches, 0, 0)!.id
    matches = advanceKnockoutWinners(score(matches, semi, 2, 0))
    expect(find(matches, 1, 0)!.homeTeamId).toBe('a')

    matches = advanceKnockoutWinners(score(matches, semi, 0, 2))
    expect(find(matches, 1, 0)!.homeTeamId).toBe('d')
  })

  it('gives the odd club out a bye into the second round', () => {
    const matches = generateKnockoutSchedule(['a', 'b', 'c'])
    // Four slots, three clubs: the top seed's opponent is missing, so it starts
    // in the final rather than playing a fixture against nobody.
    expect(pairings(matches, 0)).toEqual(['b-c'])
    expect(find(matches, 1, 0)!.homeTeamId).toBe('a')
  })
})

describe('a bracket of two legs', () => {
  const four = ['a', 'b', 'c', 'd']

  it('draws each tie twice with the sides reversed', () => {
    const matches = generateKnockoutSchedule(four, { legs: 2 })
    expect(pairings(matches, 0)).toEqual(['a-d', 'd-a', 'b-c', 'c-b'])
    expect(find(matches, 0, 0, 1)!.tie!.id).toBe(find(matches, 0, 0, 2)!.tie!.id)
  })

  it('decides on the two scores together, not on the second leg', () => {
    let matches = generateKnockoutSchedule(four, { legs: 2 })
    // a wins the first leg 3-0 and loses the second 0-1: 3-1 on aggregate.
    matches = score(matches, find(matches, 0, 0, 1)!.id, 3, 0)
    matches = score(matches, find(matches, 0, 0, 2)!.id, 1, 0)
    matches = advanceKnockoutWinners(matches)
    expect(find(matches, 1, 0, 1)!.homeTeamId).toBe('a')
  })

  it('puts the winner on the same side of both legs of the next tie', () => {
    let matches = generateKnockoutSchedule(four, { legs: 2 })
    matches = score(matches, find(matches, 0, 0, 1)!.id, 1, 0)
    matches = score(matches, find(matches, 0, 0, 2)!.id, 0, 0)
    matches = advanceKnockoutWinners(matches)
    // a is the home side of the tie: home in the first leg, away in the second.
    expect(find(matches, 1, 0, 1)!.homeTeamId).toBe('a')
    expect(find(matches, 1, 0, 2)!.awayTeamId).toBe('a')
  })

  it('advances nobody while only one leg has been played', () => {
    let matches = generateKnockoutSchedule(four, { legs: 2 })
    matches = advanceKnockoutWinners(score(matches, find(matches, 0, 0, 1)!.id, 5, 0))
    expect(find(matches, 1, 0, 1)!.homeTeamId).toBe('')
  })
})

describe('the third-place match', () => {
  const four = ['a', 'b', 'c', 'd']

  it('is not drawn unless it was asked for', () => {
    expect(generateKnockoutSchedule(four).some((match) => match.isThirdPlace)).toBe(false)
  })

  it('takes the two beaten semi-finalists', () => {
    let matches = generateKnockoutSchedule(four, { thirdPlace: true })
    matches = score(matches, find(matches, 0, 0)!.id, 2, 0)
    matches = score(matches, find(matches, 0, 1)!.id, 0, 1)
    matches = advanceKnockoutWinners(matches)

    const third = matches.find((match) => match.isThirdPlace)!
    expect([third.homeTeamId, third.awayTeamId]).toEqual(['d', 'b'])
  })

  it('knocks nobody out and is not part of the bracket', () => {
    const matches = generateKnockoutSchedule(four, { thirdPlace: true })
    const third = matches.find((match) => match.isThirdPlace)!
    expect(third.isElimination).toBe(false)
    // The final is still the only fixture the semi-finals feed.
    expect(pairings(matches, 1)).toEqual(['?-?'])
  })
})
