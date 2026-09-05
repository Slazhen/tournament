import { api, isSignedIn } from './api'
import type { Team, Tournament, Organizer, Match, Player, PlayerUpdate, CustomPlayoffRoundConfig } from '../types'

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

/** Which hand-built playoff round the screen believed it was editing. */
export type RoundExpectation = { roundNumber?: number; name?: string }

export const organizerService = {
  /**
   * The organisers the signed-in user administers — everything for a super
   * admin, their own one for an organiser, nothing at all for a club manager.
   *
   * This belongs to the admin screens and to nothing else. A page that shows
   * organisers to whoever is looking wants `getAllPublic`: this one silently
   * shrinks as the viewer's role narrows, and on the landing page that read as
   * "five public tournaments from zero organisers" with an empty directory
   * underneath.
   */
  async getAll(): Promise<Organizer[]> {
    return isSignedIn()
      ? api.get<Organizer[]>('/admin/organizers')
      : api.get<Organizer[]>('/public/organizers')
  },

  /**
   * The public directory: names and crests, no contact details, the same list
   * for everybody. Every page a visitor can reach — the landing page, a public
   * match page resolving an organiser slug — reads this one.
   */
  async getAllPublic(): Promise<Organizer[]> {
    return api.get<Organizer[]>('/public/organizers')
  },

  /**
   * One organiser's public page, by the slug in the address bar.
   *
   * Null rather than a throw: the same URL shape is anything with one segment,
   * so a mistyped address arrives here and the page shows "not found" instead
   * of an error screen.
   */
  async getPublicPage(organizerSlug: string): Promise<OrganizerPage | null> {
    try {
      return await api.get<OrganizerPage>(
        `/public/by-slug/${encodeURIComponent(organizerSlug)}`,
      )
    } catch {
      return null
    }
  },

  async create(name: string, email: string): Promise<Organizer | null> {
    return api.post<Organizer>('/admin/organizers', { name, email })
  },

  async update(id: string, updates: Partial<Organizer>): Promise<boolean> {
    await api.patch(`/admin/organizers/${encodeURIComponent(id)}`, updates)
    return true
  },

  /** What deleting this organizer would take with it, counted by the server. */
  async impact(id: string): Promise<OrganizerImpact> {
    return api.get<OrganizerImpact>(`/admin/organizers/${encodeURIComponent(id)}/impact`)
  },

  /**
   * Deletes the organizer, its competitions and its logins in one request.
   *
   * `teamsTo` is the organizer its clubs move to, and the server insists on one
   * whenever there are any: a club has its own managers and squad and outlives
   * the league it was created in, so it is never deleted along with its
   * organizer.
   */
  async delete(id: string, teamsTo?: string): Promise<OrganizerDeleted> {
    const query = teamsTo ? `?teamsTo=${encodeURIComponent(teamsTo)}` : ''
    return api.delete<OrganizerDeleted>(`/admin/organizers/${encodeURIComponent(id)}${query}`)
  },
}

export type OrganizerImpact = {
  tournaments: { id: string; name: string }[]
  teams: { id: string; name: string }[]
  accounts: string[]
}

