// AWS Configuration
export const AWS_CONFIG = {
  region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
  dynamoDB: {
    tournamentsTable: process.env.REACT_APP_TOURNAMENTS_TABLE || 'football-tournaments',
    teamsTable: process.env.REACT_APP_TEAMS_TABLE || 'football-teams',
    playersTable: process.env.REACT_APP_PLAYERS_TABLE || 'football-players',
    matchesTable: process.env.REACT_APP_MATCHES_TABLE || 'football-matches',
    organizersTable: process.env.REACT_APP_ORGANIZERS_TABLE || 'football-organizers'
  },
  s3: {
    bucket: process.env.REACT_APP_S3_BUCKET || 'football-tournaments-images',
    region: process.env.REACT_APP_AWS_REGION || 'us-east-1'
  }
}

// Check if we're in production
export const isProduction = process.env.NODE_ENV === 'production'
