import { useParams, Link } from 'react-router-dom'
import { useAppStore } from '../store'
import { useMemo, useState, useEffect } from 'react'
import { generatePlayoffBrackets, createPlayoffMatches as createPlayoffMatchesFromBrackets } from '../utils/schedule'
import { generateMatchUID } from '../utils/uid'
import { generateGroupsWithDivisionsSchedule } from '../utils/tournament'
import { findTournamentBySlug } from '../utils/urls'
import { organizerService } from '../lib/data'
import type { CustomPlayoffRoundConfig, Match, Organizer } from '../types'
import LocationIcon from '../components/LocationIcon'
import {
  IconLink,
  IconCheck,
  IconGear,
  IconPencil,
  IconClose,
  IconTrophy,
  IconChart,
  IconRest,
  IconCalendar,
  IconBolt,
  IconPlus,
  IconTrash,
  IconKnockout,
  IconRepeat,
  IconEye,
  IconEyeOff,
} from '../components/icons'
import FacebookIcon from '../components/FacebookIcon'
import InstagramIcon from '../components/InstagramIcon'
import LogoUploader from '../components/LogoUploader'
import VisibilityToggle from '../components/VisibilityToggle'
import CustomDatePicker from '../components/CustomDatePicker'
import CustomTimePicker from '../components/CustomTimePicker'
import MatchDateTime from '../components/MatchDateTime'
import { applyDateToRound, applyTimePatternToRounds } from '../utils/matchdates'
import { localDatePart, localTimePart } from '../utils/datetime'
import { planNextProgressiveRound, PROGRESSIVE_PRESET, teamsNotPlaying, survivorsByPlayoffRound } from '../utils/progressive'
import InlineInput from '../components/InlineInput'
import { adminSeasonUrl, getSeasonUrl, publicSeasonUrl } from '../utils/seasons'
import { cdnUrl } from '../utils/images'

/**
 * Which round a click was aimed at, sent with the write.
 *
 * The index is this page's position in a list it read earlier; a round deleted
 * elsewhere shifts every round after it up by one, and an index alone would
 * then rename or delete the wrong one.
 */
const expectationOf = (round: { roundNumber?: number; name?: string }) => ({
  roundNumber: round.roundNumber,
  name: round.name,
})

// Tracks tournaments whose reconstructed groups we've already persisted this session,
// so we never rewrite the (large) tournament item more than once during rendering.
const persistedReconstructedGroups = new Set<string>()

