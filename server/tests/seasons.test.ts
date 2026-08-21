import { describe, expect, it } from 'vitest'
import { seriesSlug, seasonSlug, seriesKey, tournamentSlug } from '../src/lib/slugs.js'
import { toSummary } from '../src/repos.js'
import type { Tournament } from '../src/lib/types.js'

/**
 * Seasons.
 *
 * The addresses are the part worth pinning down: a link to a tournament shared
 * before seasons existed has to keep resolving, and two seasons of the same
 * competition have to land on different pages.
 */

const season = (over: Partial<Tournament> = {}): Tournament => ({
  id: 't-1',
  name: 'Homebush Futsal Premier League',
  organizerId: 'org-1',
  createdAtISO: '2025-09-08T00:00:00.000Z',
  teamIds: ['a', 'b'],
  matches: [],
  ...over,
})

describe('season slugs', () => {
  it('names the competition, not the season, in the series slug', () => {
    const first = season({ seriesName: 'Homebush Futsal Premier League', seasonLabel: '2025' })
    const second = season({
      id: 't-2',
      seriesId: 't-1',
      seriesName: 'Homebush Futsal Premier League',
      seasonLabel: '2026',
      createdAtISO: '2026-01-05T00:00:00.000Z',
    })

    expect(seriesSlug(first)).toBe('homebush_futsal_premier_league')
    expect(seriesSlug(second)).toBe('homebush_futsal_premier_league')
    expect(seasonSlug(first)).toBe('2025')
    expect(seasonSlug(second)).toBe('2026')
  })

  it('falls back to the name and the year for a tournament that predates seasons', () => {
    const legacy = season()
    expect(seriesSlug(legacy)).toBe('homebush_futsal_premier_league')
    expect(seasonSlug(legacy)).toBe('2025')
    // And its old address is unchanged, so links already shared still resolve.
    expect(tournamentSlug(legacy)).toBe('homebush_futsal_premier_league_2025')
  })

  it('groups seasons by the id they share, and leaves a lone tournament alone', () => {
    expect(seriesKey(season({ id: 't-2', seriesId: 't-1' }))).toBe('t-1')
    expect(seriesKey(season({ id: 't-9' }))).toBe('t-9')
  })
})

describe('season status', () => {
  const withMatches = (matches: unknown[]) => toSummary(season({ matches }))

  it('is upcoming until a score is entered', () => {
    expect(withMatches([]).status).toBe('upcoming')
    expect(withMatches([{ id: 'm1' }, { id: 'm2' }]).status).toBe('upcoming')
  })

  it('is running once some matches have results', () => {
    expect(withMatches([{ homeGoals: 1, awayGoals: 0 }, { id: 'm2' }]).status).toBe('running')
  })

  it('is finished when every match has one', () => {
    expect(
      withMatches([
        { homeGoals: 1, awayGoals: 0 },
        { homeGoals: 2, awayGoals: 2 },
      ]).status,
    ).toBe('finished')
  })

  it('carries the season fields a listing needs', () => {
    const summary = toSummary(
      season({ id: 't-2', seriesId: 't-1', seriesName: 'League', seasonLabel: '2026' }),
    )
    expect(summary.seriesId).toBe('t-1')
    expect(summary.seriesName).toBe('League')
    expect(summary.seasonLabel).toBe('2026')
  })
})
