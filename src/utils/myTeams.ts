/**
 * A signal that the clubs this account runs have changed.
 *
 * The top bar draws "My teams" from its own request and has no other way to
 * learn that the page below it has just handed the club on, left it, or joined
 * one. A session refresh covers joining and leaving — the account's `teamIds`
 * moves — but not who is head, which lives on the club.
 */
export const MY_TEAMS_CHANGED = 'mft:my-teams-changed'

export function announceMyTeamsChanged(): void {
  window.dispatchEvent(new Event(MY_TEAMS_CHANGED))
}
