import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { batchGetTeams, organizerService, tournamentService } from '../lib/data'
import { findTournamentBySlug } from '../utils/urls'
import { allMatches, cardLabel, cardTotals, isPlayed, NO_STAT, roundLabel, scorerSide } from '../utils/matches'
import { publicTeamUrl } from '../utils/teams'
import { tableForMatch } from '../utils/standings'
import type { Tournament, Team, Match, Organizer, Player } from '../types'
import { getSeasonUrl, seasonLabel, seriesName } from '../utils/seasons'
import { formatMatchDateTime } from '../utils/datetime'
import { headerColor, inkOn, shade } from '../utils/crest'
import {
  IconBall,
  IconCard,
  IconChart,
  IconKnockout,
  IconStadium,
  IconTable,
  IconUsers,
  IconVideo,
  IconWhistle,
} from '../components/icons'
import PublicHeader from '../components/PublicHeader'
import MatchScoreboard from '../components/MatchScoreboard'
import { youtubeEmbedUrl } from '../utils/video'
import { cdnUrl } from '../utils/images'

/**
 * One fixture, as the five things a visitor comes here for.
 *
 * The page used to be a column of panels — statistics, then events, then the
 * teamsheets, then the video — so reading the last of them meant scrolling past
 * three others, and a match with everything filled in ran to several screens.
 * The panels are the same panels; they are behind tabs now, and every tab is
 * always there. A tab that appears only when its data exists teaches the
 * visitor nothing about what is missing, and moves the ones beside it as they
 * go from match to match.
 */

const TABS = [
  { key: 'events', label: 'Events', Icon: IconBall },
  { key: 'video', label: 'Video', Icon: IconVideo },
  { key: 'lineups', label: 'Line-ups', Icon: IconUsers },
  { key: 'stats', label: 'Stats', Icon: IconChart },
  { key: 'table', label: 'Table', Icon: IconTable },
] as const

type TabKey = (typeof TABS)[number]['key']

const isTabKey = (value: string | null): value is TabKey =>
  TABS.some((tab) => tab.key === value)