export type OrganizerDeleted = {
  ok: true
  tournamentsDeleted: number
  teamsMoved: number
  accountsDeleted: number
  invitesDeleted: number
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

/** An organiser as a visitor sees them: no email, no contact details. */
export type PublicOrganizer = Pick<Organizer, 'id' | 'name'> & {
  logo?: string
  description?: string
}

/** A club on a listing: enough to draw the badge and name it, and no squad. */
export type ClubCard = {
  id: string
  name: string
  logo?: string
  colors: string[]
  crestColor?: string | null
  crestOpaqueBackground?: boolean | null
}

/** An organiser's own page: /homebush_futsal. */
export type OrganizerPage = {
  organizer: PublicOrganizer
  /** Every public season they run, for the page to group into competitions. */
  tournaments: TournamentSummary[]
  clubs: ClubCard[]
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

  /**
   * The organiser entering one club, for the clubs with no manager to do it —
   * which, in a new competition, is most of them.
   */
  async saveSquad(
    tournamentId: string,
    teamId: string,
    playerIds: string[],
  ): Promise<{ playerIds: string[]; all: boolean }> {
    return api.put(
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/squads/${encodeURIComponent(teamId)}`,
      { playerIds },
    )
  },

  /**
   * The rounds an organiser builds by hand, written one at a time.
   *
   * Not through `update`, which replaces the whole `format`: these rounds hold
   * the fixtures, and the fixtures hold goals, cards and teamsheets that other
   * people write. Each of these answers with the round as it was stored, and
   * the round number and the fixture ids come back assigned by the server.
   */
  async addPlayoffRound(
    tournamentId: string,
    round: Partial<CustomPlayoffRoundConfig>,
  ): Promise<CustomPlayoffRoundConfig> {
    return api.post<CustomPlayoffRoundConfig>(
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/playoff-rounds`,
      round,
    )
  },

  /**
   * An index is not an identity: a round deleted in another tab shifts every
   * round after it up by one. So both of these say which round was on screen,
   * and the server refuses when the round in that place is a different one.
   */
  async updatePlayoffRound(
    tournamentId: string,
    index: number,
    updates: { name?: string; description?: string; quantityOfGames?: number; hidden?: boolean },
    expected: RoundExpectation,
  ): Promise<CustomPlayoffRoundConfig> {
    return api.patch<CustomPlayoffRoundConfig>(
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/playoff-rounds/${index}`,
      { ...updates, expectedRoundNumber: expected.roundNumber, expectedName: expected.name },
    )
  },

  async removePlayoffRound(
    tournamentId: string,
    index: number,
    expected: RoundExpectation,
  ): Promise<void> {
    // A DELETE carries no body, so the expectation travels in the query.
    const query = new URLSearchParams()
    if (typeof expected.roundNumber === 'number') {
      query.set('expectedRoundNumber', String(expected.roundNumber))
    }
    if (expected.name !== undefined) query.set('expectedName', expected.name)
    await api.delete(
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/playoff-rounds/${index}?${query}`,
    )
  },

  /**
   * Whether one league round's fixtures are published yet.
   *
   * Not part of `update`: that PATCH writes the whole attribute from this
   * page's copy, and `hiddenRounds` is a list. The API appends and removes one
   * round under a condition, and refuses the field on the tournament PATCH.
   */
  async setRoundHidden(
    tournamentId: string,
    round: number,
    hidden: boolean,
  ): Promise<{ round: number; hidden: boolean; changed: boolean }> {
    return api.put(
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/rounds/${round}/visibility`,
      { hidden },
    )
  },

  /**
   * Strict entry on or off. Not part of `update`, because turning it on also
   * enters every club that has not been entered, and the reply says how many.
   */
  async setSquadMode(
    tournamentId: string,
    strict: boolean,
  ): Promise<{ strict: boolean; entered: number }> {
    return api.put(`/admin/tournaments/${encodeURIComponent(tournamentId)}/squad-mode`, { strict })
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

  async update(teamId: string, playerId: string, updates: PlayerUpdate): Promise<Player> {
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

  /**
   * The organiser's teamsheet for one club in one match.
   *
   * Deliberately not part of `updateMatchInTournament`: that sends both halves
   * of the fixture from the copy this browser is holding, and the other half
   * now has an author of its own — the club's manager. Naming the club sends
   * one side, and the two stop overwriting each other.
   */
  async saveLineup(
    tournamentId: string,
    matchId: string,
    teamId: string,
    playerIds: string[],
  ): Promise<{ playerIds: string[] }> {
    return api.put(
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/lineup`,
      { teamId, playerIds },
    )
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

/* ------------------------------------------------------------------ *
 * Clubs run by their own managers
 * ------------------------------------------------------------------ */

export type TeamInvitePreview = {
  teamName: string
  organizerName: string
  /** The competition the club joins on taking the invitation up, if any. */
  tournamentName: string
  expiresAt: string
}

/** Somebody who runs a club, as the organizer who owns it may see them. */
export type ClubManager = {
  id: string
  email: string
  displayName?: string
  isActive: boolean
  /** Absent for clubs claimed before the date was recorded. */
  linkedAt?: string
}

/**
 * `pending` and `invited` are the same row asked from opposite ends: the club
 * applied and the organiser has not answered, or the organiser invited and the
 * club has not. Only the club can turn `invited` into `accepted`.
 *
 * The three noes are three facts. `declined`: the organiser turned an
 * application down, and may change their mind. `refused`: the club turned an
 * invitation down, and the organiser may not overrule it — asking again means
 * inviting again. `withdrawn`: the organiser took back an invitation the club
 * had not answered.
 */
export type EntryStatus =
  | 'pending'
  | 'invited'
  | 'accepted'
  | 'declined'
  | 'refused'
  | 'withdrawn'

export type Entry = {
  tournamentId: string
  teamId: string
  organizerId: string
  status: EntryStatus
  requestedBy: string
  createdAt: string
  decidedAt?: string
  note?: string
  /** The decision this application replaced, when a club asked again. */
  previousNote?: string
  previousDecidedAt?: string
  /** Copied onto an invitation, for a competition the club cannot otherwise read. */
  tournamentName?: string
  /**
   * The club's name, added by the organiser's own listing of these rows.
   *
   * A club applying from another organiser's league is in none of the lists the
   * settings screen holds, so without this the row asking the organiser to
   * decide said "A club".
   */
  teamName?: string
}

/**
 * A club that has said other organisers may find it.
 *
 * Not a `Team`: what comes back is a whitelist — a crest, a name, the size of
 * the squad and who to ask — because the club belongs to somebody else and the
 * records are schemaless.
 */
export type DirectoryClub = {
  id: string
  name: string
  logo?: string
  colors: string[]
  crestColor?: string | null
  crestOpaqueBackground?: boolean | null
  squadSize: number
  /** The manager who runs it, or the league that listed it. Absent for neither. */
  ownerName?: string
  ownerKind: 'manager' | 'organizer'
}

export const clubService = {
  /**
   * Creates the one-time link that hands a club to whoever opens it.
   *
   * Naming a competition also enters the club in it the moment the link is
   * taken up: an organizer inviting a coach from inside a competition has
   * already decided the club is playing, and making the new manager apply back
   * to them would be asking a question that has been answered.
   */
  async invite(
    teamId: string,
    email?: string,
    tournamentId?: string,
  ): Promise<{ link: string; expiresAt: string; emailed: boolean; tournamentName?: string }> {
    return api.post(`/admin/teams/${encodeURIComponent(teamId)}/invites`, { email, tournamentId })
  },

  /** Who runs one club. The organizer who owns it only. */
  async managers(teamId: string): Promise<ClubManager[]> {
    return api.get(`/admin/teams/${encodeURIComponent(teamId)}/managers`)
  },

  /**
   * Taking one's own club under management, for the organizer who owns it.
   *
   * The alternative was inviting yourself: a one-time link, opened in the same
   * browser, to grant a permission the organizer already had.
   */
  async manageSelf(teamId: string): Promise<void> {
    await api.post(`/admin/teams/${encodeURIComponent(teamId)}/managers/me`, {})
  },

  /** Takes somebody off a club. The organizer who owns it only. */
  async removeManager(teamId: string, userId: string): Promise<void> {
    await api.delete(
      `/admin/teams/${encodeURIComponent(teamId)}/managers/${encodeURIComponent(userId)}`,
    )
  },

  /** Who runs each club in one competition, by club id. */
  async managersForTournament(tournamentId: string): Promise<Record<string, ClubManager[]>> {
    return api.get(`/admin/tournaments/${encodeURIComponent(tournamentId)}/managers`)
  },

  /** What an invitation is for, before anyone signs up for it. */
  async previewInvite(token: string): Promise<TeamInvitePreview | null> {
    try {
      return await api.get(`/public/invites/${encodeURIComponent(token)}`)
    } catch {
      return null
    }
  },

  /** Everything a manager's own page needs, in one request. */
  async overview(): Promise<{
    teams: Team[]
    tournaments: Tournament[]
    entries: Entry[]
    /** Every club these competitions contain, by id — for naming opponents. */
    teamNames: Record<string, string>
  }> {
    return api.get('/manager/overview')
  },

  async apply(teamId: string, tournamentId: string): Promise<Entry> {
    return api.post('/manager/entries', { teamId, tournamentId })
  },

  /**
   * The club's answer to an invitation.
   *
   * Only the club may accept one — the organiser who issued it cannot, which is
   * the whole point of asking — so this is the manager's route and not a second
   * way into the organiser's.
   */
  async answerInvitation(
    tournamentId: string,
    teamId: string,
    status: 'accepted' | 'declined',
  ): Promise<void> {
    await api.patch(`/manager/tournaments/${encodeURIComponent(tournamentId)}/entry`, {
      teamId,
      status,
    })
  },

  /**
   * Which of a club's players are entered in one competition.
   *
   * Sending every player is the same as sending none: the server stores that as
   * "no selection", so a player signed later is entered automatically rather
   * than being silently left out of a list nobody remembers editing.
   */
  async saveSquad(
    tournamentId: string,
    teamId: string,
    playerIds: string[],
  ): Promise<{ playerIds: string[]; all: boolean }> {
    return api.put(`/manager/tournaments/${encodeURIComponent(tournamentId)}/squad`, {
      teamId,
      playerIds,
    })
  },

  /**
   * Who is playing for this club in one match.
   *
   * The club is named rather than the side: the server works out which half of
   * the fixture that is, so a manager can only ever write their own.
   */
  async saveLineup(
    tournamentId: string,
    matchId: string,
    teamId: string,
    playerIds: string[],
  ): Promise<{ playerIds: string[] }> {
    return api.put(
      `/manager/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/lineup`,
      { teamId, playerIds },
    )
  },

  async entriesFor(tournamentId: string): Promise<Entry[]> {
    return api.get(`/admin/tournaments/${encodeURIComponent(tournamentId)}/entries`)
  },

  /** The pool: every club with a manager that has not hidden itself, the caller's own left out. */
  async directory(): Promise<DirectoryClub[]> {
    return api.get('/admin/clubs/directory')
  },

  /**
   * Puts a club from the pool on this organiser's own list.
   *
   * It does not enter the club in anything and asks it nothing — the club
   * appears in the organiser's list of clubs, and a place in a competition is
   * still an invitation the club answers.
   */
  async addToPool(teamId: string): Promise<{ teamId: string; added: boolean }> {
    return api.post('/admin/clubs/shortlist', { teamId })
  },

  /** Takes one back off the list. */
  async removeFromPool(teamId: string): Promise<void> {
    await api.delete(`/admin/clubs/shortlist/${encodeURIComponent(teamId)}`)
  },

  /** Offers a club a place. It is not in the competition until the club says yes. */
  async inviteToTournament(tournamentId: string, teamId: string): Promise<Entry> {
    return api.post(`/admin/tournaments/${encodeURIComponent(tournamentId)}/invitations`, {
      teamId,
    })
  },

  async decide(
    tournamentId: string,
    teamId: string,
    status: 'accepted' | 'declined',
    note?: string,
  ): Promise<void> {
    await api.patch(
      `/admin/tournaments/${encodeURIComponent(tournamentId)}/entries/${encodeURIComponent(teamId)}`,
      { status, note },
    )
  },
}
