import { useState, useRef } from "react"
import { useAppStore } from "../store"
import { uid } from "../utils/uid"
import { Link } from "react-router-dom"
import LogoUploader from "../components/LogoUploader"

export default function TeamsPage() {
  const [teamName, setTeamName] = useState("")
  const [teamColors, setTeamColors] = useState<string[]>(["#3B82F6"])
  const [teamLogo, setTeamLogo] = useState("")
  const [bulkTeams, setBulkTeams] = useState("")
  
  const { 
    getCurrentOrganizer, 
    getOrganizerTeams, 
    createTeam, 
    updateTeam, 
    deleteTeam 
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
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (teamName.trim()) {
      createTeam(teamName.trim(), teamColors, teamLogo)
      setTeamName("")
      setTeamColors(["#3B82F6"])
      setTeamLogo("")
    }
  }
  
  const handleBulkAdd = () => {
    const teamNames = bulkTeams
      .split("\n")
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
    
    teamNames.forEach((name) => {
      const randomColor = `#${Math.floor(Math.random() * 16777215).toString(16)}`
      createTeam(name, [randomColor])
    })
    
    setBulkTeams("")
  }
  
  const handleLogoUpload = (teamId: string, file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      updateTeam(teamId, { logo: result })
    }
    reader.readAsDataURL(file)
  }
  
  const handlePhotoUpload = (teamId: string, file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      updateTeam(teamId, { photo: result })
    }
    reader.readAsDataURL(file)
  }
  
  const handleColorChange = (teamId: string, color: string) => {
    updateTeam(teamId, { colors: [color] })
  }
  
  const handleSocialMediaUpdate = (teamId: string, platform: 'facebook' | 'instagram', value: string) => {
    const team = teams.find(t => t.id === teamId)
    if (team) {
      updateTeam(teamId, {
        socialMedia: {
          ...team.socialMedia,
          [platform]: value
        }
      })
    }
  }
  
  const addPlayer = (teamId: string, firstName: string, lastName: string) => {
    const team = teams.find(t => t.id === teamId)
    if (team) {
      const newPlayer = {
        id: uid(),
        firstName,
        lastName,
        isPublic: true,
        createdAtISO: new Date().toISOString()
      }
      updateTeam(teamId, {
        players: [...team.players, newPlayer]
      })
    }
  }
  
  const removePlayer = (teamId: string, playerId: string) => {
    const team = teams.find(t => t.id === teamId)
    if (team) {
      updateTeam(teamId, {
        players: team.players.filter(p => p.id !== playerId)
      })
    }
  }
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="min-h-[80vh] flex flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Manage Teams</h1>
        <p className="opacity-80">Create and manage your teams</p>
      </div>

      {/* Create Team Form */}
      <div className="glass rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Create New Team</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Team Name</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 focus:border-white/40 focus:outline-none"
              placeholder="Enter team name"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Team Colors</label>
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
                >
                  +
                </button>
              )}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Team Logo</label>
            <LogoUploader
              onUpload={(file) => {
                const reader = new FileReader()
                reader.onload = (e) => {
                  const result = e.target?.result as string
                  setTeamLogo(result)
                }
                reader.readAsDataURL(file)
              }}
              currentLogo={teamLogo}
            />
          </div>
          
          <button
            type="submit"
            className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            Create Team
          </button>
        </form>
      </div>

      {/* Bulk Add Teams */}
      <div className="glass rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Bulk Add Teams</h2>
        <textarea
          value={bulkTeams}
          onChange={(e) => setBulkTeams(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 focus:border-white/40 focus:outline-none h-32"
          placeholder="Enter team names, one per line"
        />
        <button
          onClick={handleBulkAdd}
          className="w-full mt-4 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 transition-colors"
        >
          Add All Teams
        </button>
      </div>

      {/* Teams List */}
      <div className="w-full max-w-6xl">
        <h2 className="text-2xl font-semibold mb-6">Your Teams ({teams.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map((team) => (
            <div key={team.id} className="glass rounded-xl p-6">
              <div className="flex items-center gap-4 mb-4">
                {team.logo ? (
                  <img src={team.logo} alt={team.name} className="w-16 h-16 rounded-lg object-cover" />
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
                    onUpload={(file) => handleLogoUpload(team.id, file)}
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
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 focus:border-white/40 focus:outline-none"
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
