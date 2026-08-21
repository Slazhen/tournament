import { api, isSignedIn } from './api'
import type { Team, Tournament, Organizer, Match, Player } from '../types'

/**
 * Data access for the whole app.
 *
 * This file replaces the old aws-database.ts, which spoke to DynamoDB and S3
 * directly from the browser using access keys shipped in the bundle. The
 * exported shape is intentionally the same so the pages did not have to change:
 * only the implementation moved behind the API.
 *
 * Reads go to /public/* for visitors and /admin/* for a signed-in user, because
 * the two return different things — /public never includes a private tournament.
 */

const MAX_BATCH = 500

export const organizerService = {
  async getAll(): Promise<Organizer[]> {
    return isSignedIn()
      ? api.get<Organizer[]>('/admin/organizers')
      : api.get<Organizer[]>('/public/organizers')
  },

  async create(name: string, email: string): Promise<Organizer | null> {
    return api.post<Organizer>('/admin/organizers', { name, email })
  },

  async update(id: string, updates: Partial<Organizer>): Promise<boolean> {
    await api.patch(`/admin/organizers/${encodeURIComponent(id)}`, updates)
    return true
  },

  async delete(id: string): Promise<boolean> {
    await api.delete(`/admin/organizers/${encodeURIComponent(id)}`)
    return true
  },
}

export const teamService = {
  async getAll(): Promise<Team[]> {
    return isSignedIn() ? api.get<Team[]>('/admin/teams') : api.get<Team[]>('/public/teams')
  },

  async getByOrganizer(organizerId: string): Promise<Team[]> {
    const path = `/public/organizers/${encodeURIComponent(organizerId)}/teams`
    return isSignedIn() ? api.get<Team[]>('/admin/teams') : api.get<Team[]>(path)
  },

  async create(team: Omit<Team, 'id' | 'createdAtISO'>): Promise<Team | null> {
    return api.post<Team>('/admin/teams', team)
  },

  async update(id: string, updates: Partial<Team>): Promise<boolean> {
    await api.patch(`/admin/teams/${encodeURIComponent(id)}`, updates)
    return true
  },

  async delete(id: string): Promise<boolean> {
    await api.delete(`/admin/teams/${encodeURIComponent(id)}`)
    return true
  },
}

/** Fetches exactly the teams a page needs, by id. */
export async function batchGetTeams(teamIds: string[]): Promise<Team[]> {
  if (!teamIds || teamIds.length === 0) return []

  const teams: Team[] = []
  for (let i = 0; i < teamIds.length; i += MAX_BATCH) {
    const chunk = teamIds.slice(i, i + MAX_BATCH)
    teams.push(...(await api.post<Team[]>('/public/teams/batch', { teamIds: chunk })))
  }
  return teams
}

export type TournamentSummary = {
  id: string
  name: string
  organizerId: string
  createdAtISO: string
  visibility?: 'public' | 'private'
  logo?: string
  teamCount: number
  /** Season fields, so a listing can group and label without loading matches. */
  seriesId?: string
  seriesName?: string
  seasonLabel?: string
  championTeamId?: string
  status?: 'upcoming' | 'running' | 'finished'
}

/** A public tournament page's worth of data, in one request. */
export type SeasonBundle = {
  tournament: Tournament
  teams: Team[]
  organizer: Organizer
  /** Every public season of the same competition, newest first. */
  seasons: TournamentSummary[]
  /** Which kind of address resolved to it: an old link, a competition, a season. */
  matchedAs: 'tournament' | 'series' | 'season'
}

