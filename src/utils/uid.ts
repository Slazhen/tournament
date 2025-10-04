export function uid(): string {
  return Math.random().toString(36).substr(2, 9)
}

export function generateMatchUID(): string {
  return 'match_' + Math.random().toString(36).substring(2) + Date.now().toString(36)
}
