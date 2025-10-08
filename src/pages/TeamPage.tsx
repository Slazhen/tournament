import { useParams, Link } from 'react-router-dom'
import { useAppStore } from '../store'
import { useRef, useState } from 'react'
import { uid } from '../utils/uid'
import FacebookIcon from '../components/FacebookIcon'
import InstagramIcon from '../components/InstagramIcon'
import CustomDatePicker from '../components/CustomDatePicker'

export default function TeamPage() {
  const { teamId } = useParams()
  const { getCurrentOrganizer, getOrganizerTeams, getOrganizerTournaments, updateTeam, uploadTeamLogo, uploadTeamPhoto } = useAppStore()
  
  const currentOrganizer = getCurrentOrganizer()
  const teams = getOrganizerTeams()
  const tournaments = getOrganizerTournaments()
  
  // State for upload feedback
  const [uploadMessage, setUploadMessage] = useState('')
  
  // Find the specific team by ID
  const team = teams.find(t => t.id === teamId)
  
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

  const logoFileRef = useRef<HTMLInputElement>(null)
  const photoFileRef = useRef<HTMLInputElement>(null)

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

  const addPlayer = () => {
    if (!team) return
    const newPlayer: any = {
      id: uid(),
      firstName: 'New',
      lastName: 'Player',
      position: 'Forward',
      number: 1,
      isPublic: true,
      createdAtISO: new Date().toISOString()
    }
    updateTeam(team.id, { 
      players: [...(team.players || []), newPlayer] 
    })
  }

  const updatePlayer = (playerId: string, updates: any) => {
    if (!team?.players) return
    const updatedPlayers = team.players.map(p => 
      p.id === playerId ? { ...p, ...updates } : p
    )
    updateTeam(team.id, { players: updatedPlayers })
  }

  const removePlayer = (playerId: string) => {
    if (!team?.players) return
    const updatedPlayers = team.players.filter(p => p.id !== playerId)
    updateTeam(team.id, { players: updatedPlayers })
  }

  // Find tournaments where this team participates
  const teamTournaments = tournaments.filter(t => 
    t.teamIds.includes(teamId!)
  )

  return (
    <div className="grid gap-6 place-items-center">
      {/* Header */}
      <section className="glass rounded-xl p-6 w-full max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <Link to="/teams" className="text-sm opacity-70 hover:opacity-100 flex items-center gap-2">
            ← Back to Teams
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
                className="px-3 py-2 rounded-md glass hover:bg-white/10 transition-all text-sm"
                title="Copy to clipboard"
              >
                📋 Copy
              </button>
            </div>
          </div>
        </div>
        
        {/* Team Info Header */}
        <div className="flex items-center gap-6 mb-6">
          {/* Team Logo */}
          <div className="relative group">
            {team.logo ? (
              <img
                src={team.logo}
                alt={`${team.name} logo`}
                className="w-24 h-24 object-cover rounded-lg"
              />
            ) : (
              <div className="w-24 h-24 rounded-lg bg-white/10 flex items-center justify-center text-2xl opacity-50">
                🏆
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
              <input
                type="text"
                value={team.name}
                onChange={(e) => updateTeam(team.id, { name: e.target.value })}
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
                src={team.photo}
                alt={`${team.name} photo`}
                className="w-24 h-24 object-cover rounded-lg"
              />
            ) : (
              <div className="w-24 h-24 rounded-lg bg-white/10 flex items-center justify-center text-sm opacity-50">
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
                <input
                  type="url"
                  placeholder="Facebook page..."
                  value={team.socialMedia.facebook}
                                    onChange={(e) => updateTeam(team.id, { 
                    socialMedia: { 
                      ...team.socialMedia, 
                      facebook: e.target.value || undefined 
                    }
                  })}
                  className="px-3 py-2 rounded bg-transparent border border-white/20 text-center min-w-[250px]"
                />
              </div>
            )}
            {team.socialMedia?.instagram && (
              <div className="flex items-center gap-2">
                <InstagramIcon size={16} />
                <input
                  type="url"
                  placeholder="Instagram profile..."
                  value={team.socialMedia.instagram}
                                    onChange={(e) => updateTeam(team.id, { 
                    socialMedia: { 
                      ...team.socialMedia, 
                      instagram: e.target.value || undefined 
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-center">
          <div className="p-4 glass rounded-lg">
            <div className="text-2xl font-bold text-blue-400">{teamTournaments.length}</div>
            <div className="text-sm opacity-70">Tournaments</div>
          </div>
          <div className="p-4 glass rounded-lg">
            <div className="text-2xl font-bold text-green-400">{team.players?.length || 0}</div>
            <div className="text-sm opacity-70">Players</div>
          </div>
          <div className="p-4 glass rounded-lg">
            <div className="text-2xl font-bold text-yellow-400">{new Date(team.createdAtISO).getFullYear()}</div>
            <div className="text-sm opacity-70">Founded</div>
          </div>
          <div className="p-4 glass rounded-lg">
            <div className="text-2xl font-bold text-purple-400">{team.id.slice(-4)}</div>
            <div className="text-sm opacity-70">Team ID</div>
          </div>
          <div className="p-4 glass rounded-lg">
            <div className="text-2xl font-bold text-red-400">{team.colors?.length || 0}</div>
            <div className="text-sm opacity-70">Colors</div>
          </div>
          <div className="p-4 glass rounded-lg">
            <div className="text-2xl font-bold text-indigo-400">{team.socialMedia ? 'Yes' : 'No'}</div>
            <div className="text-sm opacity-70">Social Media</div>
          </div>
        </div>
      </section>

      {/* Players Section */}
      <section className="glass rounded-xl p-6 w-full max-w-6xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Players ({team.players?.length || 0})</h2>
          <button
            onClick={addPlayer}
            className="px-4 py-2 rounded-md glass hover:bg-white/10 transition-all"
          >
            Add Player
          </button>
        </div>
        
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
                              src={player.photo}
                              alt={`${player.firstName} ${player.lastName} photo`}
                              className="w-12 h-12 object-cover rounded-full"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-sm opacity-50">
                              👤
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium">
                            <Link 
                              to={`/players/${player.id}`}
                              className="hover:opacity-80 transition-opacity"
                            >
                              {`${player.firstName} ${player.lastName}`}
                            </Link>
                          </div>
                          <div className="text-xs opacity-70">ID: {player.id.slice(-6)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="text"
                        value={player.position || ''}
                        onChange={(e) => updatePlayer(player.id, { position: e.target.value })}
                        className="w-full px-2 py-1 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
                        placeholder="Position"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        value={player.number || ''}
                        onChange={(e) => updatePlayer(player.id, { number: e.target.value ? Number(e.target.value) : undefined })}
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
                        className="px-3 py-1 rounded glass text-sm hover:bg-white/10 transition-all text-center"
                      >
                        🌐 View
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => removePlayer(player.id)}
                        className="px-3 py-1 rounded glass text-sm hover:bg-white/10 transition-all text-red-400 hover:text-red-300"
                      >
                        🗑️ Remove
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
                              src={tournament.logo} 
                              alt={`${tournament.name} logo`} 
                              className="w-full h-full object-cover" 
                            />
                          ) : (
                            <div className="text-lg opacity-50">🏆</div>
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
                          to={`/tournaments/${tournament.id}`}
                          className="px-3 py-1 rounded glass text-sm hover:bg-white/10 transition-all"
                        >
                          🏆 View
                        </Link>
                        <Link
                          to={`/public/tournaments/${tournament.id}`}
                          target="_blank"
                          className="px-3 py-1 rounded glass text-sm hover:bg-white/10 transition-all"
                        >
                          🌐 Public
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
