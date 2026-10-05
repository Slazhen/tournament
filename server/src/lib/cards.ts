import { badRequest } from './http.js'
import type { Side } from './lineups.js'

export type CardType = 'yellow' | 'second_yellow' | 'red' | 'blue'

/**
 * Who put the booking in.
 *
 * A side of the competition rather than an account id, for the reason a goal's
 * `enteredBy` is: the card travels whole to every visitor of the public match
 * page, and the only question anything asks of this field is who may correct
 * it. Absent is the organiser - every card written before this field existed
 * came through the organiser's match screen, because nobody else could write
 * one.
 *
 * There is no `club`. A club's manager names scorers and teamsheets; a booking
 * is the referee's record of the match, and the organiser's.
 */
export type CardAuthor = 'organizer' | 'referee'

export type StoredCard = {
  id: string
  team: Side
  playerId: string
  minute: number
  type: CardType
  enteredBy?: CardAuthor
}

const TYPES = new Set<CardType>(['yellow', 'second_yellow', 'red', 'blue'])

/** The cards of a fixture, with anything that is not a card record dropped. */
export function cardsOf(match: Record<string, unknown> | undefined | null): StoredCard[] {
  const list = (match as { cards?: unknown } | null | undefined)?.cards
  if (!Array.isArray(list)) return []
  return list.filter(
    (card): card is StoredCard =>
      Boolean(card) && typeof card === 'object' && typeof (card as StoredCard).id === 'string',
  )
}

/**
 * One booking as the request describes it, checked.
 *
 * `team` is the side of the player who was shown it, not a side the card
 * "counts for": a booking belongs to the player. The minute is required, unlike
 * a goal's: a card is entered off the referee's notebook while the match is
 * still in mind, and every screen that ever wrote one asked for it.
 *
 * Nobody may be booked anonymously. A card with no player costs nobody a match
 * and credits nobody with a booking, so it is a row that only clutters the
 * timeline; the discipline table reads it as nothing.
 */
export function readCard(body: Record<string, unknown>): {
  team: Side
  type: CardType
  minute: number
  playerId: string
} {
  const team = body.team
  if (team !== 'home' && team !== 'away') throw badRequest("team must be 'home' or 'away'")

  const type = body.type
  if (typeof type !== 'string' || !TYPES.has(type as CardType)) {
    throw badRequest("type must be 'yellow', 'second_yellow', 'red' or 'blue'")
  }

  const minute = Number(body.minute)
  if (body.minute === undefined || body.minute === null || body.minute === '') {
    throw badRequest('A card needs the minute it was shown')
  }
  if (!Number.isInteger(minute) || minute < 1 || minute > 130) {
    throw badRequest('minute must be a whole number of minutes')
  }

  const playerId = typeof body.playerId === 'string' ? body.playerId : ''
  if (!playerId) throw badRequest('A card needs the player it was shown to')

  return { team: team as Side, type: type as CardType, minute, playerId }
}

export function composeCard(
  id: string,
  fields: ReturnType<typeof readCard>,
  enteredBy: CardAuthor,
): StoredCard {
  return {
    id,
    team: fields.team,
    type: fields.type,
    minute: fields.minute,
    playerId: fields.playerId,
    enteredBy,
  }
}

/** How an audit line names a booking. */
export function describeCard(type: CardType): string {
  switch (type) {
    case 'second_yellow':
      return 'second yellow card'
    case 'red':
      return 'red card'
    case 'blue':
      return 'blue card'
    default:
      return 'yellow card'
  }
}
