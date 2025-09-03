import { useAppStore } from "../store"
import { Link } from "react-router-dom"

export default function CalendarPage() {
  const { getCurrentOrganizer, getOrganizerTournaments, getOrganizerTeams } = useAppStore()
  
  const currentOrganizer = getCurrentOrganizer()
  const tournaments = getOrganizerTournaments()
  const teams = getOrganizerTeams()
  
  // Redirect if no organizer is selected
  if (!currentOrganizer) {
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
  
  // Collect all matches from all tournaments
  const allMatches = tournaments.flatMap(tournament => 
    tournament.matches.map(match => ({
      ...match,
      tournamentName: tournament.name,
      tournamentId: tournament.id
    }))
  )
  
  // Sort matches by date (if available) or by tournament creation date
  const sortedMatches = allMatches.sort((a, b) => {
    if (a.dateISO && b.dateISO) {
      return new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime()
    }
    return 0
  })
  
  return (
    <div className="min-h-[80vh] flex flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Match Calendar</h1>
        <p className="opacity-80">Organizer: {currentOrganizer.name}</p>
      </div>
      
      <section className="glass rounded-xl p-6 w-full max-w-4xl">
        <h2 className="text-lg font-semibold mb-4 text-center">All Matches ({sortedMatches.length})</h2>
        
        {sortedMatches.length === 0 ? (
          <p className="text-center opacity-70">No matches scheduled yet. Create tournaments to see matches here!</p>
        ) : (
          <div className="grid gap-4">
            {sortedMatches.map((match) => {
              const homeTeam = teams.find(t => t.id === match.homeTeamId)
              const awayTeam = teams.find(t => t.id === match.awayTeamId)
              
              return (
                <div key={match.id} className="glass rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm opacity-70 mb-1">{match.tournamentName}</div>
                      <div className="flex items-center gap-3">
                        <Link 
                          to={`/teams/${match.homeTeamId}`}
                          className="hover:opacity-80 transition-opacity"
                        >
                          {homeTeam?.name || 'TBD'}
                        </Link>
                        <span className="text-lg font-medium">vs</span>
                        <Link 
                          to={`/teams/${match.awayTeamId}`}
                          className="hover:opacity-80 transition-opacity"
                        >
                          {awayTeam?.name || 'TBD'}
                        </Link>
                      </div>
                      {match.dateISO && (
                        <div className="text-sm opacity-70 mt-2">
                          {new Date(match.dateISO).toLocaleDateString()} at {new Date(match.dateISO).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {match.homeGoals !== undefined && match.awayGoals !== undefined ? (
                        <div className="text-lg font-bold">
                          {match.homeGoals} - {match.awayGoals}
                        </div>
                      ) : (
                        <div className="text-sm opacity-70">No score</div>
                      )}
                      
                      <Link
                        to={`/tournaments/${match.tournamentId}/matches/${match.id}`}
                        className="px-3 py-1 rounded glass text-sm hover:bg-white/10 transition-all"
                      >
                        📊 Stats
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

