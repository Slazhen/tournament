import { describe, expect, it } from 'vitest'
import { alignGroupIndexes, derivedGroupIndex, groupsOfFormat } from '../src/lib/groups.js'

const format = {
  mode: 'groups_with_divisions',
  groupsWithDivisionsConfig: { groups: [['a', 'b'], ['c', 'd']] },
}
const groups = groupsOfFormat(format)

describe('the group a fixture is in', () => {
  it('follows the clubs when they are changed by hand', () => {
    // Drawn in group 1's slot, re-paired with two clubs of group 2.
    const stored = { id: 'm', homeTeamId: 'a', awayTeamId: 'b', groupIndex: 1 }
    expect(derivedGroupIndex(groups, stored, { homeTeamId: 'c', awayTeamId: 'd' })).toBe(2)
  })

  it('is left alone while the pairing crosses two groups', () => {
    const stored = { id: 'm', homeTeamId: 'a', awayTeamId: 'b', groupIndex: 1 }
    expect(derivedGroupIndex(groups, stored, { homeTeamId: 'c' })).toBeUndefined()
  })

  it('is never given to a playoff fixture', () => {
    const stored = { id: 'm', homeTeamId: 'a', awayTeamId: 'b', isPlayoff: true }
    expect(derivedGroupIndex(groups, stored, {})).toBeUndefined()
  })

  it('does not exist outside a grouped season', () => {
    expect(groupsOfFormat({ mode: 'league' })).toEqual([])
    expect(groupsOfFormat(undefined)).toEqual([])
  })
})

describe('a body that writes matches whole', () => {
  it('has every group-stage fixture renumbered from its pairing', () => {
    const body = {
      matches: [
        { id: 'm1', homeTeamId: 'c', awayTeamId: 'd', groupIndex: 1 },
        { id: 'm2', homeTeamId: 'a', awayTeamId: 'c', groupIndex: 1 },
        { id: 'p1', homeTeamId: 'a', awayTeamId: 'b', isPlayoff: true },
      ],
    }
    const out = alignGroupIndexes(body, format).matches as Record<string, unknown>[]
    expect(out[0].groupIndex).toBe(2)
    expect(out[1].groupIndex).toBe(1)
    expect(out[2].groupIndex).toBeUndefined()
  })

  it('reads the groups the write will leave behind', () => {
    const regrouped = {
      ...format,
      groupsWithDivisionsConfig: { groups: [['c', 'd'], ['a', 'b']] },
    }
    const body = { format: regrouped, matches: [{ id: 'm1', homeTeamId: 'c', awayTeamId: 'd' }] }
    const out = alignGroupIndexes(body, format).matches as Record<string, unknown>[]
    expect(out[0].groupIndex).toBe(1)
  })
})
