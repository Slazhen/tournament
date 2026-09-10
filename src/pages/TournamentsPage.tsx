import { useEffect } from "react"
import { Link } from "react-router-dom"
import { useAppStore } from "../store"
import { CompactVisibilityToggle } from "../components/VisibilityToggle"
import { FORMAT_OPTIONS } from "../utils/formats"
import type { Organizer, Tournament } from "../types"
import {
  adminSeasonUrl,
  groupIntoSeries,
  publicSeasonUrl,
  seasonLabel,
  seasonStatus,
} from '../utils/seasons'
import Trophy from '../components/Trophy'
import {
  IconTrophy,
  IconGear,
  IconGlobe,
} from '../components/icons'
import { cdnUrl } from '../utils/images'

type OrganizerSection = {
  key: string
  organizer: Organizer | null
  tournaments: Tournament[]
}

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
 * The list of tournaments.
 *
 * An organiser sees their own. The super admin sees every organiser's, under a
 * heading each, with the same controls on every card — before this the page
 * asked them to "select an organizer first" and there was nowhere to do it.
 *
 * Creating one moved to its own screen: this page is what an organiser opens to
 * check on a season in progress, and it used to greet them with a long empty
 * form before they could see any of it.
 */
export default function TournamentsPage() {
  const {
    getCurrentOrganizer,
    getOrganizerById,
    getOrganizerTournaments,
    updateTournament,
    loadTournaments,
    superAdmin,
    currentOrganizerId,
    organizers,
    loading,
  } = useAppStore()

  const currentOrganizer = getCurrentOrganizer()
  const tournaments = getOrganizerTournaments()

  // Nothing has fetched on the super admin's behalf: their scope is not an
  // organizer, so the load that follows choosing one never happens.
  useEffect(() => {
    if (superAdmin && !currentOrganizerId) loadTournaments()
  }, [superAdmin, currentOrganizerId, loadTournaments])

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

  // Until the organizers have arrived every tournament looks like an orphan,
  // and the page would accuse the lot of having a deleted organizer.
  const organizersKnown = organizers.length > 0 && !loading.organizers

  // One section per organizer for the super admin, one section full stop for an
  // organiser looking at their own.
  const sections: OrganizerSection[] = currentOrganizer
    ? [{ key: currentOrganizer.id, organizer: currentOrganizer, tournaments }]
    : groupByOrganizer(tournaments, getOrganizerById)

  return (
    <div className="min-h-[80vh] flex flex-col items-center gap-6">
      <div className="w-full max-w-4xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Tournaments</h1>
          <p className="opacity-80">
            {currentOrganizer ? currentOrganizer.name : 'All organizers'} — {tournaments.length}{' '}
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

      {tournaments.length === 0 ? (
        <section className="glass rounded-xl p-6 w-full max-w-4xl">
          <div className="text-center py-8">
            <p className="opacity-70 mb-4">No tournaments yet.</p>
            <Link
              to="/tournaments/new"
              className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors font-medium"
            >
              Create your first tournament
            </Link>
          </div>
        </section>
      ) : (
        sections.map((section) => (
          <section key={section.key} className="glass rounded-xl p-6 w-full max-w-4xl">
            {/* The organiser's own page has its name in the header already. */}
            {!currentOrganizer && (
              <div className="flex items-baseline justify-between gap-4 mb-5">
                <h2 className="text-xl font-semibold">
                  {section.organizer
                    ? section.organizer.name
                    : organizersKnown
                      ? 'Without an organizer'
                      : 'Loading…'}
                </h2>
                <span className="text-sm opacity-60">
                  {section.tournaments.length}{' '}
                  {section.tournaments.length === 1 ? 'tournament' : 'tournaments'}
                </span>
              </div>
            )}

            {!section.organizer && organizersKnown && (
              <p className="mb-5 text-sm text-amber-300/80">
                The organizer that ran these was deleted. They are still on the public site and
                nobody can administer them.
              </p>
            )}

            <div className="grid gap-8">
              {/* Grouped by competition: two or three leagues, each with its
                  seasons, rather than one flat list where the 2026 season looks
                  like an unrelated tournament. */}
              {groupIntoSeries(section.tournaments).map((series) => (
                <div key={series.key} className="grid gap-4">
                  <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-2">
                    <h3 className="font-semibold">
                      {series.name}
                      <span className="ml-2 text-sm opacity-60">
                        {series.seasons.length}{' '}
                        {series.seasons.length === 1 ? 'season' : 'seasons'}
                      </span>
                    </h3>
                    <Link
                      to={`/tournaments/new?season=${series.seasons[0].id}`}
                      className="px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition-all text-sm"
                    >
                      + New season
                    </Link>
                  </div>

                  {series.seasons.map((tournament) => (
                    <TournamentCard
                      key={tournament.id}
                      tournament={tournament}
                      organizer={section.organizer}
                      onVisibilityChange={async (isPublic) => {
                        try {
                          await updateTournament(tournament.id, {
                            visibility: isPublic ? 'public' : 'private',
                          })
                        } catch (error) {
                          console.error('Failed to update tournament visibility:', error)
                          alert('Failed to update tournament visibility. Please try again.')
                        }
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

/**
 * One card, whoever is looking.
 *
 * The links are built from the organizer the tournament belongs to rather than
 * from whoever is signed in, which is the whole difference between an organiser
 * and the super admin here.
 */
function TournamentCard({
  tournament,
  organizer,
  onVisibilityChange,
}: {
  tournament: Tournament
  organizer: Organizer | null
  onVisibilityChange: (isPublic: boolean) => Promise<void>
}) {
  return (
    <div className="glass rounded-lg p-4">
      <div className="flex items-center gap-4">
        {/* Tournament Logo */}
        <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-white/10 flex-shrink-0">
          {tournament.logo ? (
            <img
              loading="lazy"
              decoding="async"
              src={cdnUrl(tournament.logo)}
              alt={`${tournament.name} logo`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="opacity-40"><IconTrophy size={22} /></div>
          )}
        </div>

        {/* Tournament Info */}
        <div className="flex-1">
          <h4 className="text-lg font-semibold mb-1 flex items-center gap-2">
            {seasonLabel(tournament)}
            {seasonStatus(tournament) === 'finished' && <Trophy size={16} />}
          </h4>
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
            onToggle={onVisibilityChange}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Link
            to={adminSeasonUrl(tournament, organizer)}
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
            to={publicSeasonUrl(tournament, organizer)}
            target="_blank"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded glass hover:bg-white/10 transition-all text-center text-sm"
          >
            <IconGlobe size={15} /> Open public page
          </Link>
        </div>
      </div>
    </div>
  )
}

/**
 * Tournaments in sections, one organizer each, by name.
 *
 * A tournament whose organizer no longer exists gets a section of its own at the
 * end rather than being dropped: it is still on the public site, and hiding it
 * here is how it came to be forgotten in the first place.
 */
function groupByOrganizer(
  tournaments: Tournament[],
  getOrganizerById: (organizerId?: string) => Organizer | null,
): OrganizerSection[] {
  const sections = new Map<string, OrganizerSection>()

  for (const tournament of tournaments) {
    const organizer = getOrganizerById(tournament.organizerId)
    const key = organizer?.id ?? '__orphaned__'
    const section = sections.get(key) ?? { key, organizer, tournaments: [] }
    section.tournaments.push(tournament)
    sections.set(key, section)
  }

  return [...sections.values()].sort((a, b) => {
    if (!a.organizer) return 1
    if (!b.organizer) return -1
    return a.organizer.name.localeCompare(b.organizer.name)
  })
}