export default function TournamentPage() {
  const { id, orgSlug, tournamentSlug } = useParams()
  const { getCurrentOrganizer, getOrganizerById, getOrganizerTournaments, getOrganizerTeams, updateTournament, updateMatchFields, setScore: saveScore, setRoundHidden, addPlayoffRound, updatePlayoffRound, removePlayoffRound, uploadTournamentLogo, loading, superAdmin } = useAppStore()

  const currentOrganizer = getCurrentOrganizer()
  const tournaments = getOrganizerTournaments()
  const teams = getOrganizerTeams()
  const [allOrganizers, setAllOrganizers] = useState<Organizer[]>([])
  const [organizersSettled, setOrganizersSettled] = useState(false)
  
  // Load all organizers for slug-based lookup.
  //
  // This request failing used to be invisible and fatal: the list stayed empty,
  // the slug lookup below returned nothing, and the page said the tournament did
  // not exist — which is what a refresh looked like whenever the call was slow
  // or came back 403.
  useEffect(() => {
    let cancelled = false
    organizerService
      .getAll()
      .then((list) => {
        if (!cancelled) setAllOrganizers(list)
      })
      .catch(() => {
        // The signed-in organizer below is enough to resolve their own slugs.
      })
      .finally(() => {
        if (!cancelled) setOrganizersSettled(true)
      })
    return () => {
      cancelled = true
    }
  }, [])
  
  // Support both old ID-based route and new slug-based route
  const tournament = useMemo(() => {
    if (id) {
      // Id route: /tournaments/:id
      return tournaments.find(t => t.id === id)
    } else if (orgSlug && tournamentSlug) {
      // Slug route: /tournaments/:orgSlug/:tournamentSlug
      // An organizer looking at their own tournament does not need the full
      // organizer list, so their own record is used when the fetch gave nothing.
      const known = allOrganizers.length > 0
        ? allOrganizers
        : currentOrganizer
          ? [currentOrganizer]
          : []
      return findTournamentBySlug(tournaments, orgSlug, tournamentSlug, known)
    }
    return undefined
  }, [id, orgSlug, tournamentSlug, tournaments, allOrganizers, currentOrganizer])
  
  // The kick-off pattern of the first round, offered to the rest of them.
  const [timePatternOpen, setTimePatternOpen] = useState(false)
  const [timePatternStartDate, setTimePatternStartDate] = useState('')
  const [timePatternIntervalDays, setTimePatternIntervalDays] = useState(7)
  const [timePatternMoveRounds, setTimePatternMoveRounds] = useState(false)

  // State for new round configuration
  const [showNewRoundForm, setShowNewRoundForm] = useState(false)
  const [newRoundConfig, setNewRoundConfig] = useState({
    name: '',
    quantityOfGames: 1,
    description: ''
  })
  
  // State for editing groups
  const [showEditGroups, setShowEditGroups] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [editingGroups, setEditingGroups] = useState<string[][]>([])
  
  // All useMemo hooks must be called before any early returns
  const rounds = useMemo(() => {
    if (!tournament) return [] as { round: number; matchIds: string[] }[]
    
    // Only include league matches (non-playoff matches)
    const leagueMatches = tournament.matches.filter(m => !m.isPlayoff)
    
    // For groups_with_divisions, check if rounds have been fixed (all groups share same round numbers)
    // If rounds are already fixed (0, 1, 2 for all groups), use them directly
    // Otherwise, reorganize like before
    if (tournament.format?.mode === 'groups_with_divisions') {
      // Check if all groups have the same set of round numbers (indicating rounds are fixed)
      const matchesByGroup: Record<number, Set<number>> = {}
      leagueMatches.forEach(match => {
        const groupIndex = match.groupIndex || 1
        if (!matchesByGroup[groupIndex]) {
          matchesByGroup[groupIndex] = new Set()
        }
        matchesByGroup[groupIndex].add(match.round || 0)
      })
      
      // Check if all groups have the same set of round numbers
      const groupRoundSets = Object.values(matchesByGroup)
      if (groupRoundSets.length > 0) {
        const firstGroupRounds = Array.from(groupRoundSets[0] || []).sort((a, b) => a - b)
        const allGroupsHaveSameRounds = groupRoundSets.every(rounds => {
          const sorted = Array.from(rounds).sort((a, b) => a - b)
          return JSON.stringify(sorted) === JSON.stringify(firstGroupRounds)
        })
        
        // If all groups share the same round numbers (already fixed), use them directly
        // This means rounds are 0, 1, 2 (or similar small range) for all groups
        if (allGroupsHaveSameRounds && firstGroupRounds.length <= 6) {
          const groups: Record<number, string[]> = {}
          for (const m of leagueMatches) {
            const r = m.round ?? 0
            groups[r] = groups[r] || []
            groups[r].push(m.id)
          }
          return Object.entries(groups)
            .map(([r, ids]) => ({ round: Number(r), matchIds: ids }))
            .sort((a, b) => a.round - b.round)
        }
      }
      
      // Otherwise, reorganize rounds (for old tournaments that haven't been fixed yet)
      const matchesByGroupForReorg: Record<number, any[]> = {}
      leagueMatches.forEach(match => {
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
      const groupMatchesByRound: Record<number, string[]> = {}
      const maxMatchesPerGroup = Math.max(...Object.values(matchesByGroupForReorg).map(matches => matches.length), 0)
      
      for (let roundIndex = 0; roundIndex < maxMatchesPerGroup; roundIndex++) {
        Object.keys(matchesByGroupForReorg).forEach(groupKey => {
          const groupIndex = Number(groupKey)
          const groupMatchesList = matchesByGroupForReorg[groupIndex]
          if (groupMatchesList[roundIndex]) {
            if (!groupMatchesByRound[roundIndex]) {
              groupMatchesByRound[roundIndex] = []
            }
            groupMatchesByRound[roundIndex].push(groupMatchesList[roundIndex].id)
          }
        })
      }
      
      return Object.entries(groupMatchesByRound)
        .map(([r, ids]) => ({ round: Number(r), matchIds: ids }))
        .sort((a, b) => a.round - b.round)
    }
    
    // Regular tournament format
    const groups: Record<number, string[]> = {}
    for (const m of leagueMatches) {
      const r = m.round ?? 0
      groups[r] = groups[r] || []
      groups[r].push(m.id)
    }
    return Object.entries(groups)
      .map(([r, ids]) => ({ round: Number(r), matchIds: ids }))
      .sort((a, b) => a.round - b.round)
  }, [tournament])

  // Separate playoff matches
  const playoffMatches = useMemo(() => {
    if (!tournament) return []
    return tournament.matches.filter(m => m.isPlayoff)
  }, [tournament])

  // Check if championship is finished (all league matches have scores)
  const isChampionshipFinished = useMemo(() => {
    if (!tournament) return false
    const leagueMatches = tournament.matches.filter(m => !m.isPlayoff)
    return leagueMatches.length > 0 && leagueMatches.every(m => m.homeGoals != null && m.awayGoals != null)
  }, [tournament])

  // Get playoff structure based on tournament format
  const playoffStructure = useMemo(() => {
            if (!tournament || !tournament.format || (tournament.format.mode !== 'league_playoff' && tournament.format.mode !== 'swiss_elimination' && tournament.format.mode !== 'league_custom_playoff')) return null
    
    if (tournament.format.mode === 'league_custom_playoff') {
      // League + Custom Playoff format
      const playoffTeams = tournament.format.customPlayoffConfig?.playoffTeams || 4
      const playoffRounds = tournament.format.customPlayoffConfig?.playoffRounds || []
      return {
        qualifiers: playoffTeams,
        rounds: playoffRounds.length, // Number of configured playoff rounds
        structure: [], // Custom playoff doesn't use standard bracket structure
        customRounds: playoffRounds // Custom round configurations
      }
    } else {
      // Standard playoff formats
      const qualifiers = tournament.format.playoffQualifiers || 4
      const rounds = Math.ceil(Math.log2(qualifiers))
      
      return {
        qualifiers,
        rounds,
        structure: generatePlayoffBrackets([...Array(qualifiers)].map((_, i) => `team_${i}`))
      }
    }
  }, [tournament])

  /**
   * Every edit on this screen writes one fixture, through the route that writes
   * one fixture.
   *
   * They all used to send the competition's whole `matches` array back from the
   * copy this page was holding — the same mistake the match screen was cured of
   * — and it is how typing a score destroyed a match. Anything written since
   * this page loaded was overwritten by the older copy: the goals and the cards
   * entered on the match screen, and the teamsheets a club's own manager had
   * named, on every fixture in the season and not only the one being edited.
   */
  function setScore(mid: string, homeGoals: number, awayGoals: number) {
    if (!tournament) return
    saveScore(
      tournament.id,
      mid,
      Number.isNaN(homeGoals) ? undefined : homeGoals,
      Number.isNaN(awayGoals) ? undefined : awayGoals,
    ).catch((error) => console.error('Error saving the score:', error))
  }

  function setPlayoffTeams(mid: string, homeTeamId: string, awayTeamId: string) {
    if (!tournament) return
    saveMatch(mid, { homeTeamId, awayTeamId })
  }

  /** One fixture's own fields, with a failed save reported rather than thrown. */
  function saveMatch(mid: string, updates: Partial<Match>) {
    if (!tournament) return
    updateMatchFields(tournament.id, mid, updates).catch((error) =>
      console.error('Error saving the match:', error),
    )
  }

  /**
   * The hand-built playoff rounds, one round at a time.
   *
   * Each of these used to rebuild the whole `format` object and send it — so
   * renaming a round rewrote every fixture in every round from the copy this
   * page was holding, and those fixtures carry goals, cards and the teamsheets
   * a club's own manager writes.
   */
  /**
   * Whether one league round's fixtures are published.
   *
   * The list is on the season rather than on the fixtures, because a league
   * round is a number and not a record — see `hiddenRounds` in `types.ts`.
   */
  const roundIsHidden = (round: number) => (tournament?.hiddenRounds ?? []).includes(round)

  /**
   * Whether this block of fixtures is a round the server can be told about.
   *
   * `hiddenRounds` names rounds by the number stored on the fixtures, and for
   * every ordinary format the block below is exactly that. A
   * `groups_with_divisions` season from before the round numbers were fixed is
   * the exception: its fixtures are regrouped into display rounds here and on
   * the public page, and the position on screen is then not the number in the
   * record. Hiding by that number would hold back a different set of games than
   * the one the organiser is looking at, so the control is not offered at all —
   * the repair tool on this page puts such a season back in step first.
   */
  const roundIsAddressable = (r: { round: number; matchIds: string[] }) =>
    r.matchIds.every(
      (id) => (tournament?.matches.find((match) => match.id === id)?.round ?? 0) === r.round,
    )

  function toggleRoundHidden(round: number) {
    if (!tournament) return
    setRoundHidden(tournament.id, round, !roundIsHidden(round)).catch((error) =>
      console.error('Error changing what the public sees of this round:', error),
    )
  }

  function savePlayoffRound(round: Partial<CustomPlayoffRoundConfig>) {
    if (!tournament) return
    addPlayoffRound(tournament.id, round).catch((error) =>
      console.error('Error adding the round:', error),
    )
  }

  function saveRound(
    index: number,
    round: CustomPlayoffRoundConfig,
    updates: { name?: string; description?: string; quantityOfGames?: number; hidden?: boolean },
  ) {
    if (!tournament) return
    updatePlayoffRound(tournament.id, index, updates, expectationOf(round)).catch((error) =>
      console.error('Error saving the round:', error),
    )
  }

  function deleteRound(index: number, round: CustomPlayoffRoundConfig) {
    if (!tournament) return
    removePlayoffRound(tournament.id, index, expectationOf(round)).catch((error) =>
      console.error('Error deleting the round:', error),
    )
  }

  // Get teams from current tournament only
  const tournamentTeams = useMemo(() => {
    if (!tournament) return []
    return teams.filter(team => tournament.teamIds.includes(team.id))
  }, [teams, tournament])

  // Get available teams for opponent selection based on selected team and match type
  const getAvailableOpponents = (selectedTeamId: string | undefined, match: any): any[] => {
    if (!tournament) return []
    
    // Always filter to tournament teams only
    let availableTeams = tournamentTeams

    // For non-playoff matches in groups_with_divisions format
    if (!match.isPlayoff && tournament.format?.mode === 'groups_with_divisions' && selectedTeamId) {
      const groups = tournament.format?.groupsWithDivisionsConfig?.groups || []
      
      // Find which group the selected team belongs to
      const teamGroupIndex = groups.findIndex(group => group.includes(selectedTeamId))
      
      if (teamGroupIndex !== -1) {
        // Filter to only teams from the same group
        availableTeams = tournamentTeams.filter(team => groups[teamGroupIndex].includes(team.id))
      }
    }

    // Exclude the selected team from opponent list
    if (selectedTeamId) {
      availableTeams = availableTeams.filter(team => team.id !== selectedTeamId)
    }

    return availableTeams
  }

  function setDate(mid: string, dateISO: string) {
    saveMatch(mid, { dateISO: dateISO || undefined })
  }

  /**
   * Saves the fixtures a bulk change actually moved, one at a time.
   *
   * The helpers below work out a whole new list, which is the natural way to
   * express "every round at the same time"; sending that list is what must not
   * happen. Comparing it against what is on screen leaves only the matches that
   * changed, and each of those is written as itself.
   */
  async function saveMovedFixtures(next: Match[]) {
    if (!tournament) return
    for (const moved of next) {
      const before = tournament.matches.find((m) => m.id === moved.id)
      if (!before || before.dateISO === moved.dateISO) continue
      await updateMatchFields(tournament.id, moved.id, { dateISO: moved.dateISO }).catch(
        (error) => console.error('Error saving a kick-off:', error),
      )
    }
  }

  /**
   * Copies the first scheduled kick-off in a round to the rest of it. Rounds are
   * almost always played on one day, so setting the same date match by match was
   * pure repetition.
   */
  function applyRoundDate(roundNumber: number) {
    if (!tournament) return
    const inRound = tournament.matches.filter((m) => (m.round ?? 0) === roundNumber)
    const source = inRound.find((m) => m.dateISO)
    if (!source) return
    saveMovedFixtures(applyDateToRound(tournament.matches, source.id))
  }

  /**
   * The first round's kick-off times, repeated in every other round. Rounds that
   * are moved as well take their day from the first round plus the interval; the
   * rest keep the day they already have.
   */
  function applyTimePattern() {
    if (!tournament) return
    saveMovedFixtures(
      applyTimePatternToRounds(
        tournament.matches,
        rounds,
        timePatternMoveRounds && timePatternStartDate
          ? { startDate: timePatternStartDate, intervalDays: timePatternIntervalDays }
          : {},
      ),
    )
    setTimePatternOpen(false)
  }

  /** Fills the panel from what is already on the fixtures before it is shown. */
  function openTimePattern() {
    if (!tournament) return
    const firstRound = rounds[0]
    const firstDate = firstRound?.matchIds
      .map((id) => tournament.matches.find((m) => m.id === id)?.dateISO)
      .find(Boolean)
    setTimePatternStartDate(localDatePart(firstDate))
    setTimePatternIntervalDays(7)
    // A round with no date at all cannot hold a time, so the dates are offered by
    // default exactly when leaving them alone would skip part of the season.
    setTimePatternMoveRounds(
      rounds.some((r) => !r.matchIds.some((id) => tournament.matches.find((m) => m.id === id)?.dateISO)),
    )
    setTimePatternOpen(true)
  }

  const handleCompleteRound = () => {
    if (!tournament || !newRoundConfig.name.trim()) {
      alert('Please enter a round name')
      return
    }

    // The round number and the fixtures' ids are the server's to assign: this
    // page derives them from a list it read earlier, and a stale one makes a
    // second round with the same number and colliding match ids.
    savePlayoffRound({
      name: newRoundConfig.name.trim(),
      quantityOfGames: newRoundConfig.quantityOfGames,
      description: newRoundConfig.description.trim(),
      matches: Array.from({ length: newRoundConfig.quantityOfGames }, () => ({
        id: generateMatchUID(),
        isElimination: false,
      })),
    })

    // Reset form
    setNewRoundConfig({
      name: '',
      quantityOfGames: 1,
      description: ''
    })
    setShowNewRoundForm(false)
  }

  const handleEndChampionship = () => {
    if (!tournament || !playoffStructure) return
    
    // Get current table standings
    const { table } = calculateTable()
    const qualifiedTeams = table.slice(0, playoffStructure.qualifiers)
    
    // Create playoff matches
    const playoffMatches = createPlayoffMatches(qualifiedTeams, tournament.id)
    
    // Update tournament with playoff matches
    updateTournament(tournament.id, {
      matches: [...tournament.matches, ...playoffMatches]
    })
  }

  // Fix group round numbers for existing tournaments
  const handleFixGroupRounds = () => {
    if (!tournament || tournament.format?.mode !== 'groups_with_divisions') return
    
    const groupMatches = tournament.matches.filter(m => !m.isPlayoff && m.groupIndex)
    
    // Group matches by groupIndex
    const matchesByGroup: Record<number, any[]> = {}
    groupMatches.forEach(match => {
      const groupIndex = match.groupIndex || 1
      if (!matchesByGroup[groupIndex]) {
        matchesByGroup[groupIndex] = []
      }
      matchesByGroup[groupIndex].push(match)
    })
    
    // Sort matches within each group by their current round number
    Object.keys(matchesByGroup).forEach(groupKey => {
      const groupIndex = Number(groupKey)
      matchesByGroup[groupIndex].sort((a, b) => (a.round || 0) - (b.round || 0))
    })
    
    // Calculate how many matches per group
    const matchesPerGroup = Math.max(...Object.values(matchesByGroup).map(matches => matches.length), 0)
    
    // We want to organize into rounds where each round has one match from each group
    // For 6 matches per group with 4 groups: we want 3 rounds with 2 matches per group per round
    // Calculate how many rounds we need: typically 3 rounds for groupRounds=2
    // But we'll calculate based on even distribution
    const expectedRounds = 3 // For 2 rounds of round-robin, we typically get 3 display rounds
    const matchesPerRoundPerGroup = Math.ceil(matchesPerGroup / expectedRounds)
    
    // Create a map of match ID to new round number
    // Distribute matches evenly: first N matches from each group = round 0, next N = round 1, etc.
    const matchRoundMap: Record<string, number> = {}
    Object.keys(matchesByGroup).forEach(groupKey => {
      const groupIndex = Number(groupKey)
      const groupMatches = matchesByGroup[groupIndex]
      groupMatches.forEach((match, index) => {
        // Calculate which round this match should be in
        // For 6 matches per group: matches 0-1 → round 0, 2-3 → round 1, 4-5 → round 2
        const newRound = Math.floor(index / matchesPerRoundPerGroup)
        matchRoundMap[match.id] = newRound
      })
    })
    
    // Reassign round numbers
    const updatedMatches = tournament.matches.map(match => {
      if (match.isPlayoff || !match.groupIndex) return match
      
      const newRound = matchRoundMap[match.id]
      if (newRound === undefined) return match
      
      return {
        ...match,
        round: newRound
      }
    })
    
    updateTournament(tournament.id, { matches: updatedMatches }).then(() => {
      alert('Group rounds have been fixed! The tournament now shows 3 rounds with 8 games each. Refreshing page...')
      // Force a page refresh to ensure the changes are visible
      window.location.reload()
    }).catch((error) => {
      console.error('Error updating tournament:', error)
      alert('Error fixing group rounds. Please try again.')
    })
  }

  // Fix groupIndex for all matches based on stored groups
  const handleFixGroupIndexes = () => {
    if (!tournament || tournament.format?.mode !== 'groups_with_divisions') return
    
    const groups = tournament.format?.groupsWithDivisionsConfig?.groups
    if (!groups || groups.length === 0) {
      alert('Cannot fix group indexes: Groups are not defined. Please edit groups first.')
      return
    }
    
    // Create a map of team ID to group index (1-based)
    const teamToGroupMap: Record<string, number> = {}
    groups.forEach((groupTeams, groupIndex) => {
      groupTeams.forEach(teamId => {
        teamToGroupMap[teamId] = groupIndex + 1
      })
    })
    
    // Update all group matches with correct groupIndex
    const updatedMatches = tournament.matches.map(match => {
      if (match.isPlayoff) return match
      
      // Get groupIndex from home team (both teams should be in same group)
      const homeGroupIndex = teamToGroupMap[match.homeTeamId]
      const awayGroupIndex = teamToGroupMap[match.awayTeamId]
      
      // Both teams should be in the same group
      if (homeGroupIndex && awayGroupIndex && homeGroupIndex === awayGroupIndex) {
        return {
          ...match,
          groupIndex: homeGroupIndex
        }
      }
      
      // If teams are in different groups or not found, keep original match
      return match
    })
    
    updateTournament(tournament.id, { matches: updatedMatches }).then(() => {
      alert('Group indexes have been fixed! All matches now have correct groupIndex values. Refreshing page...')
      window.location.reload()
    }).catch((error) => {
      console.error('Error updating tournament:', error)
      alert('Error fixing group indexes. Please try again.')
    })
  }

  // Regenerate playoff matches for groups_with_divisions tournaments
  const handleRegeneratePlayoffs = () => {
    if (!tournament || tournament.format?.mode !== 'groups_with_divisions') return
    
    const { groupTables } = calculateTable()
    if (!groupTables || Object.keys(groupTables).length === 0) {
      alert('Cannot regenerate playoffs: Group standings are not available.')
      return
    }
    
    // Get Division 1 teams (1st and 2nd from each group)
    const division1Teams: string[] = []
    const division2Teams: string[] = []
    
    Object.keys(groupTables).forEach(groupKey => {
      const groupIndex = Number(groupKey)
      const table = (groupTables as Record<number, any[]>)[groupIndex] || []
      
      // Division 1: 1st and 2nd place
      if (table[0]) division1Teams.push(table[0].id)
      if (table[1]) division1Teams.push(table[1].id)
      
      // Division 2: 3rd and 4th place
      if (table[2]) division2Teams.push(table[2].id)
      if (table[3]) division2Teams.push(table[3].id)
    })
    
    if (division1Teams.length < 4) {
      alert('Cannot regenerate playoffs: Need at least 4 teams for Division 1 playoffs.')
      return
    }
    
    // Generate Division 1 playoff brackets
    const div1Brackets = generatePlayoffBrackets(division1Teams)
    const div1PlayoffMatches = createPlayoffMatchesFromBrackets(div1Brackets)
    
    // Calculate max group round to offset playoff rounds
    const groupMatches = tournament.matches.filter(m => !m.isPlayoff)
    const maxGroupRound = groupMatches.length > 0 
      ? Math.max(...groupMatches.map(m => m.round || 0), 0)
      : -1
    const playoffRoundOffset = maxGroupRound + 1
    
    // Adjust Division 1 matches
    const updatedDiv1Matches = div1PlayoffMatches.map(match => ({
      ...match,
      id: `div1-${match.id}-${Date.now()}`,
      round: playoffRoundOffset + (match.playoffRound || 0),
      isPlayoff: true,
      playoffRound: match.playoffRound,
      division: 1
    }))
    
    // Generate Division 2 playoff brackets if we have enough teams
    let updatedDiv2Matches: any[] = []
    if (division2Teams.length >= 4) {
      const div2Brackets = generatePlayoffBrackets(division2Teams)
      const div2PlayoffMatches = createPlayoffMatchesFromBrackets(div2Brackets)
      
      updatedDiv2Matches = div2PlayoffMatches.map(match => ({
        ...match,
        id: `div2-${match.id}-${Date.now()}`,
        round: playoffRoundOffset + (match.playoffRound || 0),
        isPlayoff: true,
        playoffRound: match.playoffRound,
        division: 2
      }))
    }
    
    // Remove old playoff matches and add new ones
    const nonPlayoffMatches = tournament.matches.filter(m => !m.isPlayoff)
    const updatedMatches = [...nonPlayoffMatches, ...updatedDiv1Matches, ...updatedDiv2Matches]
    
    updateTournament(tournament.id, { matches: updatedMatches })
    alert('Playoff matches have been regenerated! All 3 rounds (1/4 Final, 1/2 Final, Final) are now available.')
  }

  const calculateTable = () => {
    if (!tournament) return { table: [], eliminatedTeams: new Set<string>(), groupTables: {} }
    
    // Check if this is a groups_with_divisions format
    if (tournament.format?.mode === 'groups_with_divisions' && tournament.format?.groupsWithDivisionsConfig) {
      let groups = tournament.format.groupsWithDivisionsConfig.groups
      
      // If groups aren't stored, reconstruct them from matches
      if (!groups || groups.length === 0) {
        const config = tournament.format.groupsWithDivisionsConfig
        const numberOfGroups = config.numberOfGroups || 4
        const teamsPerGroup = config.teamsPerGroup || 4
        
        // Reconstruct groups from match groupIndex
        const reconstructedGroups: Record<number, Set<string>> = {}
        tournament.matches.forEach(m => {
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
        
        // If we reconstructed groups, save them once (only if they were missing).
        // Guarded so re-renders don't repeatedly rewrite the whole tournament item.
        if (
          groups.length > 0 &&
          groups.some(g => g.length > 0) &&
          !tournament.format.groupsWithDivisionsConfig.groups &&
          !persistedReconstructedGroups.has(tournament.id)
        ) {
          persistedReconstructedGroups.add(tournament.id)
          tournament.format.groupsWithDivisionsConfig.groups = groups
          // Save updated format asynchronously to avoid blocking
          setTimeout(() => {
            updateTournament(tournament.id, { format: tournament.format }).catch(console.error)
          }, 0)
        }
      }
      
      if (groups && groups.length > 0) {
        const groupTables: Record<number, any[]> = {}
      
      // Calculate standings for each group separately
      groups.forEach((groupTeams, groupIndex) => {
        const stats: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> = {}
        
        // Initialize stats for teams in this group
        groupTeams.forEach(tid => {
          stats[tid] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
        })
        
        // Count group matches (matches with this groupIndex)
        // Match by groupIndex first (most reliable), with fallback to team matching
        const groupMatches = tournament.matches.filter(m => {
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
          if (m.homeGoals == null || m.awayGoals == null) continue
          const a = stats[m.homeTeamId]
          const b = stats[m.awayTeamId]
          if (!a || !b) continue
          
          a.p++; b.p++
          a.gf += m.homeGoals; a.ga += m.awayGoals
          b.gf += m.awayGoals; b.ga += m.homeGoals
          if (m.homeGoals > m.awayGoals) { a.w++; b.l++; a.pts += 3 }
          else if (m.homeGoals < m.awayGoals) { b.w++; a.l++; b.pts += 3 }
          else { a.d++; b.d++; a.pts++; b.pts++ }
        }
        
        const table = Object.entries(stats).map(([id, s]) => ({ id, ...s }))
          .sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf)
        
        groupTables[groupIndex + 1] = table
      })
      
        return { table: [], eliminatedTeams: new Set<string>(), groupTables }
      }
      }
    
    const stats: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> = {}
    const eliminatedTeams = new Set<string>()
    
    for (const tid of tournament.teamIds) {
      stats[tid] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
    }
    
    // Count league matches for the table
    const leagueMatches = tournament.matches.filter(m => !m.isPlayoff)
    
    for (const m of leagueMatches) {
      if (m.homeGoals == null || m.awayGoals == null) continue
      const a = stats[m.homeTeamId]
      const b = stats[m.awayTeamId]
      // A fixture can name a team that is no longer in the tournament — a
      // removed club, or a BYE. Without this the whole page threw.
      if (!a || !b) continue
      a.p++; b.p++
      a.gf += m.homeGoals; a.ga += m.awayGoals
      b.gf += m.awayGoals; b.ga += m.homeGoals
      if (m.homeGoals > m.awayGoals) { a.w++; b.l++; a.pts += 3 }
      else if (m.homeGoals < m.awayGoals) { b.w++; a.l++; b.pts += 3 }
      else { a.d++; b.d++; a.pts++; b.pts++ }
    }
    
    // Also count playoff matches for points (3 win, 1 draw, 0 loss)
    const playoffMatchesList: any[] = []
    
    // Get regular playoff matches from tournament.matches
    if (tournament.matches && Array.isArray(tournament.matches)) {
      playoffMatchesList.push(...tournament.matches.filter(m => m.isPlayoff))
    }
    
    // For custom playoff format, also include matches from custom playoff configuration
    if (tournament.format?.mode === 'league_custom_playoff' && tournament.format?.customPlayoffConfig?.playoffRounds) {
      tournament.format.customPlayoffConfig.playoffRounds.forEach((round: any) => {
        if (round.matches && Array.isArray(round.matches)) {
          // Check both match-level and round-level elimination flags
          const roundIsElimination = round.isElimination || false
          round.matches.forEach((match: any) => {
            const isEliminationMatch = match.isElimination || roundIsElimination
            const processedMatch = {
              ...match,
              isPlayoff: true,
              isElimination: isEliminationMatch, // Use combined elimination flag
              playoffRound: round.roundNumber || 0,
              roundName: round.name || '',
              roundDescription: round.description || ''
            }
            playoffMatchesList.push(processedMatch)
          })
        }
      })
    }
    
    for (const m of playoffMatchesList) {
      if (!m || m.homeGoals == null || m.awayGoals == null) continue
      if (m.homeTeamId === m.awayTeamId) continue // Skip BYE matches
      
      const a = stats[m.homeTeamId]
      const b = stats[m.awayTeamId]
      
      if (!a || !b) continue
      
      // Count all playoff matches for points (3 win, 1 draw, 0 loss)
      a.p++; b.p++
      a.gf += m.homeGoals; a.ga += m.awayGoals
      b.gf += m.awayGoals; b.ga += m.homeGoals
      
      if (m.homeGoals > m.awayGoals) { 
        a.w++; b.l++; a.pts += 3
        // Check if this is an elimination match and mark loser as eliminated
        if (m.isElimination) {
          eliminatedTeams.add(m.awayTeamId)
        }
      } else if (m.homeGoals < m.awayGoals) { 
        b.w++; a.l++; b.pts += 3
        // Check if this is an elimination match and mark loser as eliminated
        if (m.isElimination) {
          eliminatedTeams.add(m.homeTeamId)
        }
      } else { 
        a.d++; b.d++; a.pts++; b.pts++ 
      }
    }
    
    // For league_custom_playoff format, also check custom playoff rounds for elimination matches (double-check)
    if (tournament.format?.mode === 'league_custom_playoff' && tournament.format?.customPlayoffConfig?.playoffRounds) {
      tournament.format.customPlayoffConfig.playoffRounds.forEach((round: any) => {
        // Check both match-level and round-level elimination flags
        const roundIsElimination = round.isElimination || false
        if (round.matches && Array.isArray(round.matches)) {
          round.matches.forEach((match: any) => {
            const matchIsElimination = match.isElimination || roundIsElimination
            if (matchIsElimination && match.homeGoals != null && match.awayGoals != null) {
              const homeTeamId = match.homeTeamId
              const awayTeamId = match.awayTeamId
              
              if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return
              
              // Mark the loser as eliminated
              if (match.homeGoals > match.awayGoals) {
                eliminatedTeams.add(awayTeamId)
              } else if (match.homeGoals < match.awayGoals) {
                eliminatedTeams.add(homeTeamId)
              }
            }
          })
        }
      })
    }
    
    const table = Object.entries(stats).map(([id, s]) => ({ id, ...s }))
      .sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf)
    
    return { table, eliminatedTeams, groupTables: {} }
  }

  const { table, eliminatedTeams, groupTables } = useMemo(() => calculateTable(), [tournament])

  // Nothing is missing until everything it depends on has arrived. Showing
  // "not found" while the tournament list is still in flight is what made a
  // refresh look like a crash.
  const stillLoading =
    loading.tournaments ||
    (!organizersSettled && !currentOrganizer) ||
    (!currentOrganizer && loading.organizers)

  // Who runs this competition. Not "who is signed in": the super admin runs
  // none of them, and every link on this page is built from the organizer's
  // name.
  const organizer = getOrganizerById(tournament?.organizerId) ?? currentOrganizer

  if (stillLoading && !tournament) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-10 w-10 mx-auto mb-4 border-4 border-white/20 border-t-blue-400" />
          <p className="opacity-70">Loading tournament...</p>
        </div>
      </div>
    )
  }

  // Redirect if no organizer is selected. The super admin selects none: the
  // competition on screen names the organizer that runs it.
  if (!currentOrganizer && !superAdmin) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">No Organizer Selected</h1>
          <p className="opacity-80 mb-6">Please select an organizer first</p>
          <Link to="/" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Go to Home
          </Link>
        </div>
      </div>
    )
  }
  
  // Show tournament not found if it doesn't exist
  if (!tournament) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Tournament Not Found</h1>
          <p className="opacity-80 mb-6">The tournament you're looking for doesn't exist or you don't have access to it.</p>
          <Link to="/tournaments" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Back to Tournaments
          </Link>
        </div>
      </div>
    )
  }

  const isProgressive =
    tournament.format?.customPlayoffConfig?.preset === PROGRESSIVE_PRESET

  const playoffSurvivors = survivorsByPlayoffRound(tournament)

  const nextRoundPlan = isProgressive
    ? planNextProgressiveRound(tournament)
    : { round: null, survivors: [] as string[], reason: undefined, resting: undefined }

  const addProgressiveRound = async () => {
    if (!nextRoundPlan.round) return
    savePlayoffRound(nextRoundPlan.round)
  }

  // Helper function to create playoff matches
  const createPlayoffMatches = (qualifiedTeams: any[], tournamentId: string) => {
    const matches = []
    const qualifiers = qualifiedTeams.length
    const rounds = Math.ceil(Math.log2(qualifiers))
    
    // Create matches based on seeding (1st vs last, 2nd vs second to last, etc.)
    for (let round = 0; round < rounds; round++) {
      const matchesInRound = Math.pow(2, rounds - round - 1)
      for (let match = 0; match < matchesInRound; match++) {
        const matchId = `playoff_${tournamentId}_${round}_${match}`
        
        if (round === 0) {
          // First round - seed teams
          const team1Index = match
          const team2Index = qualifiers - 1 - match
          
          matches.push({
            id: matchId,
            tournamentId,
            homeTeamId: qualifiedTeams[team1Index].id,
            awayTeamId: qualifiedTeams[team2Index].id,
            round: rounds + round, // Start after league rounds
            isPlayoff: true,
            playoffRound: round,
            homeGoals: undefined,
            awayGoals: undefined,
            dateISO: undefined
          })
        } else {
          // Later rounds - placeholder matches
          matches.push({
            id: matchId,
            tournamentId,
            homeTeamId: `winner_${round-1}_${match*2}`,
            awayTeamId: `winner_${round-1}_${match*2+1}`,
            round: rounds + round,
            isPlayoff: true,
            playoffRound: round,
            homeGoals: undefined,
            awayGoals: undefined,
            dateISO: undefined
          })
        }
      }
    }
    
    return matches
  }

  return (
    <div className="grid gap-6 place-items-center">
      {/*
        The tournament's header.

        It used to be a stack of centred blocks — a label above a centred input
        above another centred label — with four bordered text fields for the
        venue and the social links, each 200px wide and none of them lining up
        with anything. Everything here is now left-aligned on one baseline, and
        the fields themselves moved to the settings screen: a header is for
        reading, and a link is not something you edit twice a season.
      */}
      <section className="glass rounded-xl p-5 w-full max-w-6xl">
        <div className="flex flex-col sm:flex-row sm:items-start gap-5">
          {/* The logo is the one thing worth editing in place, so it is a plain
              click target with a label rather than a circle inside a circle. */}
          <div className="shrink-0">
            <LogoUploader
              onLogoUpload={(file) => uploadTournamentLogo(tournament.id, file)}
              currentLogo={tournament.logo}
              size={96}
              compressionType="tournament"
            />
            <p className="mt-1.5 text-[11px] opacity-50 text-center w-24">
              {tournament.logo ? 'Click to replace' : 'Click to add a logo'}
            </p>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-tight">{tournament.name}</h1>

            <p className="mt-1 text-sm opacity-70">
              {tournament.teamIds.length} teams · {tournament.matches.length} matches
            </p>

            {/* Venue and links, shown only when they exist. */}
            {(tournament.location?.name || tournament.location?.link ||
              tournament.socialMedia?.facebook || tournament.socialMedia?.instagram) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                {tournament.location?.name && (
                  <span className="flex items-center gap-1.5 opacity-80">
                    <LocationIcon size={14} />
                    {tournament.location.link ? (
                      <a
                        href={tournament.location.link}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {tournament.location.name}
                      </a>
                    ) : (
                      tournament.location.name
                    )}
                  </span>
                )}
                {tournament.socialMedia?.facebook && (
                  <a
                    href={tournament.socialMedia.facebook}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity"
                  >
                    <FacebookIcon size={14} /> Facebook
                  </a>
                )}
                {tournament.socialMedia?.instagram && (
                  <a
                    href={tournament.socialMedia.instagram}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity"
                  >
                    <InstagramIcon size={14} /> Instagram
                  </a>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <VisibilityToggle
                isPublic={tournament.visibility !== 'private'}
                onToggle={async (isPublic) => {
                  try {
                    await updateTournament(tournament.id, {
                      visibility: isPublic ? 'public' : 'private',
                    })
                  } catch (error) {
                    console.error('Failed to update tournament visibility:', error)
                    alert('Failed to update tournament visibility. Please try again.')
                  }
                }}
                size="small"
              />

              <div className="flex-1" />

              {/* A 300px read-only box holding a URL nobody reads, replaced by
                  the only thing anyone did with it. */}
              <button
                type="button"
                onClick={() => {
                  const url = organizer
                    ? `${window.location.origin}${getSeasonUrl(tournament, organizer)}`
                    : `${window.location.origin}/public/tournaments/${tournament.id}`
                  navigator.clipboard.writeText(url)
                  setLinkCopied(true)
                  setTimeout(() => setLinkCopied(false), 2000)
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition-all text-sm"
              >
                {linkCopied ? (
                  <>
                    <IconCheck size={15} /> Link copied
                  </>
                ) : (
                  <>
                    <IconLink size={15} /> Copy public link
                  </>
                )}
              </button>

              <Link
                to={publicSeasonUrl(tournament, organizer)}
                target="_blank"
                className="px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition-all text-sm"
              >
                Preview
              </Link>

              <Link
                to={`/tournaments/${tournament.id}/settings`}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition-all text-sm"
              >
                <IconGear size={15} /> Settings
              </Link>
            </div>

            {!tournament.location?.name && !tournament.socialMedia?.facebook && (
              <p className="mt-3 text-xs opacity-50">
                <Link to={`/tournaments/${tournament.id}/settings`} className="hover:opacity-100 underline">
                  Add a venue and social links
                </Link>{' '}
                — they show on the public page.
              </p>
            )}
          </div>
        </div>

              {tournament.format?.mode === 'groups_with_divisions' && (
                <details className="mt-5 pt-4 border-t border-white/10">
                  <summary className="cursor-pointer text-xs opacity-50 hover:opacity-100 transition-opacity">
                    Repair tools
                  </summary>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button
                      onClick={() => {
                        if (confirm('Fix group indexes? This will update all matches with correct groupIndex values so tables show results correctly.')) {
                          handleFixGroupIndexes()
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition-all text-xs opacity-80"
                    >
                      Fix group indexes
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Fix group round numbers? This will reorganize group matches into 3 rounds with 8 games each.')) {
                          handleFixGroupRounds()
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition-all text-xs opacity-80"
                    >
                      Fix group rounds
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Regenerate playoff matches? This will remove existing playoff matches and create new ones with all 3 rounds (1/4 Final, 1/2 Final, Final).')) {
                          handleRegeneratePlayoffs()
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition-all text-xs opacity-80"
                    >
                      Regenerate playoffs
                    </button>
                  </div>
                </details>
              )}
      </section>

      {/* Championship Table or Group Tables */}
      {tournament.format?.mode === 'groups_with_divisions' && (tournament.format?.groupsWithDivisionsConfig?.groups || tournament.format?.groupsWithDivisionsConfig) ? (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold tracking-wide">Group Tables</h2>
            <button
              onClick={() => {
                const groups = tournament.format?.groupsWithDivisionsConfig?.groups || []
                setEditingGroups(groups.map(g => [...g])) // Deep copy
                setShowEditGroups(true)
              }}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg glass hover:bg-white/10 transition-all text-sm"
            >
              <IconPencil size={15} /> Edit Groups
            </button>
          </div>
          <p className="text-sm opacity-70 mb-4 text-center">
            Top 2 teams from each group advance to Division 1 playoffs. 3rd and 4th place go to Division 2 playoffs.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(tournament.format.groupsWithDivisionsConfig.groups || []).map((_groupTeams, groupIndex) => {
              const groupTable = (groupTables as Record<number, any[]>)[groupIndex + 1] || []
              const groupLetter = String.fromCharCode(65 + groupIndex) // A, B, C, D, etc.
              return (
                <div key={groupIndex} className="glass rounded-lg p-4 border border-white/10">
                  <h3 className="text-md font-semibold mb-3 text-center">Group {groupLetter}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="py-2 pr-2 text-left">Pos</th>
                          <th className="py-2 pr-2 text-left">Team</th>
                          <th className="py-2 pr-2 text-center">P</th>
                          <th className="py-2 pr-2 text-center">W</th>
                          <th className="py-2 pr-2 text-center">D</th>
                          <th className="py-2 pr-2 text-center">L</th>
                          <th className="py-2 pr-2 text-center">GF</th>
                          <th className="py-2 pr-2 text-center">GA</th>
                          <th className="py-2 pr-2 text-center font-semibold">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupTable.map((row: any, index: number) => {
                          const isTop2 = index < 2
                          const isTop4 = index < 4
                          return (
                            <tr 
                              key={row.id} 
                              className={`border-t border-white/5 ${isTop2 ? 'bg-green-500/10' : isTop4 ? 'bg-blue-500/10' : ''}`}
                            >
                              <td className="py-2 pr-2">{index + 1}</td>
                              <td className="py-2 pr-2 flex items-center gap-2">
                                {(() => {
                                  const team = teams.find(t => t.id === row.id)
                                  if (team?.logo) {
                                    return (
                                      <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                                        <img
              loading="lazy"
              decoding="async" src={cdnUrl(team.logo)} alt={`${team.name} logo`} className="w-full h-full object-cover" />
                                      </div>
                                    )
                                  } else {
                                    return (
                                      <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ backgroundColor: team?.colors?.[0] || '#3B82F6' }} />
                                    )
                                  }
                                })()}
                                <Link 
                                  to={`/teams/${row.id}`}
                                  className="hover:opacity-80 transition-opacity text-xs"
                                >
                                  {teams.find(t => t.id === row.id)?.name ?? row.id}
                                </Link>
                                {isTop2 && (
                                  <span className="text-xs bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded-full">
                                    Div 1
                                  </span>
                                )}
                                {index === 2 || index === 3 ? (
                                  <span className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full">
                                    Div 2
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-2 pr-2 text-center">{row.p}</td>
                              <td className="py-2 pr-2 text-center">{row.w}</td>
                              <td className="py-2 pr-2 text-center">{row.d}</td>
                              <td className="py-2 pr-2 text-center">{row.l}</td>
                              <td className="py-2 pr-2 text-center">{row.gf}</td>
                              <td className="py-2 pr-2 text-center">{row.ga}</td>
                              <td className="py-2 pr-2 text-center font-semibold">{row.pts}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}
      
      {/* Group Editing Modal */}
      {showEditGroups && tournament?.format?.mode === 'groups_with_divisions' && (() => {
        // Get all teams in tournament
        const allTournamentTeams = tournament.teamIds || []
        // Get all teams currently assigned to groups
        const assignedTeamIds = new Set(editingGroups.flat())
        // Get unassigned teams
        const unassignedTeams = allTournamentTeams.filter(teamId => !assignedTeamIds.has(teamId))
        
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEditGroups(false)}>
          <div className="bg-slate-800 rounded-xl p-6 max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-slate-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Edit Groups</h2>
              <button
                onClick={() => setShowEditGroups(false)}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-all text-white"
              >
                <IconClose size={15} /> Close
              </button>
            </div>
            <p className="text-sm text-gray-300 mb-4">
              Drag teams between groups or click to move teams. Changes will regenerate group matches.
            </p>
            
            {/* Available Teams Section */}
            {unassignedTeams.length > 0 && (
              <div className="mb-4 p-4 bg-slate-900 rounded-lg border border-slate-700">
                <h3 className="font-semibold mb-2 text-white">Available Teams ({unassignedTeams.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {unassignedTeams.map((teamId) => {
                    const team = teams.find(t => t.id === teamId)
                    return (
                      <div
                        key={teamId}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-700 rounded-lg hover:bg-slate-600 cursor-pointer"
                        onClick={() => {
                          // Add to first group that has space
                          const newGroups = [...editingGroups]
                          const maxTeamsPerGroup = tournament?.format?.groupsWithDivisionsConfig?.teamsPerGroup || 4
                          for (let i = 0; i < newGroups.length; i++) {
                            if (newGroups[i].length < maxTeamsPerGroup) {
                              newGroups[i] = [...newGroups[i], teamId]
                              setEditingGroups(newGroups)
                              break
                            }
                          }
                        }}
                      >
                        {team?.logo ? (
                          <img
              loading="lazy"
              decoding="async" src={cdnUrl(team.logo)} alt={team.name} className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <span className="w-5 h-5 rounded-full inline-block" style={{ backgroundColor: team?.colors?.[0] || '#3B82F6' }} />
                        )}
                        <span className="text-sm text-white">{team?.name || teamId}</span>
                        <span className="text-xs text-gray-400">Click to add</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {editingGroups.map((groupTeams, groupIndex) => {
                const groupLetter = String.fromCharCode(65 + groupIndex) // A, B, C, D, etc.
                const maxTeamsPerGroup = tournament?.format?.groupsWithDivisionsConfig?.teamsPerGroup || 4
                const hasSpace = groupTeams.length < maxTeamsPerGroup
                
                return (
                <div key={groupIndex} className="bg-slate-900 rounded-lg p-4 border border-slate-700">
                  <h3 className="font-semibold mb-2 text-white">Group {groupLetter}</h3>
                  <div className="space-y-2 min-h-[200px] bg-slate-800 rounded p-2 border border-slate-700">
                    {groupTeams.map((teamId) => {
                      const team = teams.find(t => t.id === teamId)
                      return (
                        <div
                          key={teamId}
                          className="flex items-center gap-2 p-2 bg-slate-700 rounded hover:bg-slate-600 cursor-move"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('teamId', teamId)
                            e.dataTransfer.setData('sourceGroup', groupIndex.toString())
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault()
                            const draggedTeamId = e.dataTransfer.getData('teamId')
                            const sourceGroupIndex = parseInt(e.dataTransfer.getData('sourceGroup'))
                            
                            if (sourceGroupIndex !== groupIndex && draggedTeamId) {
                              const newGroups = [...editingGroups]
                              newGroups[sourceGroupIndex] = newGroups[sourceGroupIndex].filter(id => id !== draggedTeamId)
                              newGroups[groupIndex] = [...newGroups[groupIndex], draggedTeamId]
                              setEditingGroups(newGroups)
                            }
                          }}
                        >
                          {team?.logo ? (
                            <img
              loading="lazy"
              decoding="async" src={cdnUrl(team.logo)} alt={team.name} className="w-6 h-6 rounded-full object-cover" />
                          ) : (
                            <span className="w-6 h-6 rounded-full inline-block" style={{ backgroundColor: team?.colors?.[0] || '#3B82F6' }} />
                          )}
                          <span className="flex-1 text-white">{team?.name || teamId}</span>
                          <button
                            onClick={() => {
                              const newGroups = [...editingGroups]
                              newGroups[groupIndex] = newGroups[groupIndex].filter(id => id !== teamId)
                              setEditingGroups(newGroups)
                            }}
                            className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 rounded text-white"
                          >
                            Remove
                          </button>
                        </div>
                      )
                    })}
                    {hasSpace && (
                      <div className="p-2 text-center text-sm text-gray-400 border-2 border-dashed border-slate-600 rounded">
                        Drop teams here or click available teams above
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-gray-400">
                    {groupTeams.length} / {maxTeamsPerGroup} teams
                  </div>
                </div>
                )
              })}
            </div>
            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setShowEditGroups(false)}
                className="px-6 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 transition-all text-white"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!tournament) return
                  
                  // Regenerate matches with new groups
                  const config = tournament.format?.groupsWithDivisionsConfig
                  if (!config) return
                  
                  const result = generateGroupsWithDivisionsSchedule(tournament.teamIds, {
                    numberOfGroups: config.numberOfGroups,
                    teamsPerGroup: config.teamsPerGroup,
                    groupRounds: config.groupRounds,
                    existingGroups: editingGroups
                  })
                  
                  // Update tournament with new groups and matches
                  if (tournament.format) {
                    await updateTournament(tournament.id, {
                      matches: result.matches,
                      format: {
                        ...tournament.format,
                        groupsWithDivisionsConfig: {
                          ...config,
                          groups: result.groups
                        }
                      }
                    })
                  }
                  
                  setShowEditGroups(false)
                }}
                className="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 transition-all text-white font-semibold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
        )
      })()}
      
      {tournament.format?.mode !== 'groups_with_divisions' && (
        <section className="glass rounded-xl p-6 w-full max-w-4xl">
          <div className="text-center mb-4">
            <h2 className="text-lg font-semibold tracking-wide">Championship Table</h2>
            {(tournament.format?.mode === 'league_playoff' || tournament.format?.mode === 'swiss_elimination') && (
              <p className="text-sm opacity-70 mt-1">
                Top {tournament.format.playoffQualifiers} teams qualify for playoffs
              </p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="py-2 pr-3">Pos</th>
                  <th className="py-2 pr-3">Team</th>
                  <th className="py-2 pr-3">P</th>
                  <th className="py-2 pr-3">W</th>
                  <th className="py-2 pr-3">D</th>
                  <th className="py-2 pr-3">L</th>
                  <th className="py-2 pr-3">GF</th>
                  <th className="py-2 pr-3">GA</th>
                  <th className="py-2 pr-3">Pts</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row, index) => {
                  const isQualified = (tournament.format?.mode === 'league_playoff' || tournament.format?.mode === 'swiss_elimination') && 
                    index < (tournament.format?.playoffQualifiers || 4)
                  const isEliminated = eliminatedTeams.has(row.id)
                  
                  return (
                    <tr key={row.id} className={`border-t border-white/10 ${isQualified ? 'bg-green-500/10' : ''} ${isEliminated ? 'bg-red-500/20 opacity-70' : ''}`}>
                      <td className="py-2 pr-3">{index + 1}</td>
                                             <td className="py-2 pr-3 flex items-center gap-2">
                            {(() => {
                              const team = teams.find(t => t.id === row.id)
                              if (team?.logo) {
                                return (
                                  <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                                    <img
              loading="lazy"
              decoding="async" src={cdnUrl(team.logo)} alt={`${team.name} logo`} className="w-full h-full object-cover" />
                                  </div>
                                )
                              } else {
                                return (
                                                                  <span className="h-3 w-3 rounded-full inline-block" style={{ backgroundColor: team?.colors?.[0] || '#3B82F6' }} />
                                )
                              }
                            })()}
                            <Link 
                              to={`/teams/${row.id}`}
                              className="hover:opacity-80 transition-opacity"
                            >
                              {teams.find(t => t.id === row.id)?.name ?? row.id}
                            </Link>
                            {isQualified && (
                              <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded-full">
                                Qualified
                              </span>
                            )}
                          </td>
                    <td className="py-2 pr-3">{row.p}</td>
                    <td className="py-2 pr-3">{row.w}</td>
                    <td className="py-2 pr-3">{row.d}</td>
                    <td className="py-2 pr-3">{row.l}</td>
                    <td className="py-2 pr-3">{row.gf}</td>
                    <td className="py-2 pr-3">{row.ga}</td>
                    <td className="py-2 pr-3 font-semibold">{row.pts}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Playoff Bracket Section */}
              {(tournament.format?.mode === 'league_playoff' || tournament.format?.mode === 'swiss_elimination') && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-center tracking-wide">Playoff Bracket</h2>
            {isChampionshipFinished && playoffMatches.length === 0 && (
              <button
                onClick={handleEndChampionship}
                className="inline-flex items-center justify-center gap-1.5 px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all active:scale-95 active:shadow-inner font-medium bg-green-500/20 text-green-300 border border-green-500/30"
              >
                <IconTrophy size={16} /> End Championship & Start Playoffs
              </button>
            )}
          </div>

          {playoffMatches.length === 0 ? (
            <div className="text-center opacity-70">
              {isChampionshipFinished ? (
                <div className="space-y-3">
                  <p className="inline-flex items-center gap-1.5"><IconCheck size={15} /> Championship completed! Ready to start playoffs.</p>
                  <p className="text-sm">Top {tournament.format?.playoffQualifiers || 4} teams will qualify for playoffs.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p>⏳ Complete all championship matches to start playoffs</p>
                  <p className="text-sm">You need to add scores to all league matches first.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-6">
              {/* Playoff Rounds */}
              {Array.from({ length: playoffStructure?.rounds || 0 }, (_, roundIndex) => {
                const roundMatches = playoffMatches.filter(m => m.playoffRound === roundIndex)
                const roundName = getPlayoffRoundName(roundIndex, playoffStructure?.rounds || 0)
                
                return (
                  <div key={roundIndex} className="glass rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-4 text-center">{roundName}</h3>
                    <div className="grid gap-3">
                      {roundMatches.map((match) => {
                        const homeTeam = teams.find(t => t.id === match.homeTeamId)
                        const awayTeam = teams.find(t => t.id === match.awayTeamId)
                        
                        return (
                          <div key={match.id} className="grid md:grid-cols-5 gap-2 items-center p-3 glass rounded-lg">
                                                             <div className="md:col-span-2 flex items-center gap-2">
                                   {(() => {
                                     if (match.homeTeamId === 'BYE') {
                                       return (
                                         <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-white text-xs font-bold">
                                           B
                                         </div>
                                       )
                                     } else if (homeTeam?.logo) {
                                       return (
                                         <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                                           <img
              loading="lazy"
              decoding="async" src={cdnUrl(homeTeam.logo)} alt={`${homeTeam.name} logo`} className="w-full h-full object-cover" />
                                         </div>
                                       )
                                     } else if (homeTeam) {
                                       return (
                                         <span className="h-3 w-3 rounded-full inline-block" style={{ backgroundColor: homeTeam.colors?.[0] || '#3B82F6' }} />
                                       )
                                     }
                                     return null
                                   })()}
                                   {match.homeTeamId === 'BYE' ? (
                                     <span className="font-medium text-yellow-400">BYE</span>
                                   ) : (
                                     <Link 
                                       to={`/teams/${match.homeTeamId}`}
                                       className="hover:opacity-80 transition-opacity"
                                     >
                                       {homeTeam?.name ?? 'TBD'}
                                     </Link>
                                   )}
                                   {' vs '}
                                   {(() => {
                                     if (match.awayTeamId === 'BYE') {
                                       return (
                                         <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-white text-xs font-bold">
                                           B
                                         </div>
                                       )
                                     } else if (awayTeam?.logo) {
                                       return (
                                         <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                                           <img
              loading="lazy"
              decoding="async" src={cdnUrl(awayTeam.logo)} alt={`${awayTeam.name} logo`} className="w-full h-full object-cover" />
                                         </div>
                                       )
                                     } else if (awayTeam) {
                                       return (
                                         <span className="h-3 w-3 rounded-full inline-block" style={{ backgroundColor: awayTeam.colors?.[0] || '#3B82F6' }} />
                                       )
                                     }
                                     return null
                                   })()}
                                   {match.awayTeamId === 'BYE' ? (
                                     <span className="font-medium text-yellow-400">BYE</span>
                                   ) : (
                                     <Link 
                                       to={`/teams/${match.awayTeamId}`}
                                       className="hover:opacity-80 transition-opacity"
                                     >
                                       {awayTeam?.name ?? 'TBD'}
                                     </Link>
                                   )}
                                 </div>
                            <div className="flex gap-2 items-center">
                              <InlineInput inputMode="numeric" pattern="[0-9]*" className="w-14 px-2 py-1 rounded-md bg-transparent border border-white/20" value={match.homeGoals ?? ''} onCommit={(value) => setScore(match.id, value === '' ? NaN : Number(value), match.awayGoals ?? NaN)} />
                              <span>:</span>
                              <InlineInput inputMode="numeric" pattern="[0-9]*" className="w-14 px-2 py-1 rounded-md bg-transparent border border-white/20" value={match.awayGoals ?? ''} onCommit={(value) => setScore(match.id, match.homeGoals ?? NaN, value === '' ? NaN : Number(value))} />
                            </div>
                            <div className="flex gap-2">
                              <MatchDateTime
                          value={match.dateISO}
                          onChange={(iso) => setDate(match.id, iso ?? '')}
                          size="md"
                        />
                            </div>
                            <div>
                      <Link 
                        to={`${adminSeasonUrl(tournament, organizer)}/matches/${match.id}`}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-md glass text-sm hover:bg-white/10 transition-all"
                        title="View match statistics"
                      >
                        <IconChart size={14} /> Match details
                      </Link>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      <section className="grid gap-3 w-full max-w-6xl">
        <h2 className="text-lg font-semibold text-center tracking-wide">Fixtures</h2>
        {rounds.map((r) => (
          <div key={r.round} className="glass rounded-xl p-4">
            <div className="mb-4 flex items-center justify-center gap-3 flex-wrap">
              <span className="font-bold text-lg text-blue-400">Round {r.round + 1}</span>
              {/* What the public may read of this round yet. Hiding takes the
                  clubs, the date and the kick-off off every fixture in it that
                  has not been played; a result stays public, because the table
                  on the same page is counted from it. */}
              {roundIsAddressable(r) && (
              <button
                type="button"
                onClick={() => toggleRoundHidden(r.round)}
                className={`inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all ${
                  roundIsHidden(r.round)
                    ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                    : 'glass hover:bg-white/10'
                }`}
                title={
                  roundIsHidden(r.round)
                    ? 'The public sees TBA for this round. Press to publish it.'
                    : 'Show this round as TBA on the public page until you publish it'
                }
              >
                {roundIsHidden(r.round) ? (
                  <>
                    <IconEyeOff size={14} /> Hidden from public
                  </>
                ) : (
                  <>
                    <IconEye size={14} /> Hide round
                  </>
                )}
              </button>
              )}
              {/* With an odd number of teams one club has no opponent this week.
                  The fixture list just left them out, which read as a mistake. */}
              {(() => {
                const roundMatches = tournament.matches.filter((m) => r.matchIds.includes(m.id))
                const resting = teamsNotPlaying(tournament.teamIds || [], roundMatches)
                if (resting.length === 0) return null
                return (
                  <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-white/5 border border-white/10 opacity-80">
                    <IconRest size={13} /> {resting.map((id) => teams.find((t) => t.id === id)?.name ?? 'A team').join(', ')}{' '}
                    {resting.length === 1 ? 'rests' : 'rest'}
                  </span>
                )
              })()}
              {tournament.matches.some((m) => (m.round ?? 0) === r.round && m.dateISO) &&
                tournament.matches.some((m) => (m.round ?? 0) === r.round && !m.dateISO) && (
                  <button
                    type="button"
                    onClick={() => applyRoundDate(r.round)}
                    className="inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-md glass text-xs hover:bg-white/10 transition-all"
                    title="Give every match in this round the same date"
                  >
                    <IconCalendar size={14} /> Same date for the round
                  </button>
                )}
              {/* One pitch, one clock: the first round is the template the rest follow. */}
              {r.round === rounds[0]?.round &&
                rounds.length > 1 &&
                r.matchIds.some((id) => tournament.matches.find((m) => m.id === id)?.dateISO) && (
                  <button
                    type="button"
                    onClick={() => (timePatternOpen ? setTimePatternOpen(false) : openTimePattern())}
                    className="inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-md glass text-xs hover:bg-white/10 transition-all"
                    title="Repeat this round's kick-off times in every other round"
                  >
                    <IconRepeat size={14} /> Same times for every round
                  </button>
                )}
            </div>

            {r.round === rounds[0]?.round && timePatternOpen && (
              <div className="mb-4 p-3 rounded-lg border border-white/15 bg-white/5 grid gap-3">
                <p className="text-xs opacity-80">
                  Every round gets this round's kick-off times, fixture by fixture: the first match of
                  each round at {localTimePart(tournament.matches.find((m) => m.id === r.matchIds[0])?.dateISO, 'the first time here')}, and so on down the list.
                  Times already set in the other rounds are replaced.
                </p>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={timePatternMoveRounds}
                    onChange={(e) => setTimePatternMoveRounds(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span>Set the dates as well</span>
                </label>
                {timePatternMoveRounds && (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs opacity-70">First round</label>
                      <CustomDatePicker
                        value={timePatternStartDate}
                        onChange={(date) => setTimePatternStartDate(date)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs opacity-70">Days between rounds</label>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={timePatternIntervalDays}
                        onChange={(e) => setTimePatternIntervalDays(Math.max(0, Number(e.target.value) || 0))}
                        className="w-24 px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                      />
                    </div>
                  </div>
                )}
                {!timePatternMoveRounds && (
                  <p className="text-xs opacity-70">
                    Each round keeps its own day. A round with no date yet is left empty, since a time
                    cannot be stored without one.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={applyTimePattern}
                    disabled={timePatternMoveRounds && !timePatternStartDate}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-500/20 hover:bg-blue-500/30 disabled:opacity-40 transition-all text-blue-400 text-xs"
                  >
                    <IconCheck size={14} /> Apply to every round
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimePatternOpen(false)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md glass text-xs hover:bg-white/10 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="grid gap-3">
              {r.matchIds.map((mid) => {
                const m = tournament.matches.find((x) => x.id === mid)!
                return (
                  <div key={mid} className="grid gap-3 items-end p-3 glass rounded-lg md:grid-cols-[minmax(7rem,1fr)_auto_minmax(7rem,1fr)_auto_auto_auto]">
                    {/* Home Team Selection */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs opacity-70">Home Team</label>
                      <select
                        value={m.homeTeamId || ''}
                        onChange={(e) => {
                          const newHomeTeamId = e.target.value
                          // If away team is from different group, clear it
                          let newAwayTeamId = m.awayTeamId || ''
                          if (newHomeTeamId && newAwayTeamId && !m.isPlayoff && tournament.format?.mode === 'groups_with_divisions') {
                            const availableOpponents = getAvailableOpponents(newHomeTeamId, m)
                            if (!availableOpponents.find(t => t.id === newAwayTeamId)) {
                              newAwayTeamId = ''
                            }
                          }
                          setPlayoffTeams(mid, newHomeTeamId, newAwayTeamId)
                        }}
                        className="w-full min-w-0 px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                      >
                        <option value="">Select Team</option>
                        {tournamentTeams.map(team => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* VS */}
                    <div className="text-center">
                      <div className="text-lg font-bold opacity-50">vs</div>
                    </div>

                    {/* Away Team Selection */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs opacity-70">Away Team</label>
                      <select
                        value={m.awayTeamId || ''}
                        onChange={(e) => setPlayoffTeams(mid, m.homeTeamId || '', e.target.value)}
                        className="w-full min-w-0 px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                      >
                        <option value="">Select Team</option>
                        {getAvailableOpponents(m.homeTeamId, m).map(team => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Score */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs opacity-70">Score</label>
                      <div className="flex gap-1 items-center">
                        <InlineInput 
                          inputMode="numeric" 
                          pattern="[0-9]*" 
                          className="w-12 px-1 py-1 rounded-md bg-transparent border border-white/20 text-center text-sm" 
                          value={m.homeGoals ?? ''} 
                          onCommit={(value) => setScore(mid, value === '' ? NaN : Number(value), m.awayGoals ?? NaN)} 
                        />
                        <span className="text-sm">:</span>
                        <InlineInput 
                          inputMode="numeric" 
                          pattern="[0-9]*" 
                          className="w-12 px-1 py-1 rounded-md bg-transparent border border-white/20 text-center text-sm" 
                          value={m.awayGoals ?? ''} 
                          onCommit={(value) => setScore(mid, m.homeGoals ?? NaN, value === '' ? NaN : Number(value))} 
                        />
                      </div>
                    </div>

                    {/* Date & Time */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs opacity-70">Date & Time</label>
                      <MatchDateTime
                        value={m.dateISO}
                        onChange={(iso) => setDate(mid, iso ?? '')}
                        size="sm"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1">
                      <Link 
                        to={`${adminSeasonUrl(tournament, organizer)}/matches/${mid}`}
                        className="inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-md glass text-xs hover:bg-white/10 transition-all"
                        title="View match statistics"
                      >
                        <IconChart size={14} /> Match details
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Custom Playoff Configuration */}
        {tournament.format?.mode === 'league_custom_playoff' && (
          <div className="glass rounded-xl p-6">
            <h2 className="text-lg font-semibold text-center mb-4">
              {isProgressive ? 'Rounds' : 'Custom Playoff Configuration'}
            </h2>
            <div className="space-y-6">
              <p className="text-center text-sm opacity-80">
                {isProgressive
                  ? 'Each week the surviving teams are paired by their place in the table, and the bottom pair play to stay in. Generate the week, then adjust anything that does not match the draw.'
                  : 'Configure your playoff rounds. Set the quantity of games and mark individual matches as elimination.'}
              </p>

              {/* One week of the "one out a week" system, worked out from the
                  table instead of typed in by hand. */}
              {isProgressive && (
                <div className="rounded-lg border border-white/15 bg-white/[0.03] p-4 space-y-3">
                  {nextRoundPlan.round ? (
                    <>
                      <div className="text-sm">
                        <span className="font-medium">{nextRoundPlan.round.name}</span>
                        <span className="opacity-70">
                          {' '}— {nextRoundPlan.round.matches.length} matches,{' '}
                          {nextRoundPlan.round.matches.filter((m: any) => m.isElimination).length}{' '}
                          elimination
                          {nextRoundPlan.resting
                            ? `, ${teams.find(t => t.id === nextRoundPlan.resting)?.name ?? 'the leader'} rests`
                            : ''}
                        </span>
                      </div>
                      <ul className="text-sm opacity-80 space-y-0.5">
                        {nextRoundPlan.round.matches.map((match: any) => (
                          <li key={match.id}>
                            {teams.find(t => t.id === match.homeTeamId)?.name ?? '?'} v{' '}
                            {teams.find(t => t.id === match.awayTeamId)?.name ?? '?'}
                            {match.isElimination && (
                              <span className="ml-2 text-xs text-red-300">elimination</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={addProgressiveRound}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors text-sm"
                      >
                        <IconBolt size={15} /> Add {nextRoundPlan.round.name}
                      </button>
                    </>
                  ) : (
                    <p className="text-sm opacity-70">{nextRoundPlan.reason}</p>
                  )}
                </div>
              )}
              
              {/* Add New Round Form */}
              {!showNewRoundForm && (
                <div className="text-center">
                  <button
                    onClick={() => setShowNewRoundForm(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg glass hover:bg-white/10 transition-all"
                  >
                    <IconPlus size={15} /> Add Playoff Round
                  </button>
                </div>
              )}

              {/* New Round Configuration Form */}
              {showNewRoundForm && (
                <div className="glass rounded-lg p-4 border border-white/20">
                  <h3 className="text-md font-semibold mb-4">Configure New Playoff Round</h3>
                  <div className="grid md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Round Name</label>
                      <input
                        type="text"
                        value={newRoundConfig.name}
                        onChange={(e) => setNewRoundConfig({ ...newRoundConfig, name: e.target.value })}
                        placeholder="e.g., Semi-Finals, Final"
                        className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Quantity of Games</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={newRoundConfig.quantityOfGames}
                        onChange={(e) => setNewRoundConfig({ ...newRoundConfig, quantityOfGames: parseInt(e.target.value) || 1 })}
                        className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Description (Optional)</label>
                      <input
                        type="text"
                        value={newRoundConfig.description}
                        onChange={(e) => setNewRoundConfig({ ...newRoundConfig, description: e.target.value })}
                        placeholder="e.g., Top 4 teams advance"
                        className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={handleCompleteRound}
                      className="inline-flex items-center justify-center gap-1.5 px-6 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-400/30 transition-all text-green-400"
                    >
                      <IconCheck size={15} /> Complete
                    </button>
                    <button
                      onClick={() => setShowNewRoundForm(false)}
                      className="inline-flex items-center justify-center gap-1.5 px-6 py-2 rounded-lg bg-gray-500/20 hover:bg-gray-500/30 border border-gray-400/30 transition-all text-gray-400"
                    >
                      <IconClose size={15} /> Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Configured Rounds */}
              {tournament.format?.customPlayoffConfig?.playoffRounds?.map((round, roundIndex) => {
                // Ensure round has quantityOfGames property for backward compatibility
                const roundWithQuantity = {
                  ...round,
                  quantityOfGames: round.quantityOfGames ?? (round.matches?.length || 1),
                  matches: round.matches || []
                }
                
                // Who is not playing this week, ignoring anyone already out.
                const stillIn = playoffSurvivors[roundIndex] || []
                const resting = teamsNotPlaying(stillIn, roundWithQuantity.matches)

                return (
                <div key={roundIndex} className="p-6 glass rounded-lg border border-white/10">
                  <div className="space-y-4">
                    {resting.length > 0 && (
                      <div className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-white/5 border border-white/10 opacity-80">
                        <IconRest size={13} /> {resting.map((id) => teams.find((t) => t.id === id)?.name ?? 'A team').join(', ')}{' '}
                        {resting.length === 1 ? 'rests this round' : 'rest this round'}
                      </div>
                    )}

                    {/* Round Header */}
                    <div className="grid md:grid-cols-4 gap-4 items-end">
                      <div>
                        <label className="block text-sm font-medium mb-1">Round Name</label>
                        <InlineInput
                          type="text"
                          value={roundWithQuantity.name}
                          onCommit={(entered) => saveRound(roundIndex, round, { name: entered })}
                          className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Quantity of Games</label>
                        <InlineInput
                          type="number"
                          min="1"
                          max="20"
                          value={roundWithQuantity.quantityOfGames ?? 1}
                          onCommit={(entered) => {
                            // The fixtures themselves are added and dropped by the
                            // server, from the round it has stored: this page's copy
                            // of them may be older than a result somebody just saved.
                            saveRound(roundIndex, round, {
                              quantityOfGames: entered === '' ? 1 : Math.max(1, Math.min(20, parseInt(entered) || 1)),
                            })
                          }}
                          className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Description (Optional)</label>
                        <InlineInput
                          type="text"
                          value={roundWithQuantity.description || ''}
                          onCommit={(entered) => saveRound(roundIndex, round, { description: entered })}
                          placeholder="e.g., Semi-Finals, Final, etc."
                          className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        {/* The same choice as a league round, on the record
                            that holds these fixtures rather than on the season:
                            a hand-built round is a record of its own. */}
                        <button
                          onClick={() => saveRound(roundIndex, round, { hidden: !round.hidden })}
                          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md transition-all ${
                            round.hidden
                              ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200'
                              : 'glass hover:bg-white/10'
                          }`}
                          title={
                            round.hidden
                              ? 'The public sees TBA for this round. Press to publish it.'
                              : 'Show this round as TBA on the public page until you publish it'
                          }
                        >
                          {round.hidden ? (
                            <>
                              <IconEyeOff size={15} /> Hidden
                            </>
                          ) : (
                            <>
                              <IconEye size={15} /> Hide
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => deleteRound(roundIndex, round)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-red-500/20 hover:bg-red-500/30 transition-all text-red-400"
                        >
                          <IconTrash size={15} /> Delete Round
                        </button>
                      </div>
                    </div>

                    {/* Individual Matches */}
                    {roundWithQuantity.matches && roundWithQuantity.matches.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-md font-medium mb-3">Matches in this Round:</h4>
                        <div className="grid gap-3">
                          {roundWithQuantity.matches.map((match) => (
                            <div key={match.id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                              <div className="grid md:grid-cols-9 gap-4 items-center">
                                <div className="md:col-span-2">
                                  <label className="block text-sm font-medium mb-1">Home Team</label>
                                  <select
                                    value={match.homeTeamId || ''}
                                    onChange={(e) => {
                                      const homeTeamId = e.target.value
                                      // A club from another group cannot be the opponent, so
                                      // changing the home side clears an away side it no longer fits.
                                      let awayTeamId = match.awayTeamId || ''
                                      if (homeTeamId && awayTeamId && tournament.format?.mode === 'groups_with_divisions') {
                                        const opponents = getAvailableOpponents(homeTeamId, { isPlayoff: true })
                                        if (!opponents.find(t => t.id === awayTeamId)) awayTeamId = ''
                                      }
                                      setPlayoffTeams(match.id, homeTeamId, awayTeamId)
                                    }}
                                    className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                                  >
                                    <option value="">Select Team</option>
                                    {tournamentTeams.map(team => (
                                      <option key={team.id} value={team.id}>{team.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="md:col-span-2">
                                  <label className="block text-sm font-medium mb-1">Away Team</label>
                                  <select
                                    value={match.awayTeamId || ''}
                                    onChange={(e) => setPlayoffTeams(match.id, match.homeTeamId || '', e.target.value)}
                                    className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                                  >
                                    <option value="">Select Team</option>
                                    {getAvailableOpponents(match.homeTeamId, { isPlayoff: true }).map(team => (
                                      <option key={team.id} value={team.id}>{team.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium mb-1">Score</label>
                                  <div className="flex gap-1 items-center">
                                    <InlineInput
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      className="w-12 px-1 py-1 rounded-md bg-transparent border border-white/20 text-center text-sm"
                                      value={match.homeGoals ?? ''}
                                      onCommit={(value) => setScore(match.id, value === '' ? NaN : Number(value), match.awayGoals ?? NaN)}
                                    />
                                    <span className="text-sm">:</span>
                                    <InlineInput
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      className="w-12 px-1 py-1 rounded-md bg-transparent border border-white/20 text-center text-sm"
                                      value={match.awayGoals ?? ''}
                                      onCommit={(value) => setScore(match.id, match.homeGoals ?? NaN, value === '' ? NaN : Number(value))}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium mb-1">Date</label>
                                  <CustomDatePicker
                                    value={match.dateISO ? match.dateISO.split('T')[0] : ''}
                                    onChange={(date) =>
                                      saveMatch(match.id, {
                                        dateISO: date ? `${date}T00:00:00.000Z` : undefined,
                                      })
                                    }
                                    className="w-full"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium mb-1">Time</label>
                                  <CustomTimePicker
                                    value={match.time || ''}
                                    onChange={(time) => saveMatch(match.id, { time: time || undefined })}
                                    className="w-full"
                                  />
                                </div>
                                <div className="flex flex-col gap-2">
                                  <label className="flex items-center space-x-2">
                                    <input
                                      type="checkbox"
                                      checked={match.isElimination}
                                      onChange={(e) => saveMatch(match.id, { isElimination: e.target.checked })}
                                      className="rounded border-gray-300"
                                    />
                                    <span className="text-sm text-red-400 inline-flex items-center gap-1.5"><IconKnockout size={14} /> Elimination</span>
                                  </label>
                                </div>
                                <div className="flex flex-col gap-2">
                                  {/* The organiser's own match screen, the same one every league
                                      fixture gets. These rounds used to open the public page in a
                                      new tab, because the routes behind that screen could not find
                                      a fixture stored inside the format. */}
                                  <Link
                                    to={`${adminSeasonUrl(tournament, organizer)}/matches/${match.id}`}
                                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-blue-500/20 hover:bg-blue-500/30 transition-all text-blue-400 text-sm"
                                    title="Goals, cards, teamsheets and statistics"
                                  >
                                    <IconChart size={14} /> Match details
                                  </Link>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                )
              }) || []}

            </div>
          </div>
        )}

        {/* Playoff Matches in Fixtures - Divided by Stage */}
        {playoffMatches.length > 0 && (
          <div className="space-y-6">
            {(() => {
              // For groups_with_divisions, organize playoffs by division
              if (tournament.format?.mode === 'groups_with_divisions') {
                const div1Matches: any[] = []
                const div2Matches: any[] = []
                
                playoffMatches.forEach(m => {
                  if (m.division === 1) {
                    div1Matches.push(m)
                  } else if (m.division === 2) {
                    div2Matches.push(m)
                  }
                })
                
                // Group by round for each division
                const div1ByRound: Record<number, any[]> = {}
                const div2ByRound: Record<number, any[]> = {}
                
                div1Matches.forEach(m => {
                  const round = m.playoffRound !== undefined ? m.playoffRound : (m.round || 0)
                  if (!div1ByRound[round]) div1ByRound[round] = []
                  div1ByRound[round].push(m)
                })
                
                div2Matches.forEach(m => {
                  const round = m.playoffRound !== undefined ? m.playoffRound : (m.round || 0)
                  if (!div2ByRound[round]) div2ByRound[round] = []
                  div2ByRound[round].push(m)
                })
                
                const div1Rounds = Object.keys(div1ByRound).map(Number).sort((a, b) => a - b)
                const div2Rounds = Object.keys(div2ByRound).map(Number).sort((a, b) => a - b)
                const totalDiv1Rounds = div1Rounds.length
                const totalDiv2Rounds = div2Rounds.length
                
                return (
                  <>
                    {/* Division 1 Playoffs */}
                    {div1Rounds.length > 0 && (
                      <div className="mb-8">
                        <h3 className="text-xl font-bold mb-4 text-green-400">Division 1 Playoffs</h3>
                        {div1Rounds.map(roundIndex => {
                          const roundMatches = div1ByRound[roundIndex] || []
                          const roundName = getPlayoffRoundName(roundIndex, totalDiv1Rounds)
                          
                          return (
                            <div key={`div1-${roundIndex}`} className="mb-6">
                              <div className="glass rounded-xl p-4 border border-green-500/20">
                                <div className="font-bold text-lg mb-4 text-center text-green-400">Division 1 - {roundName}</div>
                                <div className="grid gap-3">
                                  {roundMatches.map((m) => (
                                    <div key={m.id} className="grid gap-3 items-end p-3 glass rounded-lg md:grid-cols-[minmax(7rem,1fr)_auto_minmax(7rem,1fr)_auto_auto_auto]">
                                      <div className="flex flex-col gap-1">
                                        <label className="text-xs opacity-70">Home Team</label>
                                        <select
                                          value={m.homeTeamId || ''}
                                          onChange={(e) => setPlayoffTeams(m.id, e.target.value, m.awayTeamId || '')}
                                          className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                                        >
                                          <option value="">Select Team</option>
                                          {tournamentTeams.map(team => (
                                            <option key={team.id} value={team.id}>{team.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="text-center">
                                        <div className="text-lg font-bold opacity-50">vs</div>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-xs opacity-70">Away Team</label>
                                        <select
                                          value={m.awayTeamId || ''}
                                          onChange={(e) => setPlayoffTeams(m.id, m.homeTeamId || '', e.target.value)}
                                          className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                                        >
                                          <option value="">Select Team</option>
                                          {getAvailableOpponents(m.homeTeamId, m).map(team => (
                                            <option key={team.id} value={team.id}>{team.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-xs opacity-70">Score</label>
                                        <div className="flex gap-1 items-center">
                                          <InlineInput 
                                            inputMode="numeric" 
                                            pattern="[0-9]*" 
                                            className="w-12 px-1 py-1 rounded-md bg-transparent border border-white/20 text-center text-sm" 
                                            value={m.homeGoals ?? ''} 
                                            onCommit={(value) => setScore(m.id, value === '' ? NaN : Number(value), m.awayGoals ?? NaN)} 
                                          />
                                          <span className="text-sm">:</span>
                                          <InlineInput 
                                            inputMode="numeric" 
                                            pattern="[0-9]*" 
                                            className="w-12 px-1 py-1 rounded-md bg-transparent border border-white/20 text-center text-sm" 
                                            value={m.awayGoals ?? ''} 
                                            onCommit={(value) => setScore(m.id, m.homeGoals ?? NaN, value === '' ? NaN : Number(value))} 
                                          />
                                        </div>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-xs opacity-70">Date & Time</label>
                                        <div className="flex gap-2">
                                          <MatchDateTime
                          value={m.dateISO}
                          onChange={(iso) => setDate(m.id, iso ?? '')}
                          size="sm"
                        />
                                        </div>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                                          <Link 
                                          to={`/tournaments/${tournament.id}/matches/${m.id}`}
                                          className="inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-md glass text-xs hover:bg-white/10 transition-all"
                                          title="View match statistics"
                                        >
                                          <IconChart size={14} /> Match details
                                        </Link>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    
                    {/* Division 2 Playoffs */}
                    {div2Rounds.length > 0 && (
                      <div className="mb-8">
                        <h3 className="text-xl font-bold mb-4 text-blue-400">Division 2 Playoffs</h3>
                        {div2Rounds.map(roundIndex => {
                          const roundMatches = div2ByRound[roundIndex] || []
                          const roundName = getPlayoffRoundName(roundIndex, totalDiv2Rounds)
                          
                          return (
                            <div key={`div2-${roundIndex}`} className="mb-6">
                              <div className="glass rounded-xl p-4 border border-blue-500/20">
                                <div className="font-bold text-lg mb-4 text-center text-blue-400">Division 2 - {roundName}</div>
                                <div className="grid gap-3">
                                  {roundMatches.map((m) => (
                                    <div key={m.id} className="grid gap-3 items-end p-3 glass rounded-lg md:grid-cols-[minmax(7rem,1fr)_auto_minmax(7rem,1fr)_auto_auto_auto]">
                                      <div className="flex flex-col gap-1">
                                        <label className="text-xs opacity-70">Home Team</label>
                                        <select
                                          value={m.homeTeamId || ''}
                                          onChange={(e) => setPlayoffTeams(m.id, e.target.value, m.awayTeamId || '')}
                                          className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                                        >
                                          <option value="">Select Team</option>
                                          {tournamentTeams.map(team => (
                                            <option key={team.id} value={team.id}>{team.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="text-center">
                                        <div className="text-lg font-bold opacity-50">vs</div>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-xs opacity-70">Away Team</label>
                                        <select
                                          value={m.awayTeamId || ''}
                                          onChange={(e) => setPlayoffTeams(m.id, m.homeTeamId || '', e.target.value)}
                                          className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                                        >
                                          <option value="">Select Team</option>
                                          {getAvailableOpponents(m.homeTeamId, m).map(team => (
                                            <option key={team.id} value={team.id}>{team.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-xs opacity-70">Score</label>
                                        <div className="flex gap-1 items-center">
                                          <InlineInput 
                                            inputMode="numeric" 
                                            pattern="[0-9]*" 
                                            className="w-12 px-1 py-1 rounded-md bg-transparent border border-white/20 text-center text-sm" 
                                            value={m.homeGoals ?? ''} 
                                            onCommit={(value) => setScore(m.id, value === '' ? NaN : Number(value), m.awayGoals ?? NaN)} 
                                          />
                                          <span className="text-sm">:</span>
                                          <InlineInput 
                                            inputMode="numeric" 
                                            pattern="[0-9]*" 
                                            className="w-12 px-1 py-1 rounded-md bg-transparent border border-white/20 text-center text-sm" 
                                            value={m.awayGoals ?? ''} 
                                            onCommit={(value) => setScore(m.id, m.homeGoals ?? NaN, value === '' ? NaN : Number(value))} 
                                          />
                                        </div>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <label className="text-xs opacity-70">Date & Time</label>
                                        <div className="flex gap-2">
                                          <MatchDateTime
                          value={m.dateISO}
                          onChange={(iso) => setDate(m.id, iso ?? '')}
                          size="sm"
                        />
                                        </div>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                                          <Link 
                                          to={`/tournaments/${tournament.id}/matches/${m.id}`}
                                          className="inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-md glass text-xs hover:bg-white/10 transition-all"
                                          title="View match statistics"
                                        >
                                          <IconChart size={14} /> Match details
                                        </Link>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )
              }
              
              // Regular playoff display for other formats
              return Array.from({ length: playoffStructure?.rounds || 0 }, (_, roundIndex) => {
                const roundMatches = playoffMatches.filter(m => m.playoffRound === roundIndex)
                const roundName = playoffStructure?.customRounds?.[roundIndex]?.name || 
                                 getPlayoffRoundName(roundIndex, playoffStructure?.rounds || 0)
                
                if (roundMatches.length === 0) return null
              
              return (
                <div key={roundIndex} className="glass rounded-xl p-4">
                  <div className="font-bold text-lg mb-4 text-center text-blue-400">{roundName}</div>
                  <div className="grid gap-3">
                    {roundMatches.map((m) => (
                      <div key={m.id} className="grid gap-3 items-end p-3 glass rounded-lg md:grid-cols-[minmax(7rem,1fr)_auto_minmax(7rem,1fr)_auto_auto_auto]">
                        {/* Home Team Selection */}
                        <div className="flex flex-col gap-1">
                          <label className="text-xs opacity-70">Home Team</label>
                          <select
                            value={m.homeTeamId || ''}
                            onChange={(e) => setPlayoffTeams(m.id, e.target.value, m.awayTeamId || '')}
                            className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                          >
                            <option value="">Select Team</option>
                            {teams.map(team => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* VS */}
                        <div className="text-center">
                          <div className="text-lg font-bold opacity-50">vs</div>
                        </div>

                        {/* Away Team Selection */}
                        <div className="flex flex-col gap-1">
                          <label className="text-xs opacity-70">Away Team</label>
                          <select
                            value={m.awayTeamId || ''}
                            onChange={(e) => setPlayoffTeams(m.id, m.homeTeamId || '', e.target.value)}
                            className="px-2 py-1 rounded-md bg-transparent border border-white/20 text-sm"
                          >
                            <option value="">Select Team</option>
                            {teams.map(team => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Score */}
                        <div className="flex flex-col gap-1">
                          <label className="text-xs opacity-70">Score</label>
                          <div className="flex gap-1 items-center">
                            <InlineInput 
                              inputMode="numeric" 
                              pattern="[0-9]*" 
                              className="w-12 px-1 py-1 rounded-md bg-transparent border border-white/20 text-center text-sm" 
                              value={m.homeGoals ?? ''} 
                              onCommit={(value) => setScore(m.id, value === '' ? NaN : Number(value), m.awayGoals ?? NaN)} 
                            />
                            <span className="text-sm">:</span>
                            <InlineInput 
                              inputMode="numeric" 
                              pattern="[0-9]*" 
                              className="w-12 px-1 py-1 rounded-md bg-transparent border border-white/20 text-center text-sm" 
                              value={m.awayGoals ?? ''} 
                              onCommit={(value) => setScore(m.id, m.homeGoals ?? NaN, value === '' ? NaN : Number(value))} 
                            />
                          </div>
                        </div>

                        {/* Date */}
                        <div className="flex flex-col gap-1">
                          <label className="text-xs opacity-70">Date & Time</label>
                          <div className="flex gap-2">
                            <MatchDateTime
                          value={m.dateISO}
                          onChange={(iso) => setDate(m.id, iso ?? '')}
                          size="sm"
                        />
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1">
                              <Link 
                            to={`/tournaments/${tournament.id}/matches/${m.id}`}
                            className="inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-md glass text-xs hover:bg-white/10 transition-all"
                            title="View match statistics"
                          >
                            <IconChart size={14} /> Match details
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
            })()}
          </div>
        )}
      </section>
    </div>
  )
}

// Helper function to get playoff round names
function getPlayoffRoundName(roundIndex: number, totalRounds: number): string {
  if (totalRounds === 1) return 'Final'
  if (totalRounds === 2) return roundIndex === 0 ? '1/2 Final' : 'Final'
  if (totalRounds === 3) {
    if (roundIndex === 0) return '1/4 Final'
    if (roundIndex === 1) return '1/2 Final'
    return 'Final'
  }
  if (totalRounds === 4) {
    if (roundIndex === 0) return '1/8 Final'
    if (roundIndex === 1) return '1/4 Final'
    if (roundIndex === 2) return '1/2 Final'
    return 'Final'
  }
  // For custom playoff rounds, use the configured names
  if (totalRounds > 0 && totalRounds <= 10) {
    // This will be handled by the custom round names from playoffStructure.customRounds
    return `Round ${roundIndex + 1}`
  }
  return `Round ${roundIndex + 1}`
}

