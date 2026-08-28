import { useParams, Link } from 'react-router-dom'
import { publicPages } from '../lib/data'
import type { TeamContext } from '../lib/data'
import FacebookIcon from '../components/FacebookIcon'
import InstagramIcon from '../components/InstagramIcon'
import YoutubeIcon from '../components/YoutubeIcon'
import { useState, useEffect } from 'react'
import {
  IconTrophy,
  IconUser,
  IconGlobe,
  IconClose,
} from '../components/icons'
import PublicHeader from '../components/PublicHeader'
import MiniTable from '../components/MiniTable'
import { allMatches, isPlayed, playerRecords } from '../utils/matches'

/** "1 player", "14 players" — English, not "14 player(s)". */
function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export default function PublicTeamPage() {
  const { teamId } = useParams()
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [dataLoaded, setDataLoaded] = useState(false)
  // Exactly this team, its tournaments and the teams it has played — nothing else.
  const [context, setContext] = useState<TeamContext | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      setIsLoading(true)
      setDataLoaded(false)
      const loaded = teamId ? await publicPages.teamContext(teamId) : null
      if (cancelled) return
      setContext(loaded)
      setDataLoaded(true)
      setIsLoading(false)
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [teamId])

  if (isLoading || !dataLoaded) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p className="opacity-80">Loading team...</p>
        </div>
      </div>
    )
  }

  const teams = context?.teams || []
  const tournaments = context?.tournaments || []
  const team = context?.team
  
  // Show team not found if it doesn't exist
  if (!team) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Team Not Found</h1>
          <p className="opacity-80 mb-6">The team you're looking for doesn't exist.</p>
          <Link to="/" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Go to Home
          </Link>
        </div>
      </div>
    )
  }

  // Find tournaments where this team participates
  const teamTournaments = tournaments.filter(t => 
    t.teamIds.includes(teamId!)
  )

  // What each of this club's players has done, across every competition the
  // club plays in. Appearances come from the lineups, goals and assists from
  // the goal events — see utils/matches.
  const records = playerRecords(teamTournaments.flatMap((tournament) => allMatches(tournament)))

  // The context carries every club those competitions mention, which is what a
  // table needs to name the rows above and below this one.
  const teamNames: Record<string, string> = Object.fromEntries(
    [...teams, team].map((one) => [one.id, one.name]),
  )

  // Create dynamic gradient based on team colors
  const getTeamGradient = () => {
    if (team.colors && team.colors.length > 0) {
      if (team.colors.length === 1) {
        return `linear-gradient(135deg, ${team.colors[0]} 0%, ${team.colors[0]}CC 50%, ${team.colors[0]}99 100%)`
      } else {
        return `linear-gradient(135deg, ${team.colors[0]} 0%, ${team.colors[1]} 50%, ${team.colors[0]}CC 100%)`
      }
    }
    return 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 50%, #1E3A8A 100%)'
  }

  return (
    <div className="grid gap-6 place-items-center">
      <div className="w-full">
        <PublicHeader />
      </div>

      {/* Dynamic Team Header */}
      <section className="relative w-full max-w-6xl rounded-xl overflow-hidden">
        {/* Background with team colors */}
        <div 
          className="absolute inset-0"
          style={{ 
            background: getTeamGradient(),
            filter: 'brightness(0.8)'
          }}
        />
        
        {/* Overlay for better text readability */}
        <div className="absolute inset-0 bg-black/20" />
        
        {/* Content.
            What stood here was a row of four labelled tiles: Players, Founded,
            Colors, Established. Two of them were the same question answered
            twice — the year the record was made and the year the club says it
            was founded — and the colours are already the background of this
            header, so printing them again as captioned dots said nothing. The
            name carries the header now; the colours run along the bottom edge
            the way a kit stripe does. */}
        <div className="relative p-8 flex items-center gap-6 sm:gap-8">
          <div className="w-28 h-28 sm:w-32 sm:h-32 shrink-0 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-2xl">
            {team.logo ? (
              <img
                decoding="async"
                src={team.logo}
                alt={`${team.name} logo`}
                className="w-full h-full object-cover rounded-2xl"
              />
            ) : (
              <div className="opacity-80"><IconTrophy size={38} /></div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-3xl sm:text-5xl font-bold text-white drop-shadow-lg leading-tight">
              {team.name}
            </h1>
            <p className="mt-2 text-sm text-white/80">
              {countOf(team.players?.length ?? 0, 'player')}
              {teamTournaments.length > 0 &&
                ` · ${countOf(teamTournaments.length, 'competition')}`}
            </p>
          </div>
        </div>

        {/* The club's colours, as a stripe rather than a caption. */}
        <div className="relative flex h-2">
          {(team.colors?.length ? team.colors : ['#3B82F6']).map((color, index) => (
            <span key={index} className="flex-1" style={{ backgroundColor: color }} />
          ))}
        </div>
      </section>

      {/* The team photograph, at a size worth looking at.
          It used to be a 200x150 stamp in the corner of the header, beside a
          name set in 4xl — a photograph of eleven people printed smaller than
          the crest above it. Clicking still opens it full screen. */}
      {team.photo && (
        <section className="w-full max-w-6xl">
          <button
            type="button"
            onClick={() => setShowPhotoModal(true)}
            title="Open the photo"
            className="block w-full rounded-2xl overflow-hidden border border-white/10 hover:border-white/25 transition-colors"
          >
            <img
              decoding="async"
              src={team.photo}
              alt={`${team.name} team photo`}
              className="w-full max-h-[540px] object-cover"
            />
          </button>
        </section>
      )}

      {/* Social Media Links - Only show if not empty */}
      {(team.socialMedia?.facebook || team.socialMedia?.instagram || team.socialMedia?.youtube) && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <div className="flex items-center justify-center gap-6 text-sm">
            {team.socialMedia?.facebook && (
              <a 
                href={team.socialMedia.facebook} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity px-4 py-2 glass rounded-lg"
              >
                <FacebookIcon size={16} />
                <span>Facebook</span>
              </a>
            )}
            {team.socialMedia?.instagram && (
              <a 
                href={team.socialMedia.instagram} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity px-4 py-2 glass rounded-lg"
              >
                <InstagramIcon size={16} />
                <span>Instagram</span>
              </a>
            )}
            {team.socialMedia?.youtube && (
              <a
                href={team.socialMedia.youtube}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity px-4 py-2 glass rounded-lg"
              >
                <YoutubeIcon size={16} />
                <span>YouTube</span>
              </a>
            )}
          </div>
        </section>
      )}

      {/* Where the club stands in each competition it is in. The page showed
          every result and never once said what they added up to. */}
      {teamTournaments.length > 0 && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <h2 className="text-xl font-semibold mb-4 text-center">In the table</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {teamTournaments.map((tournament) => (
              <MiniTable
                key={tournament.id}
                tournament={tournament}
                teamId={team.id}
                teamNames={teamNames}
                to={`/public/tournaments/${tournament.id}`}
              />
            ))}
          </div>
        </section>
      )}

      {/* Players Section - Only show if players exist */}
      {team.players && team.players.length > 0 && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <h2 className="text-xl font-semibold mb-1 text-center">Players ({team.players.length})</h2>
          <p className="text-xs opacity-60 text-center mb-4">
            Appearances come from the lineup recorded for each match; goals and assists
            from the goals recorded in it.
          </p>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-3 px-4 text-left">Player</th>
                  <th className="py-3 px-4 text-left">Position</th>
                  <th className="py-3 px-4 text-left">Number</th>
                  <th className="py-3 px-4 text-left">Age</th>
                  <th className="py-3 px-4 text-center">Played</th>
                  <th className="py-3 px-4 text-center">Goals</th>
                  <th className="py-3 px-4 text-center">Assists</th>
                </tr>
              </thead>
              <tbody>
                {team.players.map((player) => {
                  const record = records.get(player.id)
                  return (
                  <tr key={player.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                          {player.photo ? (
                            <img
              loading="lazy"
              decoding="async"
                              src={player.photo}
                                                             alt={`${player.firstName} ${player.lastName} photo`}
                              className="w-full h-full object-cover rounded-full"
                            />
                          ) : (
                            <div className="opacity-40"><IconUser size={16} /></div>
                          )}
                        </div>
                        <div>
                          <Link
                            to={`/public/players/${player.id}`}
                            className="font-medium hover:opacity-80 transition-opacity"
                          >
                            {`${player.firstName} ${player.lastName}`}
                          </Link>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm">{player.position || '—'}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm">{player.number || '—'}</span>
                    </td>
                    {/* The API sends an age, never a date of birth, and sends
                        nothing at all for a club that has turned ages off. */}
                    <td className="py-3 px-4">
                      <span className="text-sm">{player.age ?? '—'}</span>
                    </td>
                    <td className="py-3 px-4 text-center text-sm">{record?.played ?? 0}</td>
                    <td className="py-3 px-4 text-center text-sm font-semibold">
                      {record?.goals ?? 0}
                    </td>
                    <td className="py-3 px-4 text-center text-sm">{record?.assists ?? 0}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}



      {/* All Games Section */}
      <section className="glass rounded-xl p-6 w-full max-w-6xl">
        <h2 className="text-xl font-semibold mb-4 text-center">All Games</h2>
        
        {/* Team Performance Summary */}
        {(() => {
          let totalGames = 0
          let wins = 0
          let draws = 0
          let losses = 0
          let goalsFor = 0
          let goalsAgainst = 0
          
          teamTournaments.forEach(tournament => {
            const teamMatches = allMatches(tournament).filter(m => 
              m.homeTeamId === team.id || m.awayTeamId === team.id
            )
            
            teamMatches.forEach(match => {
              if (isPlayed(match)) {
                totalGames++
                const isHome = match.homeTeamId === team.id
                // isPlayed has already established both are numbers.
                const teamGoals = (isHome ? match.homeGoals : match.awayGoals) as number
                const opponentGoals = (isHome ? match.awayGoals : match.homeGoals) as number

                goalsFor += teamGoals
                goalsAgainst += opponentGoals

                if (teamGoals > opponentGoals) wins++
                else if (teamGoals < opponentGoals) losses++
                else draws++
              }
            })
          })
          
          if (totalGames > 0) {
            return (
              <div className="mb-6 p-4 glass rounded-lg">
                <h3 className="font-medium mb-3 text-center">Season Summary</h3>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center text-sm">
                  <div>
                    <div className="font-semibold">{totalGames}</div>
                    <div className="opacity-70">Games</div>
                  </div>
                  <div>
                    <div className="font-semibold text-green-400">{wins}</div>
                    <div className="opacity-70">Wins</div>
                  </div>
                  <div>
                    <div className="font-semibold text-yellow-400">{draws}</div>
                    <div className="opacity-70">Draws</div>
                  </div>
                  <div>
                    <div className="font-semibold text-red-400">{losses}</div>
                    <div className="opacity-70">Losses</div>
                  </div>
                  <div>
                    <div className="font-semibold">{goalsFor}</div>
                    <div className="opacity-70">GF</div>
                  </div>
                  <div>
                    <div className="font-semibold">{goalsAgainst}</div>
                    <div className="opacity-70">GA</div>
                  </div>
                </div>
              </div>
            )
          }
          return null
        })()}
        
        {teamTournaments.length === 0 ? (
          <p className="text-center opacity-70">This team is not participating in any tournaments yet.</p>
        ) : (
          <div className="grid gap-4">
            {teamTournaments.map((tournament) => {
              // Get all matches for this team in this tournament
              const teamMatches = allMatches(tournament).filter(m => 
                m.homeTeamId === team.id || m.awayTeamId === team.id
              )
              
              if (teamMatches.length === 0) return null
              
              return (
                <div key={tournament.id} className="glass rounded-lg p-4">
                  <h3 className="font-medium mb-3 text-center">{tournament.name}</h3>
                  <div className="grid gap-2">
                    {/* Games Table Header */}
                    <div className="grid grid-cols-4 gap-2 items-center p-2 glass rounded text-sm font-medium opacity-70">
                      <div className="col-span-2 text-center">Match</div>
                      <div className="text-center">Score</div>
                      <div className="text-center">Date</div>
                    </div>
                    {teamMatches.map((match) => {
                      const isHome = match.homeTeamId === team.id
                      const opponentId = isHome ? match.awayTeamId : match.homeTeamId
                      const opponent = teams.find(t => t.id === opponentId)
                      const opponentName = opponent?.name || 'Unknown Team'
                      
                      return (
                        <div key={match.id} className={`grid grid-cols-4 gap-2 items-center p-2 glass rounded text-sm ${
                          isPlayed(match) 
                            ? (() => {
                                const isHome = match.homeTeamId === team.id
                                const teamGoals = isHome ? match.homeGoals : match.awayGoals
                                const opponentGoals = isHome ? match.awayGoals : match.homeGoals
                                if (typeof teamGoals === 'number' && typeof opponentGoals === 'number') {
                                  if (teamGoals > opponentGoals) return 'border-l-4 border-l-green-500'
                                  if (teamGoals < opponentGoals) return 'border-l-4 border-l-red-500'
                                  return 'border-l-4 border-l-yellow-500'
                                }
                                return 'border-l-4 border-l-gray-500'
                              })()
                            : ''
                        }`}>
                          <div className="col-span-2 flex items-center gap-2">
                            <span className={isHome ? "font-semibold" : ""}>
                              {isHome ? team.name : opponentName}
                            </span>
                            <span>vs</span>
                            <span className={!isHome ? "font-semibold" : ""}>
                              {!isHome ? team.name : opponentName}
                            </span>
                          </div>
                          
                          <div className="text-center">
                            {isPlayed(match) ? (
                              <span className="font-semibold">
                                {match.homeGoals} : {match.awayGoals}
                              </span>
                            ) : (
                              <span className="opacity-70">TBD</span>
                            )}
                          </div>
                          
                          <div className="text-center">
                            {match.dateISO ? (
                              <span className="text-sm">{new Date(match.dateISO).toLocaleDateString()}</span>
                            ) : (
                              <span className="text-xs opacity-50">Scheduled</span>
                            )}
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

      {/* Tournaments Section - Only show if team participates in tournaments */}
      {teamTournaments.length > 0 && (
        <section className="glass rounded-xl p-6 w-full max-w-6xl">
          <h2 className="text-xl font-semibold mb-4 text-center">Tournaments</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-3 px-4 text-left">Tournament</th>
                  <th className="py-3 px-4 text-center">Teams</th>
                  <th className="py-3 px-4 text-center">Matches</th>
                  <th className="py-3 px-4 text-center">Format</th>
                  <th className="py-3 px-4 text-center">Position</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {teamTournaments.map((tournament) => (
                  <tr key={tournament.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                          {tournament.logo ? (
                            <img
              loading="lazy"
              decoding="async" 
                              src={tournament.logo} 
                              alt={`${tournament.name} logo`} 
                              className="w-full h-full object-cover" 
                            />
                          ) : (
                            <div className="opacity-40"><IconTrophy size={18} /></div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium">{tournament.name}</div>
                          <div className="text-xs opacity-70">
                            {(() => {
                              // Calculate team position in tournament
                              const teamMatches = allMatches(tournament).filter(m => 
                                m.homeTeamId === team.id || m.awayTeamId === team.id
                              )
                              const completedMatches = teamMatches.filter(m => 
                                isPlayed(m)
                              )
                              if (completedMatches.length === 0) return 'No games played'
                              
                              // Calculate points
                              let points = 0
                              completedMatches.forEach(match => {
                                const isHome = match.homeTeamId === team.id
                                const teamGoals = isHome ? match.homeGoals : match.awayGoals
                                const opponentGoals = isHome ? match.awayGoals : match.homeGoals
                                if (typeof teamGoals === 'number' && typeof opponentGoals === 'number') {
                                  if (teamGoals > opponentGoals) points += 3
                                  else if (teamGoals === opponentGoals) points += 1
                                }
                              })
                              
                              return `${points} pts`
                            })()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-semibold">{tournament.teamIds.length}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-semibold">{allMatches(tournament).length}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-sm">
                        {tournament.format?.mode === 'league_playoff' ? 'League + Playoffs' : 'League Only'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {(() => {
                        // Calculate team position in tournament
                        const teamMatches = allMatches(tournament).filter(m => 
                          m.homeTeamId === team.id || m.awayTeamId === team.id
                        )
                        const completedMatches = teamMatches.filter(m => 
                          isPlayed(m)
                        )
                        if (completedMatches.length === 0) return <span className="text-sm opacity-70">No games</span>
                        
                        // Calculate points
                        let points = 0
                        completedMatches.forEach(match => {
                          const isHome = match.homeTeamId === team.id
                          const teamGoals = isHome ? match.homeGoals : match.awayGoals
                          const opponentGoals = isHome ? match.awayGoals : match.homeGoals
                          if (typeof teamGoals === 'number' && typeof opponentGoals === 'number') {
                            if (teamGoals > opponentGoals) points += 3
                            else if (teamGoals === opponentGoals) points += 1
                          }
                        })
                        
                        return <span className="font-semibold text-green-400">{points} pts</span>
                      })()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Link
                        to={`/public/tournaments/${tournament.id}`}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded glass hover:bg-white/10 transition-all text-center"
                      >
                        <IconGlobe size={14} /> View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Photo Modal */}
      {showPhotoModal && team.photo && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPhotoModal(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              loading="lazy"
              decoding="async"
              src={team.photo}
              alt={`${team.name} photo`}
              className="w-full h-auto max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setShowPhotoModal(false)}
              className="absolute top-4 right-4 w-10 h-10 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-xl transition-all"
            >
              <IconClose size={18} />
            </button>
            <div className="absolute bottom-4 left-4 text-white text-sm opacity-80">
              Click anywhere to close
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
