import { useParams, Link } from 'react-router-dom'
import { useAppStore } from '../store'
import { useRef, useState } from 'react'
import FacebookIcon from '../components/FacebookIcon'
import InstagramIcon from '../components/InstagramIcon'
import CustomDatePicker from '../components/CustomDatePicker'
import InlineInput from '../components/InlineInput'
import { adminSeasonUrl, publicSeasonUrl } from '../utils/seasons'
import { clubService } from '../lib/data'
import {
  IconArrowLeft,
  IconLink,
  IconClipboard,
  IconTrophy,
  IconUser,
  IconGlobe,
  IconTrash,
} from '../components/icons'

export default function TeamPage() {
  const { teamId } = useParams()
  const { getCurrentOrganizer, getOrganizerById, getOrganizerTeams, getOrganizerTournaments, updateTeam, addPlayer: createPlayer, updatePlayer: savePlayer, removePlayer: deletePlayer, uploadTeamLogo, uploadTeamPhoto, superAdmin } = useAppStore()

  const currentOrganizer = getCurrentOrganizer()
  const teams = getOrganizerTeams()
  const tournaments = getOrganizerTournaments()

  // State for upload feedback
  const [uploadMessage, setUploadMessage] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteEmailed, setInviteEmailed] = useState(false)
  const [isInviting, setIsInviting] = useState(false)
  // The add-player form. Players used to be created the instant the button was
  // pressed, appearing as "New Player" with a number nobody chose.
  const [isAddingPlayer, setIsAddingPlayer] = useState(false)
  const [draftPlayer, setDraftPlayer] = useState({ firstName: '', lastName: '', number: '', position: 'Forward' })
  // Hooks must run on every render (before any early return) to keep hook order stable.
  const logoFileRef = useRef<HTMLInputElement>(null)
  const photoFileRef = useRef<HTMLInputElement>(null)
  
  // Find the specific team by ID
  const team = teams.find(t => t.id === teamId)
  
  // Redirect if no organizer is selected. The super admin has none and needs
  // none: the club in front of them names the organizer it belongs to.
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
  
  // Show team not found if it doesn't exist
  if (!team) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4">Team Not Found</h1>
          <p className="opacity-80 mb-6">The team you're looking for doesn't exist or you don't have access to it.</p>
          <Link to="/teams" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Back to Teams
          </Link>
        </div>
      </div>
    )
  }

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && team) {
      setUploadMessage('Uploading logo...')
      try {
        await uploadTeamLogo(team.id, file)
        setUploadMessage('Logo uploaded successfully!')
        setTimeout(() => setUploadMessage(''), 3000)
      } catch (error) {
        console.error('Error uploading logo:', error)
        setUploadMessage('Error uploading logo')
        setTimeout(() => setUploadMessage(''), 3000)
      }
    }
  }

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && team) {
      setUploadMessage('Uploading photo...')
      try {
        await uploadTeamPhoto(team.id, file)
        setUploadMessage('Photo uploaded successfully!')
        setTimeout(() => setUploadMessage(''), 3000)
      } catch (error) {
        console.error('Error uploading photo:', error)
        setUploadMessage('Error uploading photo')
        setTimeout(() => setUploadMessage(''), 3000)
      }
    }
  }

  // Each of these touches one player on the server rather than rewriting the
  // whole squad, so two edits made close together no longer overwrite each other.
  const submitNewPlayer = async () => {
    if (!team) return
    if (!draftPlayer.firstName.trim() && !draftPlayer.lastName.trim()) return

    await createPlayer(team.id, {
      firstName: draftPlayer.firstName.trim(),
      lastName: draftPlayer.lastName.trim(),
      position: draftPlayer.position.trim() || 'Forward',
      number: draftPlayer.number ? Number(draftPlayer.number) : undefined,
      isPublic: true,
    })

    setDraftPlayer({ firstName: '', lastName: '', number: '', position: 'Forward' })
    setIsAddingPlayer(false)
  }

  const updatePlayer = (playerId: string, updates: Record<string, unknown>) => {
    if (!team) return
    void savePlayer(team.id, playerId, updates)
  }

  const removePlayer = (playerId: string) => {
    if (!team) return
    void deletePlayer(team.id, playerId)
  }

  // Find tournaments where this team participates
  const teamTournaments = tournaments.filter(t => 
    t.teamIds.includes(teamId!)
  )

  // Matches this team is actually scheduled in, across every tournament.
  const teamMatchCount = teamTournaments.reduce(
    (total, tournament) =>
      total +
      (tournament.matches || []).filter(
        (match) => match.homeTeamId === teamId || match.awayTeamId === teamId
      ).length,
    0
  )

  return (
    <div className="grid gap-6 place-items-center">
      {/* Header */}
      <section className="glass rounded-xl p-6 w-full max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <Link to="/teams" className="text-sm opacity-70 hover:opacity-100 flex items-center gap-2">
            <IconArrowLeft size={15} /> Back to Teams
          </Link>
          
          {/* Public Link */}
          <div className="text-center">
            <label className="block text-sm font-medium mb-2">Public Link</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/public/teams/${team.id}`}
                className="px-3 py-2 rounded-md bg-transparent border border-white/20 text-center min-w-[300px] text-sm"
              />
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/public/teams/${team.id}`)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md glass hover:bg-white/10 transition-all text-sm"
                title="Copy to clipboard"
              >
                <IconClipboard size={15} /> Copy
              </button>
            </div>

            {/* Handing the club to the person who actually runs it. */}
            <div className="mt-4 pt-4 border-t border-white/10 w-full max-w-2xl">
              <p className="text-sm opacity-70 mb-2">
                Invite the coach or club secretary to run {team.name}: the squad, the crest and
                entering competitions. Results stay with you.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="Their email (optional)"
                  className="px-3 py-2 rounded-md bg-transparent border border-white/20 text-sm min-w-[240px]"
                />
                <button
                  type="button"
                  onClick={async () => {
                    setIsInviting(true)
                    try {
                      const result = await clubService.invite(team.id, inviteEmail.trim() || undefined)
                      setInviteLink(result.link)
                      setInviteEmailed(result.emailed)
                      try {
                        await navigator.clipboard.writeText(result.link)
                      } catch {
                        // The link is on screen either way.
                      }
                    } catch {
                      alert('The invitation could not be created.')
                    } finally {
                      setIsInviting(false)
                    }
                  }}
                  disabled={isInviting}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
                >
                  <IconLink size={15} /> {isInviting ? 'Creating...' : 'Invite manager'}
                </button>
              </div>

              {inviteLink && (
                <div className="mt-3">
                  <p className="text-sm text-gray-300 mb-1">
                    {inviteEmailed
                      ? 'Sent, and copied to your clipboard. It works once and lasts a fortnight.'
                      : 'Copied to your clipboard. It works once and lasts a fortnight.'}
                  </p>
                  <code className="block text-xs bg-black/40 border border-white/10 rounded-lg p-3 break-all text-blue-200">
                    {inviteLink}
                  </code>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Team Info Header */}
        <div className="flex items-center gap-6 mb-6">
          {/* Team Logo */}
          <div className="relative group">
            {team.logo ? (
              <img
              loading="lazy"
              decoding="async"
                src={team.logo}
                alt={`${team.name} logo`}
                className="w-24 h-24 object-cover rounded-lg"
              />
            ) : (
              <div className="w-24 h-24 rounded-lg bg-white/10 flex items-center justify-center opacity-50">
                <IconTrophy size={22} />
              </div>
            )}
            <input
              ref={logoFileRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />
            <button
              onClick={() => logoFileRef.current?.click()}
              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center text-white text-xs transition-all"
              title="Change logo"
            >
              {team.logo ? 'Change' : 'Add'}
            </button>
          </div>
          
          {/* Team Details */}
          <div className="flex-1">
            <div className="mb-4">
              <InlineInput
                type="text"
                value={team.name}
                onCommit={(value) => updateTeam(team.id, { name: value })}
                className="text-3xl font-bold bg-transparent border-b border-transparent hover:border-white/20 focus:border-white/40 focus:outline-none transition-all"
                placeholder="Team Name"
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="opacity-70">Players:</span>
                <div className="font-semibold">{team.players?.length || 0}</div>
              </div>
              <div>
                <span className="opacity-70">Colors:</span>
                <div className="flex items-center gap-2">
                  {team.colors?.map((color, index) => (
                    <input
                      key={index}
                      type="color"
                      value={color}
                      onChange={(e) => {
                        const newColors = [...(team.colors || ['#3B82F6'])]
                        newColors[index] = e.target.value
                        updateTeam(team.id, { colors: newColors })
                      }}
                      className="w-6 h-6 rounded border border-white/20"
                    />
                  ))}
                  {(!team.colors || team.colors.length < 2) && (
                    <button
                      onClick={() => {
                        const newColors = [...(team.colors || ['#3B82F6']), '#EF4444']
                        updateTeam(team.id, { colors: newColors })
                      }}
                      className="w-6 h-6 rounded border border-white/20 bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs"
                      title="Add second color"
                    >
                      +
                    </button>
                  )}
                  {team.colors && team.colors.length > 1 && (
                    <button
                      onClick={() => {
                        const newColors = team.colors.slice(0, -1)
                        updateTeam(team.id, { colors: newColors })
                      }}
                      className="w-6 h-6 rounded border border-white/20 bg-red-500/20 hover:bg-red-500/30 flex items-center justify-center text-xs text-red-400"
                      title="Remove last color"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div>
                <span className="opacity-70">Established:</span>
                <div className="flex items-center gap-2">
                  <CustomDatePicker
                    value={team.establishedDate ? team.establishedDate.split('T')[0] : ''}
                    onChange={(date) => updateTeam(team.id, { establishedDate: date })}
                    className="text-xs"
                    placeholder="Select Date"
                  />
                </div>
              </div>
              <div>
                <span className="opacity-70">Created:</span>
                <div className="font-semibold">{new Date(team.createdAtISO).toLocaleDateString()}</div>
              </div>
            </div>
          </div>
          
          {/* Team Photo */}
          <div className="relative group">
            {team.photo ? (
              <img
              loading="lazy"
              decoding="async"
                src={team.photo}
                alt={`${team.name} photo`}
                className="w-24 h-24 object-cover rounded-lg"
              />
            ) : (
              <div className="w-24 h-24 rounded-lg bg-white/10 flex items-center justify-center opacity-50">
                Photo
              </div>
            )}
            <input
              ref={photoFileRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <button
              onClick={() => photoFileRef.current?.click()}
              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center text-white text-xs transition-all"
              title="Change photo"
            >
              {team.photo ? 'Change' : 'Add'}
            </button>
          </div>
        </div>
        
        {/* Social Media Links */}
        {(team.socialMedia?.facebook || team.socialMedia?.instagram) && (
          <div className="flex items-center justify-center gap-6 text-sm">
            {team.socialMedia?.facebook && (
              <div className="flex items-center gap-2">
                <FacebookIcon size={16} />
                <InlineInput
                  type="url"
                  placeholder="Facebook page..."
                  value={team.socialMedia.facebook}
                                    onCommit={(value) => updateTeam(team.id, { 
                    socialMedia: { 
                      ...team.socialMedia, 
                      facebook: value || undefined 
                    }
                  })}
                  className="px-3 py-2 rounded bg-transparent border border-white/20 text-center min-w-[250px]"
                />
              </div>
            )}
            {team.socialMedia?.instagram && (
              <div className="flex items-center gap-2">
                <InstagramIcon size={16} />
                <InlineInput
                  type="url"
                  placeholder="Instagram profile..."
                  value={team.socialMedia.instagram}
                                    onCommit={(value) => updateTeam(team.id, { 
                    socialMedia: { 
                      ...team.socialMedia, 
                      instagram: value || undefined 
                    }
                  })}
                  className="px-3 py-2 rounded bg-transparent border border-white/20 text-center min-w-[250px]"
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* Upload Status */}
      {uploadMessage && (
        <div className="flex justify-center mb-6">
          <div className="px-4 py-2 rounded-lg glass text-sm">
            {uploadMessage}
          </div>
        </div>
      )}

      {/* Team Statistics Summary */}
      <section className="glass rounded-xl p-6 w-full max-w-6xl">
        <h2 className="text-xl font-semibold mb-4 text-center">Season Summary</h2>
        {/* Only numbers someone would actually look up. The old tiles included
            the last four characters of the database id and a yes/no for whether
            a social link had been filled in. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="p-4 glass rounded-lg">
            <div className="text-2xl font-bold text-blue-400">{teamTournaments.length}</div>
            <div className="text-sm opacity-70">Tournaments</div>
          </div>
          <div className="p-4 glass rounded-lg">
            <div className="text-2xl font-bold text-green-400">{team.players?.length || 0}</div>
            <div className="text-sm opacity-70">Players</div>
          </div>
          <div className="p-4 glass rounded-lg">
            <div className="text-2xl font-bold text-purple-400">{teamMatchCount}</div>
            <div className="text-sm opacity-70">Matches</div>
          </div>
          <div className="p-4 glass rounded-lg">
            <div className="text-2xl font-bold text-yellow-400">{new Date(team.createdAtISO).getFullYear()}</div>
            <div className="text-sm opacity-70">Founded</div>
          </div>
        </div>
      </section>

      {/* Players Section */}
      <section className="glass rounded-xl p-6 w-full max-w-6xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Players ({team.players?.length || 0})</h2>
          <button
            onClick={() => setIsAddingPlayer((open) => !open)}
            className="px-4 py-2 rounded-md glass hover:bg-white/10 transition-all"
          >
            {isAddingPlayer ? 'Cancel' : 'Add Player'}
          </button>
        </div>

        {isAddingPlayer && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void submitNewPlayer()
            }}
            className="mb-6 grid gap-3 md:grid-cols-[1fr_1fr_80px_1fr_auto] items-end"
          >
            <label className="text-sm">
              <span className="opacity-70">First name</span>
              <input
                autoFocus
                value={draftPlayer.firstName}
                onChange={(e) => setDraftPlayer({ ...draftPlayer, firstName: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                placeholder="Vasily"
              />
            </label>
            <label className="text-sm">
              <span className="opacity-70">Last name</span>
              <input
                value={draftPlayer.lastName}
                onChange={(e) => setDraftPlayer({ ...draftPlayer, lastName: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                placeholder="Esipov"
              />
            </label>
            <label className="text-sm">
              <span className="opacity-70">Number</span>
              <input
                type="number"
                value={draftPlayer.number}
                onChange={(e) => setDraftPlayer({ ...draftPlayer, number: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none text-center"
                placeholder="#"
              />
            </label>
            <label className="text-sm">
              <span className="opacity-70">Position</span>
              <input
                value={draftPlayer.position}
                onChange={(e) => setDraftPlayer({ ...draftPlayer, position: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                placeholder="Forward"
              />
            </label>
            <button
              type="submit"
              disabled={!draftPlayer.firstName.trim() && !draftPlayer.lastName.trim()}
              className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
          </form>
        )}
        
        {(!team.players || team.players.length === 0) ? (
          <p className="text-center opacity-70">No players yet. Add your first player!</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-3 px-4 text-left">Player</th>
                  <th className="py-3 px-4 text-left">Position</th>
                  <th className="py-3 px-4 text-left">Number</th>
                  <th className="py-3 px-4 text-left">Joined</th>
                  <th className="py-3 px-4 text-center">Public</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                                        {team.players.map((player) => (
                  <tr key={player.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="relative group">
                          {player.photo ? (
                            <img
              loading="lazy"
              decoding="async"
                              src={player.photo}
                              alt={`${player.firstName} ${player.lastName} photo`}
                              className="w-12 h-12 object-cover rounded-full"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center opacity-50">
                              <IconUser size={20} />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium">
                            <Link 
                              to={`/players/${player.id}`}
                              className="hover:opacity-80 transition-opacity"
                            >
                              {`${player.firstName} ${player.lastName}`.trim() || 'Unnamed player'}
                            </Link>
                          </div>
                          <div className="text-xs opacity-70">ID: {player.id.slice(-6)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <InlineInput
                        type="text"
                        value={player.position || ''}
                        onCommit={(value) => updatePlayer(player.id, { position: value })}
                        className="w-full px-2 py-1 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                        placeholder="Position"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <InlineInput
                        type="number"
                        value={player.number || ''}
                        onCommit={(value) => updatePlayer(player.id, { number: value ? Number(value) : undefined })}
                        className="w-full px-2 py-1 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                        placeholder="#"
                      />
                    </td>
                    <td className="py-3 px-4 text-sm opacity-70">
                      {new Date(player.createdAtISO).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Link
                        to={`/public/players/${player.id}`}
                        target="_blank"
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded glass text-sm hover:bg-white/10 transition-all text-center"
                      >
                        <IconGlobe size={14} /> View
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => removePlayer(player.id)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded glass text-sm hover:bg-white/10 transition-all text-red-400 hover:text-red-300"
                      >
                        <IconTrash size={14} /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Tournaments Section */}
      <section className="glass rounded-xl p-6 w-full max-w-6xl">
        <h2 className="text-xl font-semibold mb-4 text-center">Tournaments</h2>
        
        {teamTournaments.length === 0 ? (
          <p className="text-center opacity-70">This team is not participating in any tournaments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-3 px-4 text-left">Tournament</th>
                  <th className="py-3 px-4 text-center">Teams</th>
                  <th className="py-3 px-4 text-center">Matches</th>
                  <th className="py-3 px-4 text-center">Format</th>
                  <th className="py-3 px-4 text-center">Created</th>
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
                          <div className="text-xs opacity-70">ID: {tournament.id.slice(-6)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-semibold">{tournament.teamIds.length}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-semibold">{tournament.matches.length}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-sm">
                        {tournament.format?.mode === 'league_playoff' ? 'League + Playoffs' : 'League Only'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-sm opacity-70">
                      {new Date(tournament.createdAtISO).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex gap-2 justify-center">
                        <Link
                          to={adminSeasonUrl(tournament, getOrganizerById(tournament.organizerId))}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded glass text-sm hover:bg-white/10 transition-all"
                        >
                          <IconTrophy size={14} /> View
                        </Link>
                        <Link
                          to={publicSeasonUrl(tournament, getOrganizerById(tournament.organizerId))}
                          target="_blank"
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded glass text-sm hover:bg-white/10 transition-all"
                        >
                          <IconGlobe size={14} /> Public
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