export default function PublicMatchPage() {
  const { tournamentId, matchId, orgSlug, tournamentSlug, seriesSlug, seasonSlug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [match, setMatch] = useState<Match | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [allOrganizers, setAllOrganizers] = useState<Organizer[]>([])

  // The tab lives in the address rather than in state alone, so a link to the
  // teamsheets opens on the teamsheets and a reload does not throw the visitor
  // back to the events. `replace`, because moving between the tabs of one match
  // is not five pages to press Back through.
  const requested = searchParams.get('tab')
  const tab: TabKey = isTabKey(requested) ? requested : 'events'
  const selectTab = (next: TabKey) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'events') params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  // Load all organizers for slug-based lookup.
  //
  // getAllPublic, not getAll: this page resolves an organiser slug from the URL
  // and has to see every organiser, including the ones the visitor has nothing
  // to do with. getAll sends a signed-in user to /admin/organizers, which
  // returns only the organiser they administer — so a signed-in club manager
  // got an empty list here and every match link answered "Tournament not found".
  useEffect(() => {
    organizerService.getAllPublic().then(setAllOrganizers)
  }, [])

  useEffect(() => {
    const loadData = async () => {
      const hasSlugRoute = Boolean(orgSlug && (tournamentSlug || (seriesSlug && seasonSlug)))
      if ((!tournamentId && !hasSlugRoute) || !matchId) {
        setError('Missing tournament or match ID')
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        let tournamentData: Tournament | null = null
        // The season routes answer with the competition's clubs already, and
        // the table below needs all of them rather than the two playing.
        let bundledTeams: Team[] | null = null

        if (tournamentId) {
          // Old route: /public/tournaments/:tournamentId/matches/:matchId — single GetItem (no scan)
          tournamentData = await tournamentService.getById(tournamentId)
        } else if (orgSlug && seriesSlug && seasonSlug) {
          // /:orgSlug/:seriesSlug/:seasonSlug/matches/:matchId — a match inside
          // a named season, which is the address every link on the season page
          // now uses. One request returns the season whole.
          const bundle = await tournamentService.getSeason(
            decodeURIComponent(orgSlug).trim(),
            decodeURIComponent(seriesSlug).trim(),
            decodeURIComponent(seasonSlug).trim(),
          )
          tournamentData = bundle?.tournament ?? null
          bundledTeams = bundle?.teams ?? null
        } else if (orgSlug && tournamentSlug) {
          // New route: /:orgSlug/:tournamentSlug/matches/:matchId
          // Resolve the id from lightweight summaries (no match data), then GetItem the one tournament.
          const [organizers, summaries] = await Promise.all([
            organizerService.getAllPublic(),
            tournamentService.getAllSummaries(),
          ])
          setAllOrganizers(organizers)
          const summary = findTournamentBySlug(
            summaries,
            decodeURIComponent(orgSlug).trim(),
            decodeURIComponent(tournamentSlug).trim(),
            organizers,
          )
          tournamentData = summary ? await tournamentService.getById(summary.id) : null
        }

        if (!tournamentData) {
          setError('Tournament not found')
          setIsLoading(false)
          return
        }

        setTournament(tournamentData)

        // Find the match — including the rounds built by hand, which live
        // inside the format rather than in `matches`.
        const matchData = allMatches(tournamentData).find((one) => one.id === matchId)
        if (!matchData) {
          setError('Match not found')
          setIsLoading(false)
          return
        }
        setMatch(matchData)

        // Every club in the competition, not only the two playing: the table
        // names all of them. One batch request either way.
        if (bundledTeams) {
          setTeams(bundledTeams)
        } else {
          const wanted = [
            ...new Set(
              [...(tournamentData.teamIds ?? []), matchData.homeTeamId, matchData.awayTeamId].filter(
                Boolean,
              ),
            ),
          ]
          setTeams(await batchGetTeams(wanted))
        }
      } catch (err) {
        console.error('Error loading match data:', err)
        setError('Failed to load match data')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [tournamentId, matchId, orgSlug, tournamentSlug, seriesSlug, seasonSlug])

  const homeTeam = teams.find((team) => team.id === match?.homeTeamId) ?? null
  const awayTeam = teams.find((team) => team.id === match?.awayTeamId) ?? null

  const table = useMemo(
    () => (tournament && match ? tableForMatch(tournament, match.homeTeamId, match.awayTeamId) : null),
    [tournament, match],
  )

  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p className="opacity-80">Loading match...</p>
        </div>
      </div>
    )
  }

  if (error || !tournament || !match || !homeTeam || !awayTeam) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Match Not Found</h1>
          <p className="opacity-80 mb-6">
            {error || "The match you're looking for doesn't exist or is not publicly visible."}
          </p>
          <Link to="/" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Go to Home
          </Link>
        </div>
      </div>
    )
  }

  const organizer = allOrganizers.find((one) => one.id === tournament.organizerId)
  const seasonHref = organizer
    ? getSeasonUrl(tournament, organizer)
    : `/public/tournaments/${tournament.id}`

  // A score counts as played only when it is a number: a cleared one is stored
  // as null, and `!== undefined` called that finished.
  const status: 'scheduled' | 'live' | 'finished' = isPlayed(match)
    ? 'finished'
    : match.dateISO && new Date(match.dateISO) <= new Date()
      ? 'live'
      : 'scheduled'

  const teamOf = (side: 'home' | 'away') => (side === 'home' ? homeTeam : awayTeam)

  return (
    <div className="grid gap-4 place-items-center">
      <div className="w-full">
        <PublicHeader back={{ to: seasonHref, label: tournament.name }} />
      </div>

      <div className="w-full max-w-5xl px-4 grid gap-4">
        {/* What competition this is, and where in it. */}
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-gray-300">
          <Link to={seasonHref} className="hover:text-white transition-colors">
            {seriesName(tournament)} {seasonLabel(tournament)}
          </Link>
          <span className="opacity-40">•</span>
          <span>{roundLabel(match)}</span>
          {match.isElimination && (
            <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide font-medium px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-400/20">
              <IconKnockout size={13} /> Elimination
            </span>
          )}
        </div>

        <MatchScoreboard
          match={match}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          status={status}
          tournamentId={tournament.id}
        />

        {/* Kick-off, ground and referee. One line under the plate rather than a
            panel of their own: three short facts do not need a heading each. */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-gray-300">
          {match.dateISO && <span>{formatMatchDateTime(match.dateISO)}</span>}
          {match.venue && (
            <span className="inline-flex items-center gap-1.5">
              <IconStadium size={14} className="opacity-70" /> {match.venue}
            </span>
          )}
          {match.referee && (
            <span className="inline-flex items-center gap-1.5">
              <IconWhistle size={14} className="opacity-70" /> {match.referee}
            </span>
          )}
        </div>

        {/* The tabs. Sticky, because the panels below them are long enough that
            the way to the next tab would otherwise be a scroll back to the top. */}
        <div
          role="tablist"
          aria-label="Match sections"
          className="sticky top-0 z-10 -mx-4 px-4 py-2 glass-header flex gap-1 overflow-x-auto"
        >
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              onClick={() => selectTab(key)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                tab === key
                  ? 'bg-white/15 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="glass rounded-2xl p-4 sm:p-6">
          {tab === 'events' && <EventsPanel match={match} teamOf={teamOf} />}
          {tab === 'video' && <VideoPanel match={match} />}
          {tab === 'lineups' && <LineupsPanel match={match} homeTeam={homeTeam} awayTeam={awayTeam} />}
          {tab === 'stats' && <StatsPanel match={match} homeTeam={homeTeam} awayTeam={awayTeam} />}
          {tab === 'table' && (
            <TablePanel
              table={table}
              teams={teams}
              highlight={[match.homeTeamId, match.awayTeamId]}
              seasonHref={seasonHref}
              tournamentId={tournament.id}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** What a tab says when there is nothing in it yet. */
function Nothing({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-gray-400">{children}</p>
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">{children}</h2>
}

const playerName = (team: Team | null, playerId: string, fallback?: Team | null): string => {
  const find = (squad: Team | null | undefined) => squad?.players?.find((one) => one?.id === playerId)
  // The fallback is for own goals recorded before the form offered the other
  // squad: the scorer stored on them plays for the side the goal counted for,
  // and looking only where the rule now says would print "Unknown player" over
  // a name that is right there in the match.
  const player = find(team) ?? find(fallback)
  return player ? `${player.firstName} ${player.lastName}` : 'Unknown player'
}

/* ---------- Events ---------- */

/**
 * What happened, in the order it happened, with each side on its own bank.
 *
 * Goals and bookings are one story, filled in by the same person at the same
 * time; as two lists side by side, working out which came first was left to the
 * reader. The written preview and report sit above it, because they are the
 * same story told long-hand and had a panel of their own that nobody scrolled
 * to.
 */
function EventsPanel({
  match,
  teamOf,
}: {
  match: Match
  teamOf: (side: 'home' | 'away') => Team | null
}) {
  // Copied before sorting: the arrays belong to the match record this page is
  // holding.
  const events = [
    ...(match.goals ?? [])
      // A goal with nobody named is a half-filled row the organiser is still
      // working on — except an own goal, which changed the score and belongs in
      // the story whether or not anyone was named for it.
      .filter((goal) => Boolean(goal?.playerId) || goal?.type === 'own_goal')
      .map((goal) => ({ kind: 'goal' as const, id: goal.id, minute: goal.minute ?? 0, goal })),
    ...(match.cards ?? [])
      .filter((card) => Boolean(card?.playerId))
      .map((card) => ({ kind: 'card' as const, id: card.id, minute: card.minute ?? 0, card })),
  ].sort((a, b) => a.minute - b.minute)

  if (events.length === 0 && !match.preview && !match.report) {
    return <Nothing>No goals or bookings have been recorded for this match.</Nothing>
  }

  return (
    <div className="grid gap-6">
      {match.preview && (
        <div>
          <SectionTitle>Preview</SectionTitle>
          <p className="whitespace-pre-wrap text-sm text-gray-200 leading-relaxed">{match.preview}</p>
        </div>
      )}

      {match.report && (
        <div>
          <SectionTitle>Report</SectionTitle>
          <p className="whitespace-pre-wrap text-sm text-gray-200 leading-relaxed">{match.report}</p>
        </div>
      )}

      {events.length === 0 ? (
        <Nothing>No goals or bookings have been recorded for this match.</Nothing>
      ) : (
        <div className="relative">
          <div aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
          <ul className="relative grid gap-2">
            {events.map((event) => {
              // Which bank the event sits on is the side it counted for, so an
              // own goal appears beside the team it gave the goal to. Who put
              // it in is a player of the other side, which is the squad the
              // name is resolved against.
              const side = event.kind === 'goal' ? event.goal.team : event.card.team
              const team = teamOf(side === 'away' ? 'away' : 'home')
              const other = teamOf(side === 'away' ? 'home' : 'away')
              const namedBy =
                event.kind === 'goal' && scorerSide(event.goal) !== side ? other : team

              return (
                <li
                  key={event.id}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4"
                >
                  <div className={side === 'home' ? 'text-right' : ''}>
                    {side === 'home' && (
                      <EventLine event={event} team={namedBy} other={team} align="end" />
                    )}
                  </div>
                  <span className="shrink-0 text-xs font-mono tabular-nums px-2 py-1 rounded-full bg-white/10 text-gray-200">
                    {event.minute}'
                  </span>
                  <div>
                    {side !== 'home' && (
                      <EventLine event={event} team={namedBy} other={team} align="start" />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

type TimelineEvent =
  | { kind: 'goal'; id: string; minute: number; goal: NonNullable<Match['goals']>[number] }
  | { kind: 'card'; id: string; minute: number; card: NonNullable<Match['cards']>[number] }

function EventLine({
  event,
  team,
  other,
  align,
}: {
  event: TimelineEvent
  /** The squad the player named in this event turns out for. */
  team: Team | null
  /** The other squad in the match, searched when the stored side is the old one. */
  other?: Team | null
  align: 'start' | 'end'
}) {
  const rowClass = `flex items-center gap-2 flex-wrap ${align === 'end' ? 'justify-end' : ''}`

  if (event.kind === 'card') {
    return (
      <div className={rowClass}>
        {align === 'end' && <span className="text-xs text-gray-400">{cardLabel(event.card.type)}</span>}
        <IconCard size={14} variant={event.card.type} />
        <Link
          to={`/public/players/${event.card.playerId}`}
          className="text-sm font-medium hover:opacity-80 transition-opacity"
        >
          {playerName(team, event.card.playerId)}
        </Link>
        {align === 'start' && (
          <span className="text-xs text-gray-400">{cardLabel(event.card.type)}</span>
        )}
      </div>
    )
  }

  const { goal } = event
  const note =
    goal.type === 'penalty' ? 'penalty' : goal.type === 'own_goal' ? 'own goal' : undefined

  // An own goal nobody was named for still reads as one: the label carries the
  // whole event, and there is no player page to link to.
  const scorer = goal.playerId ? (
    <Link
      to={`/public/players/${goal.playerId}`}
      className="text-sm font-semibold hover:opacity-80 transition-opacity"
    >
      {playerName(team, goal.playerId, other)}
    </Link>
  ) : (
    <span className="text-sm font-semibold">Own goal</span>
  )
  const detail = goal.playerId ? (
    <GoalDetail goal={goal} team={team} other={other} note={note} />
  ) : null

  return (
    <div className={rowClass}>
      {align === 'end' && detail}
      <IconBall size={14} className="opacity-70" />
      {scorer}
      {align === 'start' && detail}
    </div>
  )
}

function GoalDetail({
  goal,
  team,
  other,
  note,
}: {
  goal: NonNullable<Match['goals']>[number]
  team: Team | null
  other?: Team | null
  note?: string
}) {
  // An own goal has no assist; anything stored in that field on one is left
  // over from before the form stopped offering it.
  const assistPlayerId = goal.type === 'own_goal' ? undefined : goal.assistPlayerId
  if (!note && !assistPlayerId) return null
  return (
    <span className="text-xs text-gray-400">
      {note}
      {note && assistPlayerId ? ', ' : ''}
      {assistPlayerId ? `assist ${playerName(team, assistPlayerId, other)}` : ''}
    </span>
  )
}

/* ---------- Video ---------- */

function VideoPanel({ match }: { match: Match }) {
  if (!match.videoUrl) return <Nothing>No video has been added for this match yet.</Nothing>

  const embedUrl = youtubeEmbedUrl(match.videoUrl)

  // Played here when the link is one this page can frame, and offered as a link
  // when it is not: an iframe pointed at a site that refuses framing is a blank
  // box with nothing to click.
  if (!embedUrl) {
    return (
      <div className="py-10 text-center">
        <a
          href={match.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg glass hover:bg-white/10 transition-all"
        >
          <IconVideo size={15} /> Watch match video
        </a>
      </div>
    )
  }

  return (
    <div className="relative w-full aspect-video">
      <iframe
        src={embedUrl}
        title="Match video"
        className="absolute inset-0 w-full h-full rounded-lg"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  )
}

/* ---------- Line-ups ---------- */

function LineupsPanel({
  match,
  homeTeam,
  awayTeam,
}: {
  match: Match
  homeTeam: Team
  awayTeam: Team
}) {
  // Named rather than merely present: a teamsheet cleared back to nobody leaves
  // the record in place, and an empty column says less than none.
  const anyoneNamed = (['home', 'away'] as const).some(
    (side) =>
      (match.lineups?.[side]?.starting?.length ?? 0) > 0 ||
      (match.lineups?.[side]?.substitutes?.length ?? 0) > 0,
  )

  if (!anyoneNamed) {
    return <Nothing>Neither club has named a team for this match yet.</Nothing>
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <SideSheet team={homeTeam} lineup={match.lineups?.home} />
      <SideSheet team={awayTeam} lineup={match.lineups?.away} />
    </div>
  )
}

function SideSheet({
  team,
  lineup,
}: {
  team: Team
  lineup?: { starting?: string[]; substitutes?: string[] }
}) {
  const base = headerColor(team)
  const starting = lineup?.starting ?? []
  const substitutes = lineup?.substitutes ?? []

  return (
    <div className="rounded-xl overflow-hidden border border-white/10">
      <div
        className="px-4 py-2.5 font-semibold text-sm"
        style={{ backgroundColor: shade(base, -0.1), color: inkOn(shade(base, -0.1)) }}
      >
        {team.name}
      </div>

      <div className="p-3 grid gap-4">
        {starting.length > 0 ? (
          <div>
            <SectionTitle>Starting</SectionTitle>
            <ul className="grid gap-1">
              {starting.map((playerId) => (
                <PlayerRow key={playerId} team={team} playerId={playerId} />
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No starting line-up named.</p>
        )}

        {substitutes.length > 0 && (
          <div>
            <SectionTitle>Substitutes</SectionTitle>
            <ul className="grid gap-1">
              {substitutes.map((playerId) => (
                <PlayerRow key={playerId} team={team} playerId={playerId} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function PlayerRow({ team, playerId }: { team: Team; playerId: string }) {
  // A squad list can contain a hole: `null` sits in `players` in records from
  // the browser-side era, and one dereferenced without a guard took the whole
  // page down.
  const player: Player | undefined = team.players?.find((one) => one?.id === playerId)

  return (
    <li className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
      <span className="w-6 shrink-0 text-xs tabular-nums text-gray-400 text-right">
        {typeof player?.number === 'number' ? player.number : ''}
      </span>
      {player ? (
        <Link
          to={`/public/players/${player.id}`}
          className="text-sm hover:opacity-80 transition-opacity truncate"
        >
          {player.firstName} {player.lastName}
        </Link>
      ) : (
        <span className="text-sm text-gray-400">Unknown player</span>
      )}
    </li>
  )
}

/* ---------- Stats ---------- */

/**
 * The team totals, as bars rather than a three-column table.
 *
 * A table made the reader compare two numbers on opposite sides of a row; the
 * bar says which side had more of it before the numbers are read at all. Each
 * side is drawn in its own club's colour, the same colour its half of the plate
 * above is painted in.
 */
function StatsPanel({
  match,
  homeTeam,
  awayTeam,
}: {
  match: Match
  homeTeam: Team
  awayTeam: Team
}) {
  const cards = cardTotals(match)
  const typed = match.statistics
  const anyTyped = (['home', 'away'] as const).some((side) =>
    Object.values(typed?.[side] ?? {}).some((value) => typeof value === 'number'),
  )
  const anyCards = (match.cards ?? []).length > 0

  if (!anyTyped && !anyCards) {
    return <Nothing>No statistics have been recorded for this match.</Nothing>
  }

  const rows: Array<{ label: string; home?: number; away?: number; suffix?: string }> = []

  if (anyTyped) {
    rows.push(
      { label: 'Possession', home: typed?.home?.possession, away: typed?.away?.possession, suffix: '%' },
      { label: 'Shots', home: typed?.home?.shots, away: typed?.away?.shots },
      { label: 'Shots on target', home: typed?.home?.shotsOnTarget, away: typed?.away?.shotsOnTarget },
      { label: 'Corners', home: typed?.home?.corners, away: typed?.away?.corners },
      { label: 'Fouls', home: typed?.home?.fouls, away: typed?.away?.fouls },
    )
  }

  // Counted from the bookings, never stored beside them. Shown only where there
  // is a booking to count: nought each is a claim, and a competition whose
  // organiser does not record cards has not made it.
  if (anyCards) {
    rows.push(
      { label: 'Yellow cards', home: cards.home.yellow, away: cards.away.yellow },
      { label: 'Red cards', home: cards.home.red, away: cards.away.red },
    )
  }

  return (
    <div className="grid gap-4">
      {rows.map((row) => (
        <StatBar
          key={row.label}
          label={row.label}
          home={row.home}
          away={row.away}
          suffix={row.suffix}
          homeColor={headerColor(homeTeam)}
          awayColor={headerColor(awayTeam)}
        />
      ))}
    </div>
  )
}

function StatBar({
  label,
  home,
  away,
  suffix,
  homeColor,
  awayColor,
}: {
  label: string
  home?: number
  away?: number
  suffix?: string
  homeColor: string
  awayColor: string
}) {
  const total = (home ?? 0) + (away ?? 0)
  // Nothing to divide: two empty bars rather than two half-full ones, which
  // would say the two sides were level at something neither did.
  const homeShare = total > 0 ? ((home ?? 0) / total) * 100 : 0
  const awayShare = total > 0 ? ((away ?? 0) / total) * 100 : 0

  const show = (value?: number) =>
    typeof value === 'number' ? `${value}${suffix ?? ''}` : NO_STAT

  return (
    <div>
      <div className="grid grid-cols-[3rem_1fr_3rem] items-baseline gap-3 mb-1.5">
        <span className="text-sm font-semibold tabular-nums">{show(home)}</span>
        <span className="text-center text-xs uppercase tracking-wide text-gray-400">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-right">{show(away)}</span>
      </div>
      <div className="grid grid-cols-2 gap-1 h-1.5">
        <div className="flex justify-end rounded-l-full bg-white/5 overflow-hidden">
          <div style={{ width: `${homeShare}%`, backgroundColor: homeColor }} className="h-full" />
        </div>
        <div className="rounded-r-full bg-white/5 overflow-hidden">
          <div style={{ width: `${awayShare}%`, backgroundColor: awayColor }} className="h-full" />
        </div>
      </div>
    </div>
  )
}

/* ---------- Table ---------- */

function TablePanel({
  table,
  teams,
  highlight,
  seasonHref,
  tournamentId,
}: {
  table: ReturnType<typeof tableForMatch>
  teams: Team[]
  highlight: string[]
  seasonHref: string
  /** Carried into the club links so the club page opens this competition's squad. */
  tournamentId: string
}) {
  if (!table || table.rows.length === 0) {
    return <Nothing>This competition has no league table.</Nothing>
  }

  return (
    <div className="grid gap-3">
      {table.label && <SectionTitle>{table.label}</SectionTitle>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-400 border-b border-white/10">
              <th className="text-left font-medium py-2 pr-2 w-8">#</th>
              <th className="text-left font-medium py-2">Team</th>
              <th className="text-center font-medium py-2 px-1.5">P</th>
              <th className="text-center font-medium py-2 px-1.5 hidden sm:table-cell">W</th>
              <th className="text-center font-medium py-2 px-1.5 hidden sm:table-cell">D</th>
              <th className="text-center font-medium py-2 px-1.5 hidden sm:table-cell">L</th>
              <th className="text-center font-medium py-2 px-1.5 hidden md:table-cell">GF</th>
              <th className="text-center font-medium py-2 px-1.5 hidden md:table-cell">GA</th>
              <th className="text-center font-medium py-2 px-1.5">GD</th>
              <th className="text-center font-medium py-2 pl-1.5">Pts</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => {
              const team = teams.find((one) => one.id === row.id)
              const isPlaying = highlight.includes(row.id)

              return (
                <tr
                  key={row.id}
                  className={`border-b border-white/5 ${isPlaying ? 'bg-white/10' : ''}`}
                >
                  <td className="py-2 pr-2 text-gray-400 tabular-nums">{index + 1}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {team?.logo && (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={cdnUrl(team.logo)}
                          alt=""
                          className="w-5 h-5 object-contain shrink-0"
                        />
                      )}
                      {team ? (
                        <Link
                          to={publicTeamUrl(team.id, tournamentId)}
                          className={`truncate hover:opacity-80 transition-opacity ${isPlaying ? 'font-semibold' : ''}`}
                        >
                          {team.name}
                        </Link>
                      ) : (
                        <span className="truncate text-gray-400">Unknown team</span>
                      )}
                    </div>
                  </td>
                  <td className="text-center px-1.5 tabular-nums">{row.p}</td>
                  <td className="text-center px-1.5 tabular-nums hidden sm:table-cell">{row.w}</td>
                  <td className="text-center px-1.5 tabular-nums hidden sm:table-cell">{row.d}</td>
                  <td className="text-center px-1.5 tabular-nums hidden sm:table-cell">{row.l}</td>
                  <td className="text-center px-1.5 tabular-nums hidden md:table-cell">{row.gf}</td>
                  <td className="text-center px-1.5 tabular-nums hidden md:table-cell">{row.ga}</td>
                  <td className="text-center px-1.5 tabular-nums">{row.gf - row.ga}</td>
                  <td className="text-center pl-1.5 font-semibold tabular-nums">{row.pts}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Link to={seasonHref} className="text-xs text-gray-400 hover:text-white transition-colors">
        Full competition
      </Link>
    </div>
  )
}
