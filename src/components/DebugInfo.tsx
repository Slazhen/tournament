import { useAppStore } from '../store'

export default function DebugInfo() {
  const { 
    organizers, 
    currentOrganizerId, 
    teams, 
    tournaments, 
    getCurrentOrganizer,
    getOrganizerTeams,
    getOrganizerTournaments,
    migrateDataToCurrentOrganizer
  } = useAppStore()
  
  const currentOrganizer = getCurrentOrganizer()
  const filteredTeams = getOrganizerTeams()
  const filteredTournaments = getOrganizerTournaments()
  
  return (
    <div className="fixed bottom-4 right-4 p-4 glass rounded-lg text-xs max-w-md opacity-90 z-50">
      <h3 className="font-bold mb-2">Debug Info</h3>
      
      <div className="space-y-2">
        <div>
          <strong>Current Organizer ID:</strong> {currentOrganizerId || 'None'}
        </div>
        
        <div>
          <strong>Current Organizer:</strong> {currentOrganizer?.name || 'None'}
        </div>
        
        <div>
          <strong>Total Organizers:</strong> {organizers.length}
        </div>
        
        <div>
          <strong>All Teams:</strong> {teams.length}
          <div className="ml-2 text-xs opacity-70">
            {teams.map(t => (
              <div key={t.id}>
                {t.name} (organizer: {t.organizerId || 'missing'})
              </div>
            ))}
          </div>
        </div>
        
        <div>
          <strong>Filtered Teams:</strong> {filteredTeams.length}
          <div className="ml-2 text-xs opacity-70">
            {filteredTeams.map(t => (
              <div key={t.id}>{t.name}</div>
            ))}
          </div>
        </div>
        
        <div>
          <strong>All Tournaments:</strong> {tournaments.length}
          <div className="ml-2 text-xs opacity-70">
            {tournaments.map(t => (
              <div key={t.id}>
                {t.name} (organizer: {t.organizerId || 'missing'})
              </div>
            ))}
          </div>
        </div>
        
        <div>
          <strong>Filtered Tournaments:</strong> {filteredTournaments.length}
          <div className="ml-2 text-xs opacity-70">
            {filteredTournaments.map(t => (
              <div key={t.id}>{t.name}</div>
            ))}
          </div>
        </div>
        
        {currentOrganizerId && (
          <div className="mt-3 pt-2 border-t border-white/20">
            <button
              onClick={migrateDataToCurrentOrganizer}
              className="px-3 py-1 rounded glass hover:bg-white/10 transition-all text-xs"
            >
              🔧 Migrate Old Data
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
