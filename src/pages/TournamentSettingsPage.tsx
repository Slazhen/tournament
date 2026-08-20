import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppStore } from '../store'
import LogoUploader from '../components/LogoUploader'
import TeamPicker from '../components/TeamPicker'
import VisibilityToggle from '../components/VisibilityToggle'
import InlineInput from '../components/InlineInput'
import { FORMAT_OPTIONS } from '../utils/formats'
import { planTeamChange, teamEditMode } from '../utils/fixtures'
import { getAdminTournamentUrl } from '../utils/urls'

/**
 * Editing a tournament that already exists.
 *
 * Until now the only things that could be changed after creation were the logo
 * and a couple of links tucked into the page header — a typo in the name, or a
 * club dropping out in week three, meant deleting the whole season and starting
 * again. Everything editable lives here, and changing the teams shows what it
 * will do to the fixtures before anything is saved.
 */
export default function TournamentSettingsPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const {
    getCurrentOrganizer,
    getOrganizerTeams,
    getOrganizerTournaments,
    updateTournament,
    deleteTournament,
    uploadTournamentLogo,
  } = useAppStore()

  const currentOrganizer = getCurrentOrganizer()
  const teams = getOrganizerTeams()
  const tournaments = getOrganizerTournaments()
  const tournament = tournaments.find((candidate) => candidate.id === id)

  const [draftTeamIds, setDraftTeamIds] = useState<string[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const selectedTeamIds = draftTeamIds ?? tournament?.teamIds ?? []

  const plan = useMemo(
    () => (tournament ? planTeamChange(tournament, selectedTeamIds) : null),
    [tournament, selectedTeamIds],
  )

  if (!currentOrganizer || !tournament) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Tournament not found</h1>
          <Link to="/tournaments" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Back to tournaments
          </Link>
        </div>
      </div>
    )
  }

  const editMode = teamEditMode(tournament)
  const formatTitle =
    FORMAT_OPTIONS.find(
      (option) =>
        option.mode === tournament.format?.mode && option.rounds === (tournament.format?.rounds ?? 1),
    )?.title ??
    FORMAT_OPTIONS.find((option) => option.mode === tournament.format?.mode)?.title ??
    'League'

  const teamsChanged = Boolean(plan && (plan.added.length > 0 || plan.removed.length > 0))

  const saveTeams = async () => {
    if (!plan || !teamsChanged || plan.mode === 'locked') return

    if (plan.droppedWithResults.length > 0) {
      const confirmed = confirm(
        `${plan.droppedWithResults.length} match(es) with a result will be deleted along with the ` +
          `team(s) you removed. This cannot be undone.\n\nContinue?`,
      )
      if (!confirmed) return
    }

    setIsSaving(true)
    try {
      await updateTournament(tournament.id, {
        teamIds: selectedTeamIds,
        matches: plan.matches,
      })
      setDraftTeamIds(null)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center gap-6 w-full">
      <div className="w-full max-w-3xl">
        <Link
          to={getAdminTournamentUrl(tournament, currentOrganizer)}
          className="text-sm opacity-70 hover:opacity-100 transition-opacity"
        >
          ← Back to {tournament.name}
        </Link>
      </div>

      <div className="text-center">
        <h1 className="text-3xl font-bold mb-1">Tournament settings</h1>
        <p className="opacity-70 text-sm">
          {formatTitle} · {tournament.matches?.length ?? 0} matches
        </p>
      </div>

      {/* ---------- Identity ---------- */}
      <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-5">
        <h2 className="font-semibold">Name and logo</h2>

        <label className="block">
          <span className="text-sm opacity-70">Tournament name</span>
          <InlineInput
            type="text"
            value={tournament.name}
            onCommit={(value) => {
              const name = value.trim()
              if (name && name !== tournament.name) updateTournament(tournament.id, { name })
            }}
            className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
          />
          <span className="text-xs opacity-50">
            The public address of the tournament follows its name, so old links stop working after a rename.
          </span>
        </label>

        <div>
          <span className="text-sm opacity-70">Logo</span>
          <div className="mt-2">
            <LogoUploader
              onLogoUpload={(file) => uploadTournamentLogo(tournament.id, file)}
              currentLogo={tournament.logo}
              size={120}
              compressionType="tournament"
            />
          </div>
        </div>
      </section>

      {/* ---------- Visibility ---------- */}
      <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-3">
        <h2 className="font-semibold">Who can see it</h2>
        <VisibilityToggle
          isPublic={tournament.visibility !== 'private'}
          onToggle={(isPublic) =>
            updateTournament(tournament.id, { visibility: isPublic ? 'public' : 'private' })
          }
        />
      </section>

      {/* ---------- Where ---------- */}
      <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-4">
        <h2 className="font-semibold">Venue and links</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="opacity-70">Venue name</span>
            <InlineInput
              type="text"
              value={tournament.location?.name || ''}
              onCommit={(value) =>
                updateTournament(tournament.id, {
                  location: { ...tournament.location, name: value || undefined },
                })
              }
              placeholder="Homebush Futsal Centre"
              className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="opacity-70">Map link</span>
            <InlineInput
              type="url"
              value={tournament.location?.link || ''}
              onCommit={(value) =>
                updateTournament(tournament.id, {
                  location: { ...tournament.location, link: value || undefined },
                })
              }
              placeholder="https://maps.app.goo.gl/..."
              className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="opacity-70">Facebook</span>
            <InlineInput
              type="url"
              value={tournament.socialMedia?.facebook || ''}
              onCommit={(value) =>
                updateTournament(tournament.id, {
                  socialMedia: { ...tournament.socialMedia, facebook: value || undefined },
                })
              }
              placeholder="https://facebook.com/..."
              className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="opacity-70">Instagram</span>
            <InlineInput
              type="url"
              value={tournament.socialMedia?.instagram || ''}
              onCommit={(value) =>
                updateTournament(tournament.id, {
                  socialMedia: { ...tournament.socialMedia, instagram: value || undefined },
                })
              }
              placeholder="https://instagram.com/..."
              className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
            />
          </label>
        </div>
      </section>

      {/* ---------- Teams ---------- */}
      <section className="glass rounded-xl p-6 w-full max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-semibold">Teams ({selectedTeamIds.length})</h2>
          {editMode === 'regenerate' && (
            <span className="text-xs opacity-60">Nothing played yet — the draw can be redone</span>
          )}
        </div>

        {editMode === 'locked' ? (
          <p className="text-sm opacity-70">
            Results have already been entered and this format's draw is fixed once it starts. Add or
            remove teams by creating a new tournament — the fixtures here would no longer make sense.
          </p>
        ) : (
          <>
            <TeamPicker teams={teams} selectedIds={selectedTeamIds} onChange={setDraftTeamIds} />

            {teamsChanged && plan && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-sm space-y-1">
                <div className="font-medium">What this will do</div>
                {plan.added.length > 0 && <p className="opacity-80">Adding {plan.added.length} team(s).</p>}
                {plan.removed.length > 0 && (
                  <p className="opacity-80">Removing {plan.removed.length} team(s).</p>
                )}
                {plan.notes.map((note) => (
                  <p key={note} className="opacity-80">
                    {note}
                  </p>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveTeams}
                disabled={!teamsChanged || isSaving}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save teams and fixtures'}
              </button>
              {teamsChanged && (
                <button
                  type="button"
                  onClick={() => setDraftTeamIds(null)}
                  className="px-4 py-2 rounded-lg glass hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
              )}
            </div>
          </>
        )}
      </section>

      {/* ---------- Deleting ---------- */}
      <section className="rounded-xl p-6 w-full max-w-3xl border border-red-500/20 bg-red-500/[0.03] space-y-3">
        <h2 className="font-semibold text-red-300">Delete this tournament</h2>
        <p className="text-sm opacity-70">
          Removes the fixtures, the results, the table and the public page. There is no undo.
        </p>
        <button
          type="button"
          onClick={async () => {
            const typed = prompt(`Type the tournament name to delete it:\n\n${tournament.name}`)
            if (typed?.trim() !== tournament.name) return
            await deleteTournament(tournament.id)
            navigate('/tournaments')
          }}
          className="px-4 py-2 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 transition-colors text-sm"
        >
          Delete tournament
        </button>
      </section>
    </div>
  )
}
