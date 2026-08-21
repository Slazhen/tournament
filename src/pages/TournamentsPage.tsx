import { Link } from "react-router-dom"
import { useAppStore } from "../store"
import { getAdminTournamentUrl, getPublicTournamentUrl } from "../utils/urls"
import { CompactVisibilityToggle } from "../components/VisibilityToggle"
import { FORMAT_OPTIONS } from "../utils/formats"
import type { Tournament } from "../types"
import {
  IconTrophy,
  IconGear,
  IconGlobe,
} from '../components/icons'

/** The tournament's format in the same words the create screen used. */
function describeFormat(tournament: Tournament): string {
  const mode = tournament.format?.mode ?? 'league'
  const rounds = tournament.format?.rounds ?? 1
  const match =
    FORMAT_OPTIONS.find((option) => option.mode === mode && option.rounds === rounds) ??
    FORMAT_OPTIONS.find((option) => option.mode === mode)
  return match?.title ?? 'League'
}

/**
 * The list of an organiser's tournaments.
 *
 * Creating one moved to its own screen: this page is what an organiser opens to
 * check on a season in progress, and it used to greet them with a long empty
 * form before they could see any of it.
 */
export default function TournamentsPage() {
  const { getCurrentOrganizer, getOrganizerTournaments, updateTournament } = useAppStore()

  const currentOrganizer = getCurrentOrganizer()
  const tournaments = getOrganizerTournaments()

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

  return (
    <div className="min-h-[80vh] flex flex-col items-center gap-6">
      <div className="w-full max-w-4xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Tournaments</h1>
          <p className="opacity-80">
            {currentOrganizer.name} — {tournaments.length}{' '}
            {tournaments.length === 1 ? 'tournament' : 'tournaments'}
          </p>
        </div>
        <Link
          to="/tournaments/new"
          className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors font-medium"
        >
          + New tournament
        </Link>
      </div>

      {/* Tournaments List */}
      <section className="glass rounded-xl p-6 w-full max-w-4xl">
        {tournaments.length === 0 ? (
          <div className="text-center py-8">
            <p className="opacity-70 mb-4">No tournaments yet.</p>
            <Link
              to="/tournaments/new"
              className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors font-medium"
            >
              Create your first tournament
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {tournaments.map((tournament) => (
              <div key={tournament.id} className="glass rounded-lg p-4">
                <div className="flex items-center gap-4">
                  {/* Tournament Logo */}
                  <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-white/10 flex-shrink-0">
                    {tournament.logo ? (
                      <img
              loading="lazy"
              decoding="async" 
                        src={tournament.logo} 
                        alt={`${tournament.name} logo`} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="opacity-40"><IconTrophy size={22} /></div>
                    )}
                  </div>
                  
                  {/* Tournament Info */}
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-1">{tournament.name}</h3>
                    <div className="text-sm opacity-70 space-y-1">
                      <div>Teams: {tournament.teamIds.length}</div>
                      <div>Format: {describeFormat(tournament)}</div>
                      {tournament.format?.mode === 'league_playoff' && (
                        <div>Playoff Qualifiers: {tournament.format.playoffQualifiers}</div>
                      )}
                      <div>Created: {new Date(tournament.createdAtISO).toLocaleDateString()}</div>
                    </div>
                  </div>

                  {/* Current visibility — click to switch it */}
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide opacity-50">Visibility</span>
                    <CompactVisibilityToggle
                      isPublic={tournament.visibility !== 'private'}
                      onToggle={async (isPublic) => {
                        try {
                          await updateTournament(tournament.id, { 
                            visibility: isPublic ? 'public' : 'private' 
                          })
                        } catch (error) {
                          console.error('Failed to update tournament visibility:', error)
                          alert('Failed to update tournament visibility. Please try again.')
                        }
                      }}
                    />
                  </div>
                  
                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <Link
                      to={currentOrganizer ? getAdminTournamentUrl(tournament, currentOrganizer) : `/tournaments/${tournament.id}`}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded glass hover:bg-white/10 transition-all text-center"
                    >
                      <IconTrophy size={15} /> View
                    </Link>
                    <Link
                      to={`/tournaments/${tournament.id}/settings`}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded glass hover:bg-white/10 transition-all text-center text-sm"
                    >
                      <IconGear size={15} /> Settings
                    </Link>
                    <Link
                      to={currentOrganizer ? getPublicTournamentUrl(tournament, currentOrganizer) : `/public/tournaments/${tournament.id}`}
                      target="_blank"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded glass hover:bg-white/10 transition-all text-center text-sm"
                    >
                      <IconGlobe size={15} /> Open public page
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
