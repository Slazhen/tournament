import { useState, useRef } from "react"
import { useAppStore } from "../store"
import { uid } from "../utils/uid"
import { Link } from "react-router-dom"
import InstagramIcon from "../components/InstagramIcon"
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
  
  const updatePlayer = (teamId: string, playerId: string, updates: any) => {
    const team = teams.find(t => t.id === teamId)
    if (team) {
      updateTeam(teamId, {
        players: team.players.map(p => 
          p.id === playerId ? { ...p, ...updates } : p
        )
      })
    }
  }
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="min-h-[80vh] flex flex-col items-center gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Manage Teams</h1>
        <p className="opacity-80">Organizer: {currentOrganizer.name}</p>
      </div>
      
      {/* Add Team Form */}
      <section className="glass rounded-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4 text-center">Add New Team</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Team Name</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none"
              placeholder="Enter team name"
              required
            />
          </div>
          
                           <div>
                   <label className="block text-sm font-medium mb-2">Team Colors (1-2 colors)</label>
                   <div className="space-y-2">
                     {teamColors.map((color, index) => (
                       <div key={index} className="flex items-center gap-3">
                         <input
                           type="color"
                           value={color}
                           onChange={(e) => {
                             const newColors = [...teamColors]
                             newColors[index] = e.target.value
                             setTeamColors(newColors)
                           }}
                           className="w-12 h-10 rounded border border-white/20"
                         />
                         <span className="text-sm opacity-70">{color}</span>
                         {teamColors.length > 1 && (
                           <button
                             type="button"
                             onClick={() => setTeamColors(teamColors.filter((_, i) => i !== index))}
                             className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                           >
                             Remove
                           </button>
                         )}
                       </div>
                     ))}
                     {teamColors.length < 2 && (
                       <button
                         type="button"
                         onClick={() => setTeamColors([...teamColors, '#EF4444'])}
                         className="px-3 py-1 text-sm bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
                       >
                         + Add Second Color
                       </button>
                     )}
                   </div>
                 </div>
                 
                 <div>
                   <label className="block text-sm font-medium mb-2">Team Logo (Optional)</label>
                   <LogoUploader 
                     onLogoChange={setTeamLogo}
                     currentLogo={teamLogo}
                     size={60}
                   />
                 </div>
          
          <button
            type="submit"
            className="w-full px-4 py-2 rounded-md glass hover:bg-white/10 transition-all font-medium"
          >
            Add Team
          </button>
        </form>
      </section>
      
      {/* Bulk Add Teams */}
      <section className="glass rounded-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4 text-center">Bulk Add Teams</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Team Names (one per line)</label>
            <textarea
              value={bulkTeams}
              onChange={(e) => setBulkTeams(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-transparent border border-white/20 focus:border-white/40 focus:outline-none h-24 resize-none"
              placeholder="Team A&#10;Team B&#10;Team C"
            />
          </div>
          
          <button
            onClick={handleBulkAdd}
            disabled={!bulkTeams.trim()}
            className="w-full px-4 py-2 rounded-md glass hover:bg-white/10 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add All Teams
          </button>
        </div>
      </section>

      {/* Teams List */}
      <section className="glass rounded-xl p-6 w-full max-w-4xl">
        <h2 className="text-lg font-semibold mb-4 text-center">Your Teams ({teams.length})</h2>
        
        {teams.length === 0 ? (
          <p className="text-center opacity-70">No teams yet. Create your first team above!</p>
        ) : (
          <div className="grid gap-4">
            {teams.map((team) => (
              <div key={team.id} className="glass rounded-lg p-4">
                <div className="flex items-center gap-4 mb-4">
                  {/* Team Logo/Photo */}
                  <div className="relative">
                    {team.logo ? (
                      <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                        <img src={team.logo} alt={`${team.name} logo`} className="w-full h-full object-cover" />
                      </div>
                    ) : team.photo ? (
                      <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-white/10">
                        <img src={team.photo} alt={`${team.name} photo`} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div 
                        className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg"
                        style={{ backgroundColor: team.colors[0] || '#3B82F6' }}
                      >
                        {team.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    
                    {/* Logo Upload Button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs hover:bg-blue-600 transition-colors"
                      title="Upload logo"
                    >
                      📷
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleLogoUpload(team.id, file)
                      }}
                      className="hidden"
                    />
                    
                    {/* Photo Upload Button */}
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      className="absolute -bottom-1 -right-3 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs hover:bg-green-600 transition-colors"
                      title="Upload team photo"
                    >
                      🖼️
                    </button>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handlePhotoUpload(team.id, file)
                      }}
                      className="hidden"
                    />
                  </div>
                  
                  {/* Team Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">{team.name}</h3>
                      <div 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: team.colors[0] || '#3B82F6' }}
                      />
                    </div>
                    
                    {/* Social Media Links */}
                    <div className="flex gap-3 text-sm">
                      <input
                        type="text"
                        placeholder="Facebook URL"
                        value={team.socialMedia?.facebook || ''}
                        onChange={(e) => handleSocialMediaUpdate(team.id, 'facebook', e.target.value)}
                        className="px-2 py-1 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none text-xs"
                      />
                      <input
                        type="text"
                        placeholder="Instagram URL"
                        value={team.socialMedia?.instagram || ''}
                        onChange={(e) => handleSocialMediaUpdate(team.id, 'instagram', e.target.value)}
                        className="px-2 py-1 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none text-xs"
                      />
                    </div>
                  </div>
                  
                  {/* Color Picker */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Color</label>
                    <input
                      type="color"
                      value={team.colors[0] || '#3B82F6'}
                      onChange={(e) => handleColorChange(team.id, e.target.value)}
                      className="w-8 h-8 rounded border border-white/20"
                    />
                  </div>
                  
                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <Link
                      to={`/teams/${team.id}`}
                      className="px-3 py-1 rounded glass text-sm hover:bg-white/10 transition-all text-center"
                    >
                      👥 View
                    </Link>
                    <Link
                      to={`/public/teams/${team.id}`}
                      target="_blank"
                      className="px-3 py-1 rounded glass text-sm hover:bg-white/10 transition-all text-center"
                    >
                      🌐 Public
                    </Link>
                    <button
                      onClick={() => deleteTeam(team.id)}
                      className="px-3 py-1 rounded glass text-sm hover:bg-white/10 transition-all text-center text-red-400 hover:text-red-300"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
                
                {/* Players Section */}
                <div className="border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">Players ({team.players.length})</h4>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="First name"
                        className="px-2 py-1 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none text-sm"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.target as HTMLInputElement
                            const firstName = input.value.trim()
                            if (firstName) {
                              // Find the last name input
                              const lastNameInput = input.parentElement?.nextElementSibling?.querySelector('input') as HTMLInputElement
                              const lastName = lastNameInput?.value.trim() || 'Player'
                              addPlayer(team.id, firstName, lastName)
                              input.value = ''
                              if (lastNameInput) lastNameInput.value = ''
                            }
                          }
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Last name"
                        className="px-2 py-1 rounded bg-transparent border border-white/20 focus:border-white/40 focus:outline-none text-sm"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.target as HTMLInputElement
                            const lastName = input.value.trim()
                            if (lastName) {
                              // Find the first name input
                              const firstNameInput = input.parentElement?.previousElementSibling?.querySelector('input') as HTMLInputElement
                              const firstName = firstNameInput?.value.trim() || 'New'
                              addPlayer(team.id, firstName, lastName)
                              input.value = ''
                              if (firstNameInput) firstNameInput.value = ''
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {team.players.map((player) => (
                      <div key={player.id} className="flex items-center justify-between p-2 glass rounded text-sm">
                        <div className="flex items-center gap-2">
                          <span>{`${player.firstName} ${player.lastName}`}</span>
                          <Link
                            to={`/players/${player.id}`}
                            className="text-xs opacity-70 hover:opacity-100"
                            title="View player details"
                          >
                            👁️
                          </Link>
                        </div>
                        <button
                          onClick={() => removePlayer(team.id, player.id)}
                          className="text-red-400 hover:text-red-300 text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ))}
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

