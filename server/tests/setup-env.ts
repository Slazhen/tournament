/**
 * The API reads its configuration at import time and refuses to start without
 * it, so tests provide the same variables the deployed function gets.
 */
process.env.TABLE_ORGANIZERS = 'test-organizers'
process.env.TABLE_TEAMS = 'test-teams'
process.env.TABLE_TOURNAMENTS = 'test-tournaments'
process.env.TABLE_MATCHES = 'test-matches'
process.env.TABLE_AUTH_USERS = 'test-auth-users'
process.env.TABLE_AUTH_SESSIONS = 'test-auth-sessions'
process.env.S3_BUCKET = 'test-images'
process.env.ALLOWED_ORIGINS = 'https://myfootballtournament.com'
process.env.AWS_REGION = 'us-east-1'
