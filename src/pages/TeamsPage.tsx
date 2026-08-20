import { useState } from "react"
import { useAppStore } from "../store"
import { Link } from "react-router-dom"
import LogoUploader from "../components/LogoUploader"
import { checkTeamName, parseBulkNames } from "../utils/teams"

export default function TeamsPage() {
  const [teamName, setTeamName] = useState("")
  const [teamColors, setTeamColors] = useState<string[]>(["#3B82F6"])
  const [teamLogoFile, setTeamLogoFile] = useState<File | null>(null)
  const [teamLogoPreview, setTeamLogoPreview] = useState("")
  const [bulkTeams, setBulkTeams] = useState("")
  // Adding several teams at once was the quickest way to set up a season and it
  // sat below the single-team form looking like an afterthought.
  const [addMode, setAddMode] = useState<'one' | 'many'>('one')
  // Creating a team used to happen in silence — no confirmation, and the new
  // card landed somewhere in a grid of thirty.
  const [result, setResult] = useState<string>("")
  // With thirty-odd teams in an unordered grid, finding one meant scrolling.
  const [teamSearch, setTeamSearch] = useState("")
  
  const { 
    getCurrentOrganizer, 
    getOrganizerTeams, 
    createTeam, 
    updateTeam, 
    deleteTeam,
    uploadTeamLogo,
    uploadTeamPhoto
  } = useAppStore()
  
  const currentOrganizer = getCurrentOrganizer()
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
  
  const nameCheck = checkTeamName(teamName, teams)
  const bulkPlan = parseBulkNames(bulkTeams, teams)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = teamName.trim()
    if (!name || nameCheck.duplicate) return

    const created = await createTeam(name, teamColors)

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
    if (bulkPlan.toCreate.length === 0) return

    for (const name of bulkPlan.toCreate) {
      const randomColor = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`
      await createTeam(name, [randomColor])
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
  
  // Removed unused functions and refs to fix TypeScript errors

  // Alphabetical order and a search box: the list used to come back in whatever
  // order the database returned it, with new teams landing in the middle.
  const visibleTeams = [...teams]
    .filter((team) => team.name.toLowerCase().includes(teamSearch.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="min-h-[80vh] flex flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Manage Teams</h1>
        <p className="opacity-80">Create and manage your teams</p>
      </div>

      {/* Adding teams. One card, two ways in — pasting a list is how a season
          actually gets set up, so it is a tab rather than a separate box below. */}
      <div className="glass rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center gap-1 mb-5 p-1 rounded-lg bg-white/5 w-fit">
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

        {addMode === 'one' ? (
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
              disabled={!teamName.trim() || Boolean(nameCheck.duplicate)}
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
              disabled={bulkPlan.toCreate.length === 0}
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
            Your Teams ({visibleTeams.length}{visibleTeams.length !== teams.length ? ` of ${teams.length}` : ''})
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
          {visibleTeams.map((team) => (
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
                  <p className="text-sm opacity-80">{team.players.length} players</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Colors</label>
                  <div className="flex gap-2">
                    {team.colors.map((color, index) => (
                      <input
                        key={index}
                        type="color"
                        value={color}
                        onChange={(e) => handleColorChange(team.id, e.target.value)}
                        className="w-8 h-8 rounded border border-white/20"
                      />
                    ))}
                  </div>
                </div>
                
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
                
                <div className="flex gap-2">
                  <Link
                    to={`/teams/${team.id}`}
                    className="flex-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors text-center"
                  >
                    Manage
                  </Link>
                  <button
                    onClick={() => deleteTeam(team.id)}
                    className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
