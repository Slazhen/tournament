import { useParams, Link, useNavigate } from 'react-router-dom'
import { useEffect, useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { tournamentService, batchGetTeams } from '../lib/data'
import type { TournamentSummary } from '../lib/data'
import Trophy from '../components/Trophy'
import { championOf, seasonLabel, seriesName } from '../utils/seasons'
import { slugify } from '../utils/urls'
import FacebookIcon from '../components/FacebookIcon'
import InstagramIcon from '../components/InstagramIcon'
import LocationIcon from '../components/LocationIcon'
import { teamsNotPlaying, survivorsByPlayoffRound } from '../utils/progressive'
import { allMatches, playerRecords } from '../utils/matches'
import {
  IconTrophy,
} from '../components/icons'
import PublicHeader from '../components/PublicHeader'

const isUrl = (value?: string) => Boolean(value && /^https?:\/\//i.test(value.trim()))

/**
 * What to show for the venue.
 *
 * The name field is free text and organisers paste map links straight into it,
 * so the header used to read the raw https://maps.app.goo.gl/... link as text.
 * A pasted link becomes the destination of the line, never its text.
 */
function describeVenue(location?: { name?: string; link?: string }) {
  if (!location) return null

  const name = location.name?.trim()
  const link = location.link?.trim()
  const href = link || (isUrl(name) ? name : undefined)
  const label = name && !isUrl(name) ? name : href ? 'View on map' : undefined

  if (!label) return null
  return { label, href }
}

type MatchStatus = 'finished' | 'in_progress' | 'upcoming'

/** One definition of "has this been played", shared by every part of the page. */
function matchStatus(match: any): MatchStatus {
  const home = typeof match?.homeGoals === 'number'
  const away = typeof match?.awayGoals === 'number'
  if (home && away) return 'finished'
  return home || away ? 'in_progress' : 'upcoming'
}

/** NaN when a fixture has no date yet, which sorts to the end rather than to 1970. */
const matchTime = (match: any): number =>
  match?.dateISO ? new Date(match.dateISO).getTime() : Number.NaN

const byKickoffAscending = (a: any, b: any) => {
  const left = matchTime(a)
  const right = matchTime(b)
  if (Number.isNaN(left) && Number.isNaN(right)) return (a.round ?? 0) - (b.round ?? 0)
  if (Number.isNaN(left)) return 1
  if (Number.isNaN(right)) return -1
  return left - right
}

const shortDate = (match: any) =>
  match?.dateISO
    ? new Date(match.dateISO).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : ''

/**
 * When a match kicks off.
 *
 * Playoff rounds built by hand store the day in `dateISO` (at midnight) and the
 * kick-off in a separate `time` field, so reading the clock off the timestamp
 * showed every final at 00:00 — or, in the bracket below, showed nothing at all.
 */
function kickOff(match: any): { day: string; time: string } | null {
  if (!match?.dateISO) return match?.time ? { day: '', time: match.time } : null
  const date = new Date(match.dateISO)
  const day = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const time =
    match.time ||
    date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return { day, time }
}

export default function PublicTournamentPage() {
  const { id, tournamentId, orgSlug, tournamentSlug, seriesSlug, seasonSlug } = useParams()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(true)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [playerStatsFilter, setPlayerStatsFilter] = useState<'all' | 'scorers' | 'assists'>('scorers')
  // The single full tournament being viewed (loaded via GetItem, not a full-table scan)
  const [tournament, setTournament] = useState<any>(null)
  // Only the teams this tournament references, fetched by key (BatchGetItem).
  const [teams, setTeams] = useState<any[]>([])
  // Every public season of the same competition, for the switcher.
  const [seasons, setSeasons] = useState<TournamentSummary[]>([])
  const [organizerSlug, setOrganizerSlug] = useState<string>('')

  // Handle both old and new URL structures
  const actualTournamentId = useMemo(() => {
    if (tournamentId || id) {
      return tournamentId || id
    }
    return null
  }, [tournamentId, id])

  // Load only what this page needs. A slug route is one request that returns the
  // tournament, its teams and the organizer together; the older id route still
  // fetches the tournament by key and then its teams.
  useEffect(() => {
    let cancelled = false
    // Reset view state when the route changes so we don't flash the previous tournament.
    setIsLoading(true)
    setDataLoaded(false)
    setTournament(null)
    setTeams([])
    setSeasons([])

    const loadData = async () => {
      try {
        // /:orgSlug/:seriesSlug/:seasonSlug — a named season of a competition.
        if (orgSlug && seriesSlug && seasonSlug) {
          const bundle = await tournamentService.getSeason(
            decodeURIComponent(orgSlug).trim(),
            decodeURIComponent(seriesSlug).trim(),
            decodeURIComponent(seasonSlug).trim(),
          )
          if (!cancelled) {
            setTournament(bundle?.tournament ?? null)
            setTeams(bundle?.teams ?? [])
            setSeasons(bundle?.seasons ?? [])
            setOrganizerSlug(decodeURIComponent(orgSlug).trim())
          }
          return
        }

        // /:orgSlug/:slug — either a tournament's old address or a competition.
        // Both keep working; the page then moves to the season's own address so
        // there is one canonical URL and links shared years ago still land.
        if (!actualTournamentId && orgSlug && tournamentSlug) {
          const org = decodeURIComponent(orgSlug).trim()
          const bundle = await tournamentService.getBySlug(
            org,
            decodeURIComponent(tournamentSlug).trim(),
          )
          if (!cancelled) {
            setTournament(bundle?.tournament ?? null)
            setTeams(bundle?.teams ?? [])
            setSeasons(bundle?.seasons ?? [])
            setOrganizerSlug(org)

            if (bundle?.tournament) {
              const target = `/${org}/${slugify(seriesName(bundle.tournament))}/${slugify(
                seasonLabel(bundle.tournament),
              )}`
              navigate(target, { replace: true })
            }
          }
          return
        }

        // Old route: /public/tournaments/:id — fetch by key, then its teams.
        const full = actualTournamentId
          ? await tournamentService.getById(actualTournamentId)
          : null
        if (!cancelled) setTournament(full)

        // Fetch only the teams this tournament references, by key. Scanning the whole
        // teams table here read every team of every organizer to render one page.
        if (full) {
          const referenced = new Set<string>(full.teamIds || [])
          for (const match of full.matches || []) {
            if (match?.homeTeamId) referenced.add(match.homeTeamId)
            if (match?.awayTeamId) referenced.add(match.awayTeamId)
          }
          const loadedTeams = await batchGetTeams([...referenced])
          if (!cancelled) setTeams(loadedTeams)
        }
      } catch (error) {
        console.error('Error loading data for public tournament page:', error)
      } finally {
        if (!cancelled) {
          setDataLoaded(true)
          setIsLoading(false)
        }
      }
    }
    loadData()
    return () => {
      cancelled = true
    }
  }, [actualTournamentId, orgSlug, tournamentSlug, seriesSlug, seasonSlug, navigate])

  /**
   * One address per season for search engines.
   *
   * The same season answers to three URLs — its own, the competition's, and the
   * tournament link shared before seasons existed — so the page has to say which
   * of them is the real one. The title used to be the same on every page of the
   * site, which is its own kind of invisible.
   */
  useEffect(() => {
    if (!tournament) return

    const competitionName = seriesName(tournament)
    const label = seasonLabel(tournament)
    document.title = `${competitionName} ${label} — MFTournament`

    if (!organizerSlug) return
    const href = `${window.location.origin}/${organizerSlug}/${slugify(competitionName)}/${slugify(label)}`

    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
      document.head.appendChild(link)
    }
    link.href = href
  }, [tournament, organizerSlug])

  // Note: we intentionally do NOT reload data on tab focus/visibility change.
  // Public tournament data changes infrequently and the cache (localStorage-backed)
  // already serves it; reloading on every focus caused unnecessary DynamoDB scans.

  if (isLoading || !dataLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center relative overflow-hidden">
        <PublicHeader />
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-40 right-20 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl animate-pulse delay-1000"></div>
          <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
          <div className="absolute bottom-32 right-1/3 w-28 h-28 bg-cyan-500/10 rounded-full blur-2xl animate-pulse delay-3000"></div>
        </div>
        
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center relative z-10 shadow-2xl border border-white/20">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center border border-white/20 animate-pulse">
              <IconTrophy size={30} />
            </div>
            <h1 className="text-3xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Loading Tournament
            </h1>
            <p className="text-lg opacity-80 text-gray-300">Please wait while we load the tournament data...</p>
          </div>
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-white/20 border-t-blue-400"></div>
          </div>
        </div>
      </div>
    )
  }

  // Show tournament not found if it doesn't exist
  if (!tournament) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center relative overflow-hidden">
        <PublicHeader />
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-32 h-32 bg-red-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-40 right-20 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl animate-pulse delay-1000"></div>
          <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-yellow-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
        </div>
        
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center relative z-10 shadow-2xl border border-white/20">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-2xl flex items-center justify-center border border-white/20">
              <IconTrophy size={30} />
            </div>
            <h1 className="text-3xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Tournament Not Found
            </h1>
            <p className="text-lg opacity-80 text-gray-300 mb-6">The tournament you're looking for doesn't exist.</p>
          </div>
          <Link 
            to="/" 
            className="inline-block px-6 py-3 rounded-xl glass hover:bg-white/10 transition-all duration-300 text-white font-medium border border-white/20 hover:border-white/30 hover:shadow-lg hover:shadow-white/5"
          >
            Go to Home
          </Link>
        </div>
      </div>
    )
  }


  const calculateTable = () => {
    if (!tournament) return { table: [], eliminatedTeams: new Set<string>(), groupTables: {} }
    
    // Check if this is a groups_with_divisions format - EXACTLY like admin page
    if (tournament.format?.mode === 'groups_with_divisions' && tournament.format?.groupsWithDivisionsConfig) {
      let groups = tournament.format.groupsWithDivisionsConfig.groups
      
      // If groups aren't stored, reconstruct them from matches
      if (!groups || groups.length === 0) {
        const config = tournament.format.groupsWithDivisionsConfig
        const numberOfGroups = config.numberOfGroups || 4
        const teamsPerGroup = config.teamsPerGroup || 4
        
        // Reconstruct groups from match groupIndex
        const reconstructedGroups: Record<number, Set<string>> = {}
        tournament.matches.forEach((m: any) => {
          if (!m.isPlayoff && m.groupIndex) {
            if (!reconstructedGroups[m.groupIndex]) {
              reconstructedGroups[m.groupIndex] = new Set()
            }
            reconstructedGroups[m.groupIndex].add(m.homeTeamId)
            reconstructedGroups[m.groupIndex].add(m.awayTeamId)
          }
        })
        
        // Convert to array format
        groups = []
        for (let i = 1; i <= numberOfGroups; i++) {
          if (reconstructedGroups[i]) {
            groups.push(Array.from(reconstructedGroups[i]))
          } else {
            // Fallback: distribute teams evenly
            const startIdx = (i - 1) * teamsPerGroup
            const endIdx = Math.min(startIdx + teamsPerGroup, tournament.teamIds.length)
            groups.push(tournament.teamIds.slice(startIdx, endIdx))
          }
        }
      }
      
      if (groups && groups.length > 0) {
        const groupTables: Record<number, any[]> = {}
      
        // Calculate standings for each group separately - EXACTLY like admin page
        groups.forEach((groupTeams: string[], groupIndex: number) => {
          const stats: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> = {}
          
          // Initialize stats for teams in this group
          groupTeams.forEach((tid: string) => {
            stats[tid] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
          })
          
          // Count group matches (matches with this groupIndex)
          // Match by groupIndex first (most reliable), with fallback to team matching
          const groupMatches = tournament.matches.filter((m: any) => {
            if (m.isPlayoff) return false
            
            // Primary check: match by groupIndex (1-based: 1, 2, 3, 4 for groups A, B, C, D)
            if (m.groupIndex === groupIndex + 1) {
              return true // Trust groupIndex if it's set
            }
            
            // Fallback: if groupIndex is missing or doesn't match, check by teams
            // This handles cases where groupIndex might not be set correctly
            if (!m.groupIndex && groupTeams.includes(m.homeTeamId) && groupTeams.includes(m.awayTeamId)) {
              return true
            }
            
            return false
          })
          
          for (const m of groupMatches) {
            if (!m || (m as any).homeGoals == null || (m as any).awayGoals == null) continue
            const a = stats[(m as any).homeTeamId]
            const b = stats[(m as any).awayTeamId]
            if (!a || !b) continue
            
            a.p++; b.p++
            a.gf += (m as any).homeGoals; a.ga += (m as any).awayGoals
            b.gf += (m as any).awayGoals; b.ga += (m as any).homeGoals
            if ((m as any).homeGoals > (m as any).awayGoals) { a.w++; b.l++; a.pts += 3 }
            else if ((m as any).homeGoals < (m as any).awayGoals) { b.w++; a.l++; b.pts += 3 }
            else { a.d++; b.d++; a.pts++; b.pts++ }
          }
          
          const table = Object.entries(stats).map(([id, s]) => ({ id, ...s }))
            .sort((x: any, y: any) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf)
          
          groupTables[groupIndex + 1] = table
        })
      
        return { table: [], eliminatedTeams: new Set<string>(), groupTables }
      }
    }
    
    // Regular league/playoff table calculation
    const stats: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> = {}
    const eliminatedTeams = new Set<string>()
    
    // Initialize stats ONLY for teams in this tournament
    tournament.teamIds.forEach((tid: string) => {
      if (tid) {
        stats[tid] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
      }
    })

    // Process all matches (including custom playoff matches)
    const played = allMatches(tournament)
    played.forEach((match: any) => {
      // Only process matches that have been played (both scores are valid numbers)
      const hasValidScores = typeof match.homeGoals === 'number' && typeof match.awayGoals === 'number' &&
                           !isNaN(match.homeGoals) && !isNaN(match.awayGoals) &&
                           match.homeGoals >= 0 && match.awayGoals >= 0
      
      if (hasValidScores) {
        const homeTeam = stats[match.homeTeamId]
        const awayTeam = stats[match.awayTeamId]
        
        if (homeTeam && awayTeam) {
          homeTeam.p++
          awayTeam.p++
          homeTeam.gf += match.homeGoals
          homeTeam.ga += match.awayGoals
          awayTeam.gf += match.awayGoals
          awayTeam.ga += match.homeGoals

          if (match.homeGoals > match.awayGoals) {
            homeTeam.w++
            awayTeam.l++
            homeTeam.pts += 3
          } else if (match.homeGoals < match.awayGoals) {
            awayTeam.w++
            homeTeam.l++
            awayTeam.pts += 3
          } else {
            homeTeam.d++
            awayTeam.d++
            homeTeam.pts++
            awayTeam.pts++
          }
        }
      }
    })
    
    // Who has been knocked out.
    //
    // This only ran for league_playoff and swiss_elimination, so a tournament
    // whose knockout games are hand-built rounds — the format this league
    // actually uses — never showed anyone as eliminated.
    const knockoutModes = ['league_playoff', 'swiss_elimination']
    played.forEach((match: any) => {
      const decidesElimination =
        match.isElimination === true ||
        (match.isPlayoff && knockoutModes.includes(tournament.format?.mode))
      if (!decidesElimination) return

      const { homeTeamId, awayTeamId, homeGoals, awayGoals } = match
      if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return
      if (typeof homeGoals !== 'number' || typeof awayGoals !== 'number') return

      if (homeGoals > awayGoals) eliminatedTeams.add(awayTeamId)
      else if (homeGoals < awayGoals) eliminatedTeams.add(homeTeamId)
    })
    
    const table = Object.entries(stats).map(([id, s]) => ({ id, ...s }))
      .sort((x: any, y: any) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf)
    
    return { table, eliminatedTeams, groupTables: {} }
  }

  // Calculate table directly without useMemo to avoid infinite loops
  const { table, eliminatedTeams, groupTables } = calculateTable()

  const venue = describeVenue(tournament.location)

  /* ---------- Seasons ---------- */

  const competition = seriesName(tournament)
  const thisSeason = seasonLabel(tournament)
  const championId = championOf(tournament)
  const champion = championId ? teams.find((team: any) => team.id === championId) : undefined
  const otherSeasons = seasons.filter((season) => season.id !== tournament.id)
  const seasonHref = (season: TournamentSummary) =>
    `/${organizerSlug}/${slugify(seriesName(season))}/${slugify(seasonLabel(season))}`

  /**
   * Where a fixture's own page lives.
   *
   * The season address when we know it, so the link a visitor follows stays in
   * the season they were reading; the old id address otherwise, which is what
   * /public/tournaments/:id still resolves.
   */
  const matchHref = (match: any) =>
    organizerSlug
      ? `/${organizerSlug}/${slugify(competition)}/${slugify(thisSeason)}/matches/${encodeURIComponent(match.id)}`
      : `/public/tournaments/${tournament.id}/matches/${encodeURIComponent(match.id)}`

  const renderMatch = (match: any) => {
    const homeTeam = teams.find((t: any) => t.id === match.homeTeamId)
    const awayTeam = teams.find((t: any) => t.id === match.awayTeamId)
    // `!== null` also passed for a match whose goals were never set at
    // all, which is every fixture that has not been played.
    const status = matchStatus(match)
    const isMatchFinished = status === 'finished'
    const isMatchUpcoming = status === 'upcoming'

    return (
      <div key={match.id} className={`group relative bg-white/5 backdrop-blur-sm rounded-xl p-3 sm:p-6 hover:bg-white/10 transition-all duration-300 border ${
        isMatchFinished ? 'border-green-500/20' :
        isMatchUpcoming ? 'border-blue-500/20' :
        'border-yellow-500/20'
      }`}>
        {/* A bare coloured dot sat here. Nothing on the page said what
            the colours meant, so it read as decoration. The elimination flag
            sits beside it — it was in the data all along and never reached the
            page, so a knockout game looked like any other fixture. */}
        <div className="absolute top-2 right-2 sm:top-3 sm:right-3 flex items-center gap-1">
          {match.isElimination && (
            <span className="text-[10px] sm:text-xs uppercase tracking-wide font-medium px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-400/20">
              Elimination
            </span>
          )}
          <span className={`text-[10px] sm:text-xs uppercase tracking-wide font-medium px-2 py-0.5 rounded-full ${
            isMatchFinished ? 'bg-green-500/15 text-green-300' :
            isMatchUpcoming ? 'bg-blue-500/15 text-blue-300' :
            'bg-yellow-500/15 text-yellow-300'
          }`}>
            {isMatchFinished ? 'Full time' : isMatchUpcoming ? 'Scheduled' : 'In progress'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          {/* Home Team */}
          <div className="flex items-center gap-2 sm:gap-4 flex-1">
            {homeTeam?.logo ? (
              <div className="relative">
                <img
    loading="lazy"
    decoding="async" 
                  src={homeTeam.logo} 
                  alt={`${homeTeam.name} logo`}
                  className="w-10 h-10 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300"
                />
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></div>
              </div>
            ) : (
              <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300">
                <span className="text-sm sm:text-lg font-bold text-white">
                  {homeTeam?.name?.charAt(0) || 'H'}
                </span>
              </div>
            )}
            <div>
              <Link 
                to={`/public/teams/${match.homeTeamId}`}
                className="text-white font-semibold text-sm sm:text-lg group-hover:text-blue-300 transition-colors duration-300"
              >
                {homeTeam?.name || 'Unknown Team'}
              </Link>
            </div>
          </div>
          
          {/* Score/VS — and the way into the match itself.

              The score was a plain block of text. Everybody pressed it, nothing
              happened, and the match page that shows the goals, the lineups and
              the shot count was reachable only by typing its address. */}
          <Link
            to={matchHref(match)}
            className="text-center px-2 sm:px-6 rounded-lg hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 transition-colors py-1"
            aria-label={`Match details: ${homeTeam?.name || 'Home'} against ${awayTeam?.name || 'Away'}`}
          >
            {isMatchFinished ? (
              <div className="space-y-1 sm:space-y-2">
                <div className="text-xl sm:text-3xl font-bold text-white">
                  {match.homeGoals} - {match.awayGoals}
                </div>
              </div>
            ) : (
              <div className="space-y-1 sm:space-y-2">
                {/* The status now has one home, the badge in the corner. */}
                <div className="text-sm sm:text-xl font-semibold text-gray-300">vs</div>
              </div>
            )}

            {/* Match Date & Time */}
            {(() => {
              const when = kickOff(match)
              if (!when) return null
              return (
                <div className="text-xs sm:text-sm text-gray-300 mt-1 sm:mt-2">
                  {when.day && <div>{when.day}</div>}
                  <div>{when.time}</div>
                </div>
              )
            })()}

            <div className="text-[10px] sm:text-xs text-gray-400 mt-1 underline decoration-white/20 underline-offset-4">
              Match details
            </div>
          </Link>
          
          {/* Away Team */}
          <div className="flex items-center gap-2 sm:gap-4 flex-1 justify-end">
            <div className="text-right">
              <Link 
                to={`/public/teams/${match.awayTeamId}`}
                className="text-white font-semibold text-sm sm:text-lg group-hover:text-blue-300 transition-colors duration-300"
              >
                {awayTeam?.name || 'Unknown Team'}
              </Link>
            </div>
            {awayTeam?.logo ? (
              <div className="relative">
                <img
    loading="lazy"
    decoding="async" 
                  src={awayTeam.logo} 
                  alt={`${awayTeam.name} logo`}
                  className="w-10 h-10 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300"
                />
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></div>
              </div>
            ) : (
              <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300">
                <span className="text-sm sm:text-lg font-bold text-white">
                  {awayTeam?.name?.charAt(0) || 'A'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const playoffSurvivors = survivorsByPlayoffRound(tournament)

  const hasPlayoffBracket =
    tournament.format?.mode === 'league_custom_playoff' &&
    (tournament.format?.customPlayoffConfig?.playoffRounds?.length ?? 0) > 0

  // A plain array, not useMemo: this sits after the loading and not-found
  // early returns, where an extra hook would change the hook order.
  const sections: Section[] = [
    { id: 'standings', label: 'Table' },
    ...(hasPlayoffBracket ? [{ id: 'playoffs', label: 'Playoffs' }] : []),
    { id: 'fixtures', label: 'Fixtures' },
    { id: 'stats', label: 'Stats' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black relative overflow-hidden">
      <PublicHeader />
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl animate-pulse delay-1000"></div>
        <div className="absolute bottom-20 left-1/4 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
        <div className="absolute bottom-32 right-1/3 w-28 h-28 bg-cyan-500/10 rounded-full blur-2xl animate-pulse delay-3000"></div>
      </div>

      {/* Header */}
      <div className="relative z-10">
        <div className="container mx-auto px-4 py-16 text-center">
          <div className="glass rounded-2xl p-8 max-w-4xl mx-auto shadow-2xl border border-white/20">
            {tournament.logo && (
              <div className="mb-6 flex justify-center">
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl blur-2xl opacity-30 bg-gradient-to-r from-blue-400/20 to-purple-400/20" />
                  {/* A round frame with heavy padding turned a wide club crest
                      into a small sticker floating in a grey disc. */}
                  <div className="relative bg-white/[0.07] rounded-2xl p-3 border border-white/15">
                    <img
                      decoding="async"
                      src={tournament.logo}
                      alt={`${tournament.name} logo`}
                      className="w-28 h-28 object-contain"
                    />
                  </div>
                </div>
              </div>
            )}

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              {competition}
            </h1>

            {/* Which season is on screen, and how to reach the others. */}
            {seasons.length > 1 ? (
              <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
                {seasons.map((season) => {
                  const isCurrent = season.id === tournament.id
                  return (
                    <Link
                      key={season.id}
                      to={seasonHref(season)}
                      aria-current={isCurrent ? 'page' : undefined}
                      className={`px-3 py-1.5 rounded-full text-sm inline-flex items-center gap-1.5 border transition-colors ${
                        isCurrent
                          ? 'bg-white/15 border-white/25 text-white font-medium'
                          : 'bg-white/[0.03] border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {season.status === 'finished' && <Trophy size={14} />}
                      {seasonLabel(season)}
                    </Link>
                  )
                })}
              </div>
            ) : (
              <p className="mb-5 text-gray-300">{thisSeason}</p>
            )}

            {/* A finished season has a champion, and that is the headline. */}
            {champion && (
              <div className="mb-6 inline-flex items-center gap-4 rounded-2xl border border-amber-400/25 bg-gradient-to-r from-amber-500/[0.14] to-transparent px-5 py-3.5">
                <Trophy size={44} />
                <div className="text-left">
                  <div className="text-[11px] uppercase tracking-[0.08em] text-amber-200/70">
                    Champions {thisSeason}
                  </div>
                  <Link
                    to={`/public/teams/${champion.id}`}
                    className="text-lg sm:text-xl font-bold hover:text-amber-200 transition-colors"
                  >
                    {champion.name}
                  </Link>
                </div>
                {champion.logo && (
                  <img
                    loading="lazy"
                    decoding="async"
                    src={champion.logo}
                    alt=""
                    className="w-12 h-12 rounded-full object-cover border border-amber-400/30"
                  />
                )}
              </div>
            )}

            {/* Venue, links and the size of the tournament. */}
            <div className="space-y-4">
              {venue && (
                <div className="flex items-center justify-center gap-2 text-base sm:text-lg text-gray-200">
                  <LocationIcon size={18} />
                  {venue.href ? (
                    <a
                      href={venue.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-white underline decoration-white/25 underline-offset-4 transition-colors"
                    >
                      {venue.label}
                    </a>
                  ) : (
                    <span>{venue.label}</span>
                  )}
                </div>
              )}

              {(tournament.socialMedia?.facebook || tournament.socialMedia?.instagram) && (
                <div className="flex justify-center gap-3">
                  {tournament.socialMedia?.facebook && (
                    <a
                      href={tournament.socialMedia.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/15 px-4 py-2 rounded-lg transition-colors"
                    >
                      <FacebookIcon size={18} />
                      <span className="text-sm">Facebook</span>
                    </a>
                  )}
                  {tournament.socialMedia?.instagram && (
                    <a
                      href={tournament.socialMedia.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/15 px-4 py-2 rounded-lg transition-colors"
                    >
                      <InstagramIcon size={18} />
                      <span className="text-sm">Instagram</span>
                    </a>
                  )}
                </div>
              )}

              {/* Two coloured dots used to sit in front of these numbers,
                  decorating nothing. */}
              <p className="text-sm text-gray-300">
                {tournament.teamIds?.length || 0} teams · {tournament.matches?.length || 0} matches
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8 relative z-10">
        <SectionNav sections={sections} />

        <Highlights tournament={tournament} teams={teams} />

        {/* Standings - Groups or Regular Table */}
        <div id="standings" className="mb-12 scroll-mt-20">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Standings</h2>
          </div>
          
          {/* Group Tables */}
          {tournament.format?.mode === 'groups_with_divisions' && (tournament.format?.groupsWithDivisionsConfig?.groups || tournament.format?.groupsWithDivisionsConfig) ? (
            <div className="grid grid-cols-1 gap-4 mb-8">
              {(() => {
                // Get groups from config or reconstruct from groupTables
                let groups = tournament.format?.groupsWithDivisionsConfig?.groups || []
                
                // If no groups but we have groupTables, create groups from groupTables
                if (groups.length === 0 && Object.keys(groupTables).length > 0) {
                  const config = tournament.format?.groupsWithDivisionsConfig
                  const numberOfGroups = config?.numberOfGroups || Object.keys(groupTables).length
                  
                  groups = []
                  for (let i = 1; i <= numberOfGroups; i++) {
                    const groupTable = (groupTables as Record<number, any[]>)[i] || []
                    const teamIds = groupTable.map((row: any) => row.id)
                    if (teamIds.length > 0) {
                      groups.push(teamIds)
                    }
                  }
                }
                
                // If still no groups, create from teamIds based on config
                if (groups.length === 0) {
                  const config = tournament.format?.groupsWithDivisionsConfig
                  const numberOfGroups = config?.numberOfGroups || 4
                  const teamsPerGroup = config?.teamsPerGroup || 4
                  
                  for (let i = 0; i < numberOfGroups; i++) {
                    const startIdx = i * teamsPerGroup
                    const endIdx = Math.min(startIdx + teamsPerGroup, tournament.teamIds.length)
                    groups.push(tournament.teamIds.slice(startIdx, endIdx))
                  }
                }
                
                return groups.map((_groupTeams: string[], groupIndex: number) => {
                  const groupTable = (groupTables as Record<number, any[]>)[groupIndex + 1] || []
                  const groupLetter = String.fromCharCode(65 + groupIndex) // A, B, C, D, etc.
                  
                  return (
                    <div key={groupIndex} className="glass rounded-2xl p-4 sm:p-8 overflow-hidden shadow-2xl border border-white/20">
                      <h3 className="text-xl sm:text-2xl font-bold text-white mb-4 text-center">Group {groupLetter}</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs sm:text-base">
                          <thead>
                            <tr className="border-b border-white/20">
                              <th className="text-left py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">#</th>
                              <th className="text-left py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">Team</th>
                              <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">P</th>
                              <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">W</th>
                              <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">D</th>
                              <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">L</th>
                              <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">GF</th>
                              <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">GA</th>
                              <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">GD</th>
                              <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">Pts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupTable.map((row: any, index: number) => {
                              const team = teams.find((t: any) => t.id === row.id)
                              const isTop2 = index < 2
                              const isTop4 = index < 4
                              return (
                                <tr 
                                  key={row.id} 
                                  className={`border-b border-white/10 hover:bg-white/5 transition-all duration-300 ${isTop2 ? 'bg-gradient-to-r from-green-500/5 to-green-500/10' : isTop4 ? 'bg-gradient-to-r from-blue-500/5 to-blue-500/10' : ''}`}
                                >
                                  <td className="py-2 px-1 sm:px-6 text-white font-bold text-xs sm:text-lg">{index + 1}</td>
                                  <td className="py-2 px-1 sm:px-6">
                                    <Link 
                                      to={`/public/teams/${row.id}`}
                                      className="group flex items-center gap-1 sm:gap-4 hover:text-blue-300 transition-colors duration-300"
                                    >
                                      {team?.logo ? (
                                        <div className="relative">
                                          <img
              loading="lazy"
              decoding="async" 
                                            src={team.logo} 
                                            alt={`${team.name} logo`}
                                            className="w-10 h-10 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300"
                                          />
                                          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></div>
                                        </div>
                                      ) : (
                                        <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300">
                                          <span className="text-xs sm:text-base font-bold text-white">
                                            {team?.name?.charAt(0) || 'T'}
                                          </span>
                                        </div>
                                      )}
                                      <span className="font-medium text-xs sm:text-lg group-hover:text-blue-300 transition-colors duration-300">
                                        {team?.name || 'Unknown Team'}
                                      </span>
                                    </Link>
                                  </td>
                                  <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.p}</td>
                                  <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.w}</td>
                                  <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.d}</td>
                                  <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.l}</td>
                                  <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.gf}</td>
                                  <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.ga}</td>
                                  <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.gf - row.ga}</td>
                                  <td className="py-2 px-1 sm:px-6 text-center text-white font-bold text-xs sm:text-xl">{row.pts}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <StandingsLegend />
                      <div className="text-center mt-3 text-xs sm:text-sm text-gray-300">
                        <p>Top 2 teams advance to Division 1 playoffs</p>
                        <p>3rd and 4th place go to Division 2 playoffs</p>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          ) : (
            /* Regular Standings Table */
            <div className="glass rounded-2xl p-4 sm:p-8 overflow-hidden shadow-2xl border border-white/20">
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-base">
                  <thead>
                    <tr className="border-b border-white/20">
                      <th className="text-left py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">#</th>
                      <th className="text-left py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">Team</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">P</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">W</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">D</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">L</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">GF</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">GA</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">GD</th>
                      <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.map((row: any, index: number) => {
                      const team = teams.find((t: any) => t.id === row.id)
                      const isTopThree = index < 3
                      const isEliminated = eliminatedTeams.has(row.id)
                      return (
                        <tr 
                          key={row.id} 
                          className={`border-b border-white/10 hover:bg-white/5 transition-all duration-300 ${isTopThree ? 'bg-gradient-to-r from-yellow-500/5 to-orange-500/5' : ''} ${isEliminated ? 'opacity-50' : ''}`}
                        >
                          <td className="py-2 px-1 sm:px-6 text-white font-bold text-xs sm:text-lg">
                            <div className="flex items-center gap-1 sm:gap-2">
                              {isTopThree && (
                                <div className={`w-4 h-4 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                  index === 0 ? 'bg-yellow-500 text-black' : 
                                  index === 1 ? 'bg-gray-400 text-black' : 
                                  'bg-orange-500 text-black'
                                }`}>
                                  {index + 1}
                                </div>
                              )}
                              {!isTopThree && <span className="text-xs sm:text-base">{index + 1}</span>}
                            </div>
                          </td>
                          <td className="py-2 px-1 sm:px-6">
                            <Link 
                              to={`/public/teams/${row.id}`}
                              className="group flex items-center gap-1 sm:gap-4 hover:text-blue-300 transition-colors duration-300"
                            >
                              {team?.logo ? (
                                <div className="relative">
                                  <img
              loading="lazy"
              decoding="async" 
                                    src={team.logo} 
                                    alt={`${team.name} logo`}
                                    className="w-10 h-10 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300"
                                  />
                                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"></div>
                                </div>
                              ) : (
                                <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border-2 border-white/20 group-hover:border-blue-400/50 transition-colors duration-300">
                                  <span className="text-xs sm:text-base font-bold text-white">
                                    {team?.name?.charAt(0) || 'T'}
                                  </span>
                                </div>
                              )}
                              <span className="font-medium text-xs sm:text-lg group-hover:text-blue-300 transition-colors duration-300">
                                {team?.name || 'Unknown Team'}
                              </span>
                              {isEliminated && (
                                <span className="text-xs bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded-full">
                                  Eliminated
                                </span>
                              )}
                            </Link>
                          </td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.p}</td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.w}</td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.d}</td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.l}</td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.gf}</td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.ga}</td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white text-xs sm:text-lg font-medium">{row.gf - row.ga}</td>
                          <td className="py-2 px-1 sm:px-6 text-center text-white font-bold text-xs sm:text-xl">{row.pts}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <StandingsLegend />
            </div>
          )}
        </div>

        {/* Playoff Bracket Section */}
        {hasPlayoffBracket && (
          <div id="playoffs" className="mb-12 scroll-mt-20">
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Playoffs</h2>
            </div>

            {/* These rounds used to render in their own stripped-down layout:
                no date, no kick-off time, no elimination marker — which is why
                the last rounds looked like they had not been scheduled. They now
                use the same cards as every other fixture. */}
            {tournament.format.customPlayoffConfig.playoffRounds.map((round: any, roundIndex: number) => {
              const matches: any[] = (round.matches || []).map((match: any) => ({
                ...match,
                isElimination: match.isElimination || round.isElimination || false,
              }))
              // Only teams still in the tournament can be resting: the ones
              // already knocked out are absent for good, not for a week.
              const resting = restingNote(playoffSurvivors[roundIndex] || [], matches, teams)
              const day = matches.find((match) => match.dateISO)
              const dayLabel = day
                ? new Date(day.dateISO).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
                : ''

              return (
                <RoundCard
                  key={roundIndex}
                  badge={String(roundIndex + 1)}
                  title={round.name || `Playoff round ${roundIndex + 1}`}
                  subtitle={[dayLabel, roundSubtitle(matches), resting, round.description]
                    .filter(Boolean)
                    .join(' · ')}
                  accent="border-amber-400/25"
                  badgeAccent="from-amber-500/20 to-orange-500/20 border-amber-400/25"
                  defaultOpen
                >
                  {matches.length > 0 ? (
                    matches.map(renderMatch)
                  ) : (
                    <p className="text-center text-gray-300 py-2">No matches scheduled yet.</p>
                  )}
                </RoundCard>
              )
            })}
          </div>
        )}

        {/* Matches by Rounds */}
        <div id="fixtures" className="mb-12 scroll-mt-20">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Fixtures & Results</h2>
          </div>
          
          {(() => {
            // Helper function to render match
            
            // For groups_with_divisions format, organize differently
            if (tournament.format?.mode === 'groups_with_divisions') {
              // Separate group and playoff matches
              const groupMatches: any[] = []
              const playoffMatches: any[] = []
              
              tournament.matches?.forEach((match: any) => {
                if (!match.isPlayoff) {
                  groupMatches.push(match)
                } else {
                  playoffMatches.push(match)
                }
              })
              
              // For groups_with_divisions, use round numbers directly if they're in a reasonable range (0-5)
              // Otherwise, reorganize (for old tournaments that haven't been fixed yet)
              const allRounds = new Set(groupMatches.map(m => m.round || 0))
              const maxRound = Math.max(...Array.from(allRounds), 0)
              const minRound = Math.min(...Array.from(allRounds), 0)
              
              let groupMatchesByRound: Record<number, any[]> = {}
              let sortedGroupRounds: number[] = []
              
              // If rounds are in a small range (0-5), use them directly (they're fixed)
              // Otherwise, reorganize (old tournaments with offset rounds)
              if (maxRound <= 5 && minRound >= 0) {
                // Rounds are fixed - use them directly (like admin page)
                groupMatches.forEach(match => {
                  const round = match.round || 0
                  if (!groupMatchesByRound[round]) {
                    groupMatchesByRound[round] = []
                  }
                  groupMatchesByRound[round].push(match)
                })
                sortedGroupRounds = Object.keys(groupMatchesByRound)
                  .map(Number)
                  .sort((a, b) => a - b)
              } else {
                // Rounds not fixed - reorganize (for old tournaments)
                const matchesByGroupForReorg: Record<number, any[]> = {}
                groupMatches.forEach(match => {
                  const groupIndex = match.groupIndex || 1
                  if (!matchesByGroupForReorg[groupIndex]) {
                    matchesByGroupForReorg[groupIndex] = []
                  }
                  matchesByGroupForReorg[groupIndex].push(match)
                })
                
                // Sort matches within each group by their original round
                Object.keys(matchesByGroupForReorg).forEach(groupKey => {
                  const groupIndex = Number(groupKey)
                  matchesByGroupForReorg[groupIndex].sort((a, b) => (a.round || 0) - (b.round || 0))
                })
                
                // Reorganize into rounds: Round 1 = first match from each group, Round 2 = second match, etc.
                const maxMatchesPerGroup = Math.max(...Object.values(matchesByGroupForReorg).map(matches => matches.length), 0)
                
                for (let roundIndex = 0; roundIndex < maxMatchesPerGroup; roundIndex++) {
                  Object.keys(matchesByGroupForReorg).forEach(groupKey => {
                    const groupIndex = Number(groupKey)
                    const groupMatchesList = matchesByGroupForReorg[groupIndex]
                    if (groupMatchesList[roundIndex]) {
                      if (!groupMatchesByRound[roundIndex]) {
                        groupMatchesByRound[roundIndex] = []
                      }
                      groupMatchesByRound[roundIndex].push(groupMatchesList[roundIndex])
                    }
                  })
                }
                
                sortedGroupRounds = Object.keys(groupMatchesByRound)
                  .map(Number)
                  .sort((a, b) => a - b)
              }
              
              // Group playoff matches by division and round
              const div1MatchesByRound: Record<number, any[]> = {}
              const div2MatchesByRound: Record<number, any[]> = {}
              
              playoffMatches.forEach((match: any) => {
                const division = match.division || 1
                const round = match.playoffRound !== undefined ? match.playoffRound : (match.round || 0)
                
                if (division === 1) {
                  if (!div1MatchesByRound[round]) {
                    div1MatchesByRound[round] = []
                  }
                  div1MatchesByRound[round].push(match)
                } else if (division === 2) {
                  if (!div2MatchesByRound[round]) {
                    div2MatchesByRound[round] = []
                  }
                  div2MatchesByRound[round].push(match)
                }
              })
              
              // Helper function to get playoff round name
              const getPlayoffRoundName = (roundIndex: number, totalRounds: number): string => {
                if (totalRounds === 1) return 'Final'
                if (totalRounds === 2) {
                  if (roundIndex === 0) return '1/2 Final'
                  return 'Final'
                }
                if (totalRounds === 3) {
                  if (roundIndex === 0) return '1/4 Final'
                  if (roundIndex === 1) return '1/2 Final'
                  if (roundIndex === 2) return 'Final'
                }
                return `Round ${roundIndex + 1}`
              }
              
              const groupRoundOpen = defaultOpenRounds(
                sortedGroupRounds.map((roundNumber) => groupMatchesByRound[roundNumber]),
              )

              return (
                <>
                  {/* Group Stage Rounds */}
                  {sortedGroupRounds.map((roundNumber, index) => {
                    const roundMatches = groupMatchesByRound[roundNumber]

                    return (
                      <RoundCard
                        key={`group-${roundNumber}`}
                        badge={String(roundNumber + 1)}
                        title={`Round ${roundNumber + 1} — Group Stage`}
                        subtitle={roundSubtitle(roundMatches)}
                        defaultOpen={groupRoundOpen[index]}
                      >
                        {roundMatches.map(renderMatch)}
                      </RoundCard>
                    )
                  })}
                  
                  {/* Division 1 Playoffs */}
                  {Object.keys(div1MatchesByRound).length > 0 && (
                    <div className="mb-6 sm:mb-8">
                      <div className="text-center mb-4">
                        <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Division 1 Playoffs</h3>
                      </div>
                      {(() => {
                        const div1RoundKeys = Object.keys(div1MatchesByRound).map(Number).sort((a, b) => a - b)
                        const totalRounds = div1RoundKeys.length
                        return div1RoundKeys.map(roundNumber => {
                          const roundMatches = div1MatchesByRound[roundNumber]
                          const roundName = getPlayoffRoundName(roundNumber, totalRounds)

                          return (
                            <RoundCard
                              key={`div1-${roundNumber}`}
                              badge="D1"
                              title={`Division 1 — ${roundName}`}
                              subtitle={roundSubtitle(roundMatches)}
                              accent="border-green-500/20"
                              badgeAccent="from-green-500/20 to-emerald-500/20 border-green-400/20"
                              // A knockout round is short and it is the sharp end
                              // of the tournament: never folded away.
                              defaultOpen
                            >
                              {roundMatches.map(renderMatch)}
                            </RoundCard>
                          )
                        })
                      })()}
                    </div>
                  )}
                  
                  {/* Division 2 Playoffs */}
                  {Object.keys(div2MatchesByRound).length > 0 && (
                    <div className="mb-6 sm:mb-8">
                      <div className="text-center mb-4">
                        <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Division 2 Playoffs</h3>
                      </div>
                      {(() => {
                        const div2RoundKeys = Object.keys(div2MatchesByRound).map(Number).sort((a, b) => a - b)
                        const totalRounds = div2RoundKeys.length
                        return div2RoundKeys.map(roundNumber => {
                          const roundMatches = div2MatchesByRound[roundNumber]
                          const roundName = getPlayoffRoundName(roundNumber, totalRounds)

                          return (
                            <RoundCard
                              key={`div2-${roundNumber}`}
                              badge="D2"
                              title={`Division 2 — ${roundName}`}
                              subtitle={roundSubtitle(roundMatches)}
                              accent="border-blue-500/20"
                              badgeAccent="from-blue-500/20 to-cyan-500/20 border-blue-400/20"
                              defaultOpen
                            >
                              {roundMatches.map(renderMatch)}
                            </RoundCard>
                          )
                        })
                      })()}
                    </div>
                  )}
                </>
              )
            }
            
            // Regular tournament format - group matches by round
            const matchesByRound: Record<number, any[]> = {}
            tournament.matches?.forEach((match: any) => {
              if (!match.isPlayoff) {
                const round = match.round || 0
                if (!matchesByRound[round]) {
                  matchesByRound[round] = []
                }
                matchesByRound[round].push(match)
              }
            })
            
            // Sort rounds
            const sortedRounds = Object.keys(matchesByRound)
              .map(Number)
              .sort((a, b) => a - b)
            
            const roundOpen = defaultOpenRounds(
              sortedRounds.map((roundNumber) => matchesByRound[roundNumber]),
            )

            return sortedRounds.map((roundNumber, index) => {
              const roundMatches = matchesByRound[roundNumber]

              return (
                <RoundCard
                  key={roundNumber}
                  badge={String(roundNumber + 1)}
                  // "Tour" is the Russian word for a matchday; in English
                  // football this is a round.
                  title={`Round ${roundNumber + 1}`}
                  subtitle={[
                    roundSubtitle(roundMatches),
                    restingNote(tournament.teamIds || [], roundMatches, teams),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  defaultOpen={roundOpen[index]}
                >
                  {roundMatches.map(renderMatch)}
                </RoundCard>
              )
            })
          })()}
        </div>

        {/* Statistics */}
        <div id="stats" className="mb-12 scroll-mt-20">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Statistics</h2>
          </div>
          
          {/* Player Statistics */}
          <div className="glass rounded-2xl p-4 sm:p-8 shadow-2xl border border-white/20">
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <h3 className="text-xl sm:text-2xl font-bold text-white">Player Performance</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPlayerStatsFilter('all')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      playerStatsFilter === 'all'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/20'
                    }`}
                  >
                    All Players
                  </button>
                  <button
                    onClick={() => setPlayerStatsFilter('scorers')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      playerStatsFilter === 'scorers'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/20'
                    }`}
                  >
                    Top Scorers
                  </button>
                  <button
                    onClick={() => setPlayerStatsFilter('assists')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      playerStatsFilter === 'assists'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/20'
                    }`}
                  >
                    Top Assists
                  </button>
                </div>
              </div>
              
              {(() => {
                const records = [...playerRecords(allMatches(tournament)).values()]

                // Who each record belongs to. A goal scored by somebody since
                // taken off the squad still happened, so the club's current
                // squad decides the name, never whether the row exists.
                const named = records.map((record) => {
                  const team =
                    teams.find((candidate: any) =>
                      (candidate.players || []).some((player: any) => player.id === record.playerId),
                    ) || teams.find((candidate: any) => candidate.id === record.teamId)
                  const player = (team?.players || []).find(
                    (candidate: any) => candidate.id === record.playerId,
                  )
                  return { record, team, player }
                })

                let rows = named
                if (playerStatsFilter === 'scorers') {
                  rows = named
                    .filter((row) => row.record.goals > 0)
                    .sort((a, b) => b.record.goals - a.record.goals || b.record.assists - a.record.assists)
                    .slice(0, 10)
                } else if (playerStatsFilter === 'assists') {
                  rows = named
                    .filter((row) => row.record.assists > 0)
                    .sort((a, b) => b.record.assists - a.record.assists || b.record.goals - a.record.goals)
                    .slice(0, 10)
                } else {
                  rows = [...named].sort(
                    (a, b) =>
                      b.record.goals - a.record.goals ||
                      b.record.assists - a.record.assists ||
                      b.record.played - a.record.played,
                  )
                }

                // An empty table used to be the whole answer, which reads as a
                // broken page rather than as a competition whose goalscorers
                // nobody has entered yet.
                if (rows.length === 0) {
                  return (
                    <p className="text-center text-gray-300 py-6">
                      No player statistics yet. Goals, assists and lineups are recorded
                      match by match, and this competition has none entered so far.
                    </p>
                  )
                }

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs sm:text-base">
                      <thead>
                        <tr className="border-b border-white/20">
                          <th className="text-left py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">Player</th>
                          <th className="text-left py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">Club</th>
                          <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">P</th>
                          <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">Goals</th>
                          <th className="text-center py-2 px-1 sm:px-6 text-white font-semibold text-xs sm:text-lg">Assists</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ record, team, player }) => (
                          <tr
                            key={record.playerId}
                            className="border-b border-white/10 hover:bg-white/5 transition-colors"
                          >
                            <td className="py-2 px-1 sm:px-6">
                              <div className="flex items-center gap-1 sm:gap-3">
                                {player?.photo ? (
                                  <img
                                    loading="lazy"
                                    decoding="async"
                                    src={player.photo}
                                    alt={`${player.firstName} ${player.lastName}`}
                                    className="w-6 h-6 sm:w-10 sm:h-10 rounded-full object-cover border border-white/20"
                                  />
                                ) : (
                                  <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border border-white/20">
                                    <span className="text-xs font-bold text-white">
                                      {player ? `${player.firstName.charAt(0)}${player.lastName.charAt(0)}` : '?'}
                                    </span>
                                  </div>
                                )}
                                <div>
                                  <div className="text-white font-semibold text-xs sm:text-lg">
                                    {player ? (
                                      <Link
                                        to={`/public/players/${player.id}`}
                                        className="hover:text-blue-300 transition-colors"
                                      >
                                        {player.firstName} {player.lastName}
                                      </Link>
                                    ) : (
                                      // The squad no longer holds this player, so
                                      // there is no name to print — but the goals
                                      // were scored and the total has to add up.
                                      <span className="text-gray-300">Former player</span>
                                    )}
                                  </div>
                                  {player?.number && (
                                    <div className="text-xs text-gray-300">#{player.number}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-1 sm:px-6">
                              <div className="flex items-center gap-1 sm:gap-2">
                                {team?.logo ? (
                                  <img
                                    loading="lazy"
                                    decoding="async"
                                    src={team.logo}
                                    alt={`${team.name} logo`}
                                    className="w-6 h-6 sm:w-10 sm:h-10 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center">
                                    <span className="text-xs font-bold text-white">
                                      {team?.name?.charAt(0) || '?'}
                                    </span>
                                  </div>
                                )}
                                <span className="text-white font-medium text-xs sm:text-lg">
                                  {team?.name || 'Unknown club'}
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-1 sm:px-6 text-center text-white font-medium">
                              {record.played}
                            </td>
                            <td className="py-2 px-1 sm:px-6 text-center font-semibold">
                              <span className="text-yellow-400 font-bold text-xs sm:text-base">
                                {record.goals}
                              </span>
                            </td>
                            <td className="py-2 px-1 sm:px-6 text-center text-white font-medium">
                              {record.assists}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>

        {/* ---------- The competition's other seasons ---------- */}
        {otherSeasons.length > 0 && (
          <div className="mb-12 border-t border-white/5 pt-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 text-center">
              Other seasons
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
              {otherSeasons.map((season) => (
                <Link
                  key={season.id}
                  to={seasonHref(season)}
                  className="glass rounded-xl border border-white/10 hover:border-white/25 transition-colors p-4 flex items-center gap-3"
                >
                  {season.status === 'finished' ? (
                    <Trophy size={30} />
                  ) : (
                    <span className="w-[30px] h-[30px] rounded-lg bg-white/5 flex items-center justify-center text-[10px] uppercase tracking-wide text-gray-300">
                      live
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold">{seasonLabel(season)}</div>
                    <div className="text-xs text-gray-300 truncate">
                      {season.championTeamId
                        ? teams.find((team: any) => team.id === season.championTeamId)?.name ||
                          'Finished'
                        : season.status === 'finished'
                          ? 'Finished'
                          : season.status === 'running'
                            ? 'In progress'
                            : 'Not started'}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

/**
 * What the column headings mean.
 *
 * The table showed ten abbreviations and explained none of them. Anyone who
 * follows football reads P/W/D/L without thinking; a parent opening the link to
 * find their kid's team does not.
 */
function StandingsLegend() {
  const items = [
    ['P', 'Played'],
    ['W', 'Won'],
    ['D', 'Drawn'],
    ['L', 'Lost'],
    ['GF', 'Goals for'],
    ['GA', 'Goals against'],
    ['GD', 'Goal difference'],
    ['Pts', 'Points'],
  ]

  return (
    <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-300">
      {items.map(([short, long]) => (
        <span key={short}>
          <span className="font-semibold text-white">{short}</span> {long}
        </span>
      ))}
    </div>
  )
}

type Section = { id: string; label: string }

/**
 * A jump bar for the sections of the page.
 *
 * The alternative was tabs, which would have hidden the playoff bracket and the
 * scorers from anyone who did not think to look for them, and broken Cmd+F.
 * This shows the same structure without taking anything off the page.
 */
function SectionNav({ sections }: { sections: Section[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? '')
  const sectionKey = sections.map((section) => section.id).join(',')

  useEffect(() => {
    const targets = sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => Boolean(element))
    if (targets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      // The band starts below the bar itself, so a section counts as current
      // once its heading clears the nav.
      { rootMargin: '-72px 0px -55% 0px', threshold: 0 },
    )

    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
    // The list is rebuilt on every render, so compare it by content.
  }, [sectionKey])

  return (
    <nav className="sticky top-0 z-30 -mx-4 mb-8 px-4 py-2 bg-black/50 backdrop-blur-md border-b border-white/10">
      <div className="flex justify-center gap-1 overflow-x-auto">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            onClick={(event) => {
              const target = document.getElementById(section.id)
              if (!target) return
              event.preventDefault()
              target.scrollIntoView({ behavior: 'smooth', block: 'start' })
              window.history.replaceState(null, '', `#${section.id}`)
            }}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              active === section.id
                ? 'bg-white/15 text-white font-medium'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            }`}
          >
            {section.label}
          </a>
        ))}
      </div>
    </nav>
  )
}

/**
 * The two questions almost everybody arrives with: when do we play next, and
 * what happened last time. Both used to be several screens down, behind the
 * table and the scorer list.
 */
function Highlights({ tournament, teams }: { tournament: any; teams: any[] }) {
  // Rounds built by hand live inside the format, not in `matches` — without
  // them "Latest results" for a finished tournament showed the league, months
  // before the final that actually decided it.
  const fixtures: any[] = allMatches(tournament).filter(
    (match: any) => match?.homeTeamId && match?.awayTeamId,
  )

  const upcoming = fixtures
    .filter((match) => matchStatus(match) !== 'finished')
    .sort(byKickoffAscending)
    .slice(0, 3)

  const recent = fixtures
    .filter((match) => matchStatus(match) === 'finished')
    .sort((a, b) => {
      const left = matchTime(a)
      const right = matchTime(b)
      if (Number.isNaN(left) && Number.isNaN(right)) return (b.round ?? 0) - (a.round ?? 0)
      if (Number.isNaN(left)) return 1
      if (Number.isNaN(right)) return -1
      return right - left
    })
    .slice(0, 3)

  if (upcoming.length === 0 && recent.length === 0) return null

  const teamName = (id: string) =>
    teams.find((team: any) => team.id === id)?.name || 'Unknown Team'

  const row = (match: any, showScore: boolean) => (
    <li key={match.id} className="flex items-center gap-2 sm:gap-3 text-sm py-1.5">
      <span className="w-14 sm:w-16 shrink-0 text-xs text-gray-300">{shortDate(match)}</span>
      <span className="flex-1 min-w-0 truncate text-right text-white">
        {teamName(match.homeTeamId)}
      </span>
      <span
        className={`shrink-0 px-2 font-semibold ${showScore ? 'text-white' : 'text-gray-300'}`}
      >
        {showScore ? `${match.homeGoals} - ${match.awayGoals}` : 'vs'}
      </span>
      <span className="flex-1 min-w-0 truncate text-white">{teamName(match.awayTeamId)}</span>
    </li>
  )

  return (
    <div className="grid gap-4 sm:grid-cols-2 mb-8">
      {upcoming.length > 0 && (
        <div className="glass rounded-2xl p-4 sm:p-5 border border-white/20">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-2">
            Next matches
          </h2>
          <ul className="divide-y divide-white/5">{upcoming.map((match) => row(match, false))}</ul>
        </div>
      )}
      {recent.length > 0 && (
        <div className="glass rounded-2xl p-4 sm:p-5 border border-white/20">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-2">
            Latest results
          </h2>
          <ul className="divide-y divide-white/5">{recent.map((match) => row(match, true))}</ul>
        </div>
      )}
    </div>
  )
}

/**
 * A round of fixtures that can be folded away.
 *
 * A full league is several phone screens of identical cards. Finished rounds
 * collapse to their heading; the last completed round and the one being played
 * stay open, because that is the part of the season anyone is looking at.
 */
function RoundCard({
  badge,
  title,
  subtitle,
  accent = 'border-white/20',
  badgeAccent = 'from-blue-500/20 to-purple-500/20 border-white/20',
  defaultOpen,
  children,
}: {
  badge: string
  title: string
  subtitle: string
  accent?: string
  badgeAccent?: string
  defaultOpen: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="mb-4 sm:mb-6">
      <div className={`glass rounded-2xl shadow-2xl border ${accent}`}>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-3 p-3 sm:p-6 text-left hover:bg-white/[0.03] rounded-2xl transition-colors"
        >
          <div className="flex items-center gap-2 sm:gap-4">
            <div
              className={`w-8 h-8 sm:w-12 sm:h-12 bg-gradient-to-br ${badgeAccent} rounded-xl flex items-center justify-center border`}
            >
              <span className="text-sm sm:text-xl font-bold text-white">{badge}</span>
            </div>
            <div>
              <h3 className="text-lg sm:text-2xl font-bold text-white">{title}</h3>
              <div className="text-xs sm:text-sm text-gray-300">{subtitle}</div>
            </div>
          </div>
          <span
            aria-hidden
            className={`text-white/60 text-lg transition-transform ${open ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </button>
        {open && (
          <div className="grid gap-2 sm:gap-4 px-3 pb-3 sm:px-6 sm:pb-6">{children}</div>
        )}
      </div>
    </div>
  )
}

/**
 * "Khatarnak United rests" — who sits this round out.
 *
 * With an odd number of teams somebody has no opponent every week. The fixture
 * list simply did not mention them, so from the outside it looked like a team
 * had quietly disappeared for a round.
 */
function restingNote(
  candidates: string[],
  matches: any[],
  teams: any[],
): string {
  const resting = teamsNotPlaying(candidates, matches)
  if (resting.length === 0) return ''

  const names = resting.map(
    (teamId) => teams.find((team: any) => team.id === teamId)?.name || 'A team',
  )
  return names.length === 1
    ? `${names[0]} rests`
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} rest`
}

/** "6 matches · all played" reads better than a bare count. */
function roundSubtitle(matches: any[]): string {
  const played = matches.filter((match) => matchStatus(match) === 'finished').length
  if (played === 0) return `${matches.length} matches`
  if (played === matches.length) return `${matches.length} matches · all played`
  return `${matches.length} matches · ${played} played`
}

/**
 * Which rounds open on arrival: the last one that finished, and the first one
 * still being played.
 */
function defaultOpenRounds(groups: any[][]): boolean[] {
  const complete = groups.map(
    (matches) => matches.length > 0 && matches.every((match) => matchStatus(match) === 'finished'),
  )
  const lastComplete = complete.lastIndexOf(true)
  const firstIncomplete = complete.indexOf(false)
  return groups.map((_, index) => index === lastComplete || index === firstIncomplete)
}