export const tournamentService = {
  async getAll(): Promise<Tournament[]> {
    return isSignedIn()
      ? api.get<Tournament[]>('/admin/tournaments')
      : api.get<Tournament[]>('/public/tournaments/full')
  },

  /** Lightweight list for index pages: no matches, no lineups. */
  async getAllSummaries(): Promise<TournamentSummary[]> {
    return api.get<TournamentSummary[]>('/public/tournaments')
  },

  async getById(id: string): Promise<Tournament | null> {
    const path = isSignedIn()
      ? `/admin/tournaments/${encodeURIComponent(id)}`
      : `/public/tournaments/${encodeURIComponent(id)}`
    return api.get<Tournament>(path)
  },

  /**
   * Everything a public tournament page needs, in a single request: the
   * tournament, its teams and the organizer. Replaces the old three-step dance
   * of "download all summaries to resolve the slug, then the tournament, then
   * its teams", where each call had to wait for the one before it.
   */
  async getBySlug(organizerSlug: string, tournamentSlug: string): Promise<SeasonBundle | null> {
    try {
      return await api.get(
        `/public/by-slug/${encodeURIComponent(organizerSlug)}/${encodeURIComponent(tournamentSlug)}`,
      )
    } catch {
      return null
    }
  },

  /** One named season of one competition. */
  async getSeason(
    organizerSlug: string,
    seriesSlug: string,
    seasonSlug: string,
  ): Promise<SeasonBundle | null> {
    try {
      return await api.get(
        `/public/season/${encodeURIComponent(organizerSlug)}/${encodeURIComponent(seriesSlug)}/${encodeURIComponent(seasonSlug)}`,
      )
    } catch {
      return null
    }
  },

  async getByOrganizer(organizerId: string): Promise<Tournament[]> {
    return isSignedIn()
      ? api.get<Tournament[]>('/admin/tournaments')
      : api.get<Tournament[]>(`/public/organizers/${encodeURIComponent(organizerId)}/tournaments`)
  },

  async create(tournament: Omit<Tournament, 'id' | 'createdAtISO'>): Promise<Tournament | null> {
    return api.post<Tournament>('/admin/tournaments', tournament)
  },

  async update(id: string, updates: Partial<Tournament>): Promise<boolean> {
    await api.patch(`/admin/tournaments/${encodeURIComponent(id)}`, updates)
    return true
  },

  async delete(id: string): Promise<boolean> {
    await api.delete(`/admin/tournaments/${encodeURIComponent(id)}`)
    return true
  },
}

export type TeamContext = {
  team: Team
  tournaments: Tournament[]
  teams: Team[]
}

export type PlayerContext = TeamContext & { player: Player }

/**
 * The public team and player pages used to load every team and every tournament
 * in the system and filter in the browser — roughly 95 KB of JSON to render one
 * page. These two calls return only what the page shows.
 */
export const publicPages = {
  async teamContext(teamId: string): Promise<TeamContext | null> {
    try {
      return await api.get<TeamContext>(`/public/teams/${encodeURIComponent(teamId)}/context`)
    } catch {
      return null
    }
  },

  async playerContext(playerId: string): Promise<PlayerContext | null> {
    try {
      return await api.get<PlayerContext>(`/public/players/${encodeURIComponent(playerId)}`)
    } catch {
      return null
    }
  },
}

/**
 * Players are stored inside their team, but they are edited one at a time.
 *
 * Saving a player used to mean sending the team's whole squad back, so two edits
 * made close together overwrote each other — a surname typed right after a first
 * name could simply vanish. These calls touch one player and leave the rest of
 * the list alone.
 */
export const playerService = {
  async add(teamId: string, player: Partial<Player>): Promise<Player> {
    return api.post<Player>(`/admin/teams/${encodeURIComponent(teamId)}/players`, player)
  },

  async update(teamId: string, playerId: string, updates: Partial<Player>): Promise<Player> {
    return api.patch<Player>(
      `/admin/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(playerId)}`,
      updates,
    )
  },

  async remove(teamId: string, playerId: string): Promise<void> {
    await api.delete(
      `/admin/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(playerId)}`,
    )
  },
}

export const matchService = {
  async updateMatchInTournament(
    tournamentId: string,
    matchId: string,
    updates: Partial<Match>,
  ): Promise<boolean> {
    await api.patch(
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}`,
      updates,
    )
    return true
  },
}

/* ------------------------------------------------------------------ *
 * Images
 * ------------------------------------------------------------------ */

export type UploadScope =
  | { kind: 'team'; id: string }
  | { kind: 'player'; id: string }
  | { kind: 'tournament'; id: string }

type PresignedUpload = {
  url: string
  fields: Record<string, string>
  key: string
  publicUrl: string
}

/**
 * Uploads one image.
 *
 * The browser never chooses the storage path and never holds a bucket
 * credential: it asks the API for a short-lived presigned POST tied to the
 * object it is allowed to create, and S3 enforces the type and size limits.
 */
export async function uploadImage(file: File, scope: UploadScope): Promise<string> {
  const presigned = await api.post<PresignedUpload>('/admin/uploads', {
    contentType: file.type,
    kind: scope.kind,
    id: scope.id,
  })

  const form = new FormData()
  for (const [name, value] of Object.entries(presigned.fields)) {
    form.append(name, value)
  }
  form.append('file', file)

  const response = await fetch(presigned.url, { method: 'POST', body: form })
  if (!response.ok) {
    throw new Error(`Upload failed (${response.status})`)
  }

  return presigned.publicUrl
}

export async function deleteImage(url: string): Promise<void> {
  await api.post('/admin/uploads/delete', { url })
}
