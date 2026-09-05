import { useEffect, useState } from "react"
import { useAppStore } from "../store"
import { Link } from "react-router-dom"
import LogoUploader from "../components/LogoUploader"
import { canEditClub, checkTeamName, parseBulkNames } from "../utils/teams"
import { useAuth } from "../contexts/AuthContext"
import { clubService, type DirectoryClub } from "../lib/data"
import { headerColor } from "../utils/crest"

/**
 * The clubs.
 *
 * Deliberately one list rather than a section per organiser, even for the super
 * admin: a club plays in several competitions or in none at all, and which
 * organiser happens to own its record is the least interesting thing about it.
 * The owner is a line on the card and the thing you filter by, not the shape of
 * the page.
 */
export default function TeamsPage() {
  const [teamName, setTeamName] = useState("")
  const [teamColors, setTeamColors] = useState<string[]>(["#3B82F6"])
  const [teamLogoFile, setTeamLogoFile] = useState<File | null>(null)
  const [teamLogoPreview, setTeamLogoPreview] = useState("")
  const [bulkTeams, setBulkTeams] = useState("")
  // Adding several teams at once was the quickest way to set up a season and it
  // sat below the single-team form looking like an afterthought.
  //
  // The pool sits beside them because it answers the same question — which
  // clubs are in this league — with a club that already exists, a crest, a
  // squad and somebody who runs it. Typing the name of a club that is already
  // in the system creates a second one, and the two then split their history.
  const [addMode, setAddMode] = useState<'pool' | 'one' | 'many'>('one')
  // Creating a team used to happen in silence — no confirmation, and the new
  // card landed somewhere in a grid of thirty.
  const [result, setResult] = useState<string>("")
  // With thirty-odd teams in an unordered grid, finding one meant scrolling.
  const [teamSearch, setTeamSearch] = useState("")
  
  const {
    getCurrentOrganizer,
    getOrganizerById,
    getOrganizerTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    uploadTeamLogo,
    uploadTeamPhoto,
    loadTeams,
    organizers,
    superAdmin,
    currentOrganizerId,
  } = useAppStore()

  const { user } = useAuth()

  const currentOrganizer = getCurrentOrganizer()
  const teams = getOrganizerTeams()

  /** Which organizer a new club belongs to. Only the super admin gets a choice. */
  const [newTeamOrganizerId, setNewTeamOrganizerId] = useState("")
  const ownerId = currentOrganizerId ?? newTeamOrganizerId

  // Nothing has fetched on the super admin's behalf: their scope is not an
  // organizer, so the load that follows choosing one never happens.
  useEffect(() => {
    if (superAdmin && !currentOrganizerId) loadTeams()
  }, [superAdmin, currentOrganizerId, loadTeams])

  // Redirect if no organizer is selected
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
  
  // Two clubs of the same name are a problem inside one organizer's
  // competitions; the same name under two different organizers is two different
  // clubs, so the check looks at the owner's list rather than at everything.
  const ownerTeams = ownerId ? teams.filter((team) => team.organizerId === ownerId) : []
  const nameCheck = checkTeamName(teamName, ownerTeams)
  const bulkPlan = parseBulkNames(bulkTeams, ownerTeams)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = teamName.trim()
    if (!name || nameCheck.duplicate || !ownerId) return

    const created = await createTeam(name, teamColors, undefined, ownerId)

    if (created && teamLogoFile) {
      await uploadTeamLogo(created.id, teamLogoFile)
    }

    setResult(`${name} added.`)
    setTeamName("")
    setTeamColors(["#3B82F6"])
    setTeamLogoFile(null)
    setTeamLogoPreview("")
  }

  const handleBulkAdd = async () => {
    if (bulkPlan.toCreate.length === 0 || !ownerId) return

    for (const name of bulkPlan.toCreate) {
      const randomColor = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`
      await createTeam(name, [randomColor], undefined, ownerId)
    }

    const skipped = bulkPlan.duplicates.length + bulkPlan.repeated.length
    setResult(
      `${bulkPlan.toCreate.length} ${bulkPlan.toCreate.length === 1 ? 'team' : 'teams'} added` +
        (skipped > 0 ? `, ${skipped} skipped as already on the list.` : '.')
    )
    setBulkTeams("")
  }
  
  const handlePhotoUpload = async (teamId: string, file: File) => {
    try {
      await uploadTeamPhoto(teamId, file)
    } catch (error) {
      console.error('Error uploading team photo:', error)
    }
  }
  
  const handleColorChange = (teamId: string, color: string) => {
    updateTeam(teamId, { colors: [color] })
  }

  /** Takes a club off this organiser's list. It stays in the pool for everyone else. */
  const removeFromPool = async (teamId: string) => {
    await clubService.removeFromPool(teamId)
    await loadTeams()
  }
  
  // Removed unused functions and refs to fix TypeScript errors

  // Alphabetical order and a search box: the list used to come back in whatever
  // order the database returned it, with new teams landing in the middle.
  // The organiser's name is searchable too: with every club on one page it is
  // the quickest way to narrow it to one league's.
  const search = teamSearch.trim().toLowerCase()
  const visibleTeams = [...teams]
    .filter((team) => {
      if (!search) return true
      const owner = getOrganizerById(team.organizerId)?.name ?? ''
      return (
        team.name.toLowerCase().includes(search) || owner.toLowerCase().includes(search)
      )
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="min-h-[80vh] flex flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Manage Teams</h1>
        <p className="opacity-80">
          {currentOrganizer ? 'Create and manage your teams' : 'Every club, whoever runs it'}
        </p>
      </div>

      {/* Adding teams. One card, two ways in — pasting a list is how a season
          actually gets set up, so it is a tab rather than a separate box below. */}
      <div className="glass rounded-xl p-6 w-full max-w-md">
        <div className="flex flex-wrap items-center gap-1 mb-5 p-1 rounded-lg bg-white/5 w-fit">
          <button
            type="button"
            onClick={() => setAddMode('pool')}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              addMode === 'pool' ? 'bg-white/15 font-medium' : 'opacity-60 hover:opacity-100'
            }`}
          >
            From the pool
          </button>
          <button
            type="button"
            onClick={() => setAddMode('one')}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              addMode === 'one' ? 'bg-white/15 font-medium' : 'opacity-60 hover:opacity-100'
            }`}
          >
            One team
          </button>
          <button
            type="button"
            onClick={() => setAddMode('many')}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              addMode === 'many' ? 'bg-white/15 font-medium' : 'opacity-60 hover:opacity-100'
            }`}
          >
            Several at once
          </button>
        </div>

        {/* A club is owned by an organizer, and the super admin is not one, so
            they have to say which. An organiser never sees this, and neither
            does anybody taking a club off the pool: that club has an owner. */}
        {!currentOrganizer && addMode !== 'pool' && (
          <div className="mb-5">
            <label className="block text-sm font-medium mb-2">Organizer</label>
            <select
              value={newTeamOrganizerId}
              onChange={(e) => setNewTeamOrganizerId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 focus:border-white/40 focus:outline-none"
            >
              <option value="">Choose an organizer…</option>
              {[...organizers]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((organizer) => (
                  <option key={organizer.id} value={organizer.id}>
                    {organizer.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        {addMode === 'pool' ? (
          <ClubPool mine={new Set(teams.map((team) => team.id))} onAdded={loadTeams} />
        ) : addMode === 'one' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Team name</label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 focus:border-white/40 focus:outline-none"
                placeholder="FC Volna"
                required
              />

              {/* Two clubs with the same name split their fixtures and results
                  between them, and nothing used to stop it happening. */}
              {nameCheck.duplicate && (
                <p className="mt-2 text-sm text-red-300">
                  “{nameCheck.duplicate.name}” already exists.
                </p>
              )}
              {!nameCheck.duplicate && nameCheck.similar.length > 0 && (
                <p className="mt-2 text-sm text-amber-300/90">
                  Similar to {nameCheck.similar.map((team) => team.name).join(', ')} — same club?
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Team colours</label>
              <div className="flex gap-2">
                {teamColors.map((color, index) => (
                  <input
                    key={index}
                    type="color"
                    value={color}
                    onChange={(e) => {
                      const newColors = [...teamColors]
                      newColors[index] = e.target.value
                      setTeamColors(newColors)
                    }}
                    className="w-12 h-10 rounded border border-white/20"
                  />
                ))}
                {teamColors.length < 2 && (
                  <button
                    type="button"
                    onClick={() => setTeamColors([...teamColors, "#3B82F6"])}
                    className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 transition-colors"
                    title="Add a second colour"
                  >
                    +
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Logo</label>
              <LogoUploader
                onLogoUpload={async (file) => {
                  setTeamLogoFile(file)
                  setTeamLogoPreview(URL.createObjectURL(file))
                }}
                currentLogo={teamLogoPreview}
              />
            </div>

            <button
              type="submit"
              disabled={!teamName.trim() || Boolean(nameCheck.duplicate) || !ownerId}
              className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add team
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">One name per line</label>
              <textarea
                value={bulkTeams}
                onChange={(e) => setBulkTeams(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 focus:border-white/40 focus:outline-none h-40"
                placeholder={"FC Volna\nSydney United\nAspire FC"}
              />
            </div>

            {bulkTeams.trim() && (
              <div className="text-sm space-y-1">
                <p className="opacity-80">
                  {bulkPlan.toCreate.length} to add
                  {bulkPlan.duplicates.length > 0 && `, ${bulkPlan.duplicates.length} already exist`}
                  {bulkPlan.repeated.length > 0 && `, ${bulkPlan.repeated.length} repeated in the list`}
                </p>
                {bulkPlan.duplicates.length > 0 && (
                  <p className="text-amber-300/90">Skipping: {bulkPlan.duplicates.join(', ')}</p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleBulkAdd}
              disabled={bulkPlan.toCreate.length === 0 || !ownerId}
              className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {bulkPlan.toCreate.length > 0
                ? `Add ${bulkPlan.toCreate.length} ${bulkPlan.toCreate.length === 1 ? 'team' : 'teams'}`
                : 'Add teams'}
            </button>
            <p className="text-xs opacity-60">
              Colours are assigned at random and the logo can be added afterwards from the team card.
            </p>
          </div>
        )}

        {result && (
          <p className="mt-4 text-sm text-green-400" role="status">
            {result}
          </p>
        )}
      </div>

      {/* Teams List */}
      <div className="w-full max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl font-semibold">
            {currentOrganizer ? 'Your Teams' : 'All Clubs'} ({visibleTeams.length}
            {visibleTeams.length !== teams.length ? ` of ${teams.length}` : ''})
          </h2>
          <input
            type="search"
            value={teamSearch}
            onChange={(e) => setTeamSearch(e.target.value)}
            placeholder="Search teams..."
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/20 focus:border-white/40 focus:outline-none w-64 max-w-full"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleTeams.map((team) => {
            // The crest, the colours and the squad photo belong to whoever runs
            // the club. Once somebody does, this card shows them rather than
            // offering to change them — the API refuses the write.
            const editable = canEditClub(team, user?.id, superAdmin)
            return (
            <div key={team.id} className="glass rounded-xl p-6">
              <div className="flex items-center gap-4 mb-4">
                {team.logo ? (
                  <img
              loading="lazy"
              decoding="async" src={team.logo} alt={team.name} className="w-16 h-16 rounded-lg object-cover" />
                ) : (
                  <div 
                    className="w-16 h-16 rounded-lg flex items-center justify-center text-white font-bold text-xl"
                    style={{ backgroundColor: team.colors[0] }}
                  >
                    {team.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-semibold">{team.name}</h3>
                  <p className="text-sm opacity-80">
                    {/* A club off the pool arrives without its squad, so the
                        count would read as a fact about the club and is not. */}
                    {team.poolOnly ? 'On your list' : `${team.players.length} players`}
                    {team.visiting && !team.poolOnly && (
                      <span className="opacity-70"> · guest club</span>
                    )}
                  </p>
                  {!currentOrganizer && (
                    <p className="text-xs opacity-60">
                      {getOrganizerById(team.organizerId)?.name ??
                        (organizers.length > 0 ? 'Without an organizer' : '')}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Colors</label>
                  <div className="flex gap-2">
                    {team.colors.map((color, index) =>
                      editable ? (
                        <input
                          key={index}
                          type="color"
                          value={color}
                          onChange={(e) => handleColorChange(team.id, e.target.value)}
                          className="w-8 h-8 rounded border border-white/20"
                        />
                      ) : (
                        <span
                          key={index}
                          className="w-8 h-8 rounded border border-white/20 inline-block"
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ),
                    )}
                  </div>
                </div>

                {editable ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">Logo</label>
                      <LogoUploader
                        onLogoUpload={(file) => uploadTeamLogo(team.id, file)}
                        currentLogo={team.logo}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Photo</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handlePhotoUpload(team.id, file)
                        }}
                        className="w-full text-sm text-white/70 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-white/10 file:text-white hover:file:bg-white/20 file:cursor-pointer"
                      />
                    </div>
                  </>
                ) : team.poolOnly ? (
                  <p className="text-sm opacity-70">
                    From the club pool. Invite it from a competition's settings — its squad appears
                    once its manager accepts.
                  </p>
                ) : team.visiting ? (
                  <p className="text-sm opacity-70">
                    Plays here as a guest from another organiser's league. Its crest, colours and
                    squad are theirs.
                  </p>
                ) : (
                  <p className="text-sm opacity-70">
                    Run by its own manager: the crest, the colours and the squad are theirs.
                  </p>
                )}
                
                <div className="flex gap-2">
                  {/* A club off the pool has no page worth opening here: the
                      squad is deliberately absent, and a club page showing an
                      empty one reads as a club with no players. */}
                  {team.poolOnly ? (
                    <button
                      onClick={() => removeFromPool(team.id)}
                      className="flex-1 px-3 py-2 rounded-lg glass hover:bg-white/10 transition-colors"
                    >
                      Remove from your list
                    </button>
                  ) : (
                    <>
                      <Link
                        to={`/teams/${team.id}`}
                        className="flex-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors text-center"
                      >
                        Manage
                      </Link>
                      {/* Deleting a club another organiser owns is refused by
                          the API, and it is not something this organiser should
                          be offered: removing it from a season is on the season. */}
                      {!team.visiting && (
                        <button
                          onClick={() => deleteTeam(team.id)}
                          className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


/**
 * The pool: clubs that exist already, run by their own managers.
 *
 * An organiser setting up a season types names, and every name typed for a club
 * that is already in the system creates a second copy of it — two crests, two
 * squads, and a history split between them. This is the other way in: search
 * what is there, and put the club on your list.
 *
 * What adding does not do is enter the club in anything. The club has agreed to
 * be found and nothing more, so it arrives as a name and a crest, and playing
 * in a competition is an invitation its manager answers. The squad comes with
 * that answer.
 *
 * The manager's name sits in brackets after the club's because that is the
 * question the organiser is actually asking: two clubs called United are
 * indistinguishable, and the one they mean is the one whose coach they have
 * been talking to.
 */
function ClubPool({ mine, onAdded }: { mine: Set<string>; onAdded: () => Promise<void> }) {
  const [clubs, setClubs] = useState<DirectoryClub[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null)

  // Fetched once, when this tab is first opened: the whole pool in one answer
  // is a third of a second, and a request per keystroke would be one each.
  useEffect(() => {
    let cancelled = false

    clubService
      .directory()
      .then((list) => {
        if (!cancelled) setClubs(list)
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const add = async (club: DirectoryClub) => {
    setAdding(club.id)
    setFailed(null)
    try {
      await clubService.addToPool(club.id)
      await onAdded()
    } catch (error) {
      setFailed({
        id: club.id,
        message: error instanceof Error ? error.message : 'That club could not be added.',
      })
    } finally {
      setAdding(null)
    }
  }

  const needle = query.trim().toLowerCase()
  const matching = (clubs ?? []).filter(
    (club) =>
      !needle ||
      club.name.toLowerCase().includes(needle) ||
      (club.ownerName ?? '').toLowerCase().includes(needle),
  )
  // Every club in the system is in this list. Showing all of them is a page
  // nobody reads to the end, so the search is the way through it and the cap
  // says so rather than silently stopping.
  const shown = matching.slice(0, 40)

  return (
    <div className="space-y-3">
      <p className="text-sm opacity-70">
        Clubs run by their own managers. Adding one puts it on your list; it plays in a competition
        once you invite it and its manager accepts.
      </p>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Club or manager"
        className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 focus:border-white/40 focus:outline-none"
      />

      {loadFailed && (
        <p className="text-sm text-red-300">That list could not be read. Reload the page.</p>
      )}

      {!loadFailed && clubs === null && <p className="text-sm opacity-60">Looking…</p>}

      {clubs !== null && shown.length === 0 && (
        <p className="text-sm opacity-60">
          {clubs.length === 0
            ? 'No club outside your own leagues is in the pool yet.'
            : 'Nothing matches that search.'}
        </p>
      )}

      <ul className="space-y-2">
        {shown.map((club) => {
          const already = mine.has(club.id)
          return (
            <li
              key={club.id}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.03]"
            >
              <span className="flex items-center gap-3 min-w-0">
                {club.logo ? (
                  <img
                    loading="lazy"
                    decoding="async"
                    src={club.logo}
                    alt=""
                    className="w-8 h-8 rounded-md object-cover shrink-0"
                  />
                ) : (
                  <span
                    className="w-8 h-8 rounded-md shrink-0"
                    style={{ backgroundColor: headerColor(club) }}
                  />
                )}
                <span className="min-w-0">
                  <span className="block truncate">
                    {club.name}{' '}
                    <span className="opacity-60">({club.ownerName ?? 'manager not named'})</span>
                  </span>
                  <span className="block text-xs opacity-60">
                    {club.squadSize} {club.squadSize === 1 ? 'player' : 'players'}
                  </span>
                </span>
              </span>

              {already ? (
                <span className="text-xs opacity-60 shrink-0">already on your list</span>
              ) : (
                <button
                  type="button"
                  disabled={adding === club.id}
                  onClick={() => add(club)}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm transition-colors disabled:opacity-50 shrink-0"
                >
                  {adding === club.id ? 'Adding…' : 'Add'}
                </button>
              )}

              {failed?.id === club.id && (
                <p className="w-full text-xs text-red-300">{failed.message}</p>
              )}
            </li>
          )
        })}
      </ul>

      {matching.length > shown.length && (
        <p className="text-xs opacity-60">
          {matching.length - shown.length} more — narrow the search to find them.
        </p>
      )}
    </div>
  )
}
