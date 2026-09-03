import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Match, Player, Team } from '../types'
import { uid } from '../utils/uid'
import { playersNamedInMatch } from '../utils/squads'
import { playerLabel } from '../utils/players'
import { cardLabel, scorerSide } from '../utils/matches'
import type { CardType } from '../utils/matches'
import { IconBall, IconCard } from './icons'

type Side = 'home' | 'away'
type GoalType = 'goal' | 'penalty' | 'own_goal'

type GoalDraft = {
  team: Side
  type: GoalType
  minute: string
  playerId: string
  assistPlayerId: string
}

type CardDraft = {
  team: Side
  type: CardType
  minute: string
  playerId: string
}

const EMPTY_GOAL: GoalDraft = { team: 'home', type: 'goal', minute: '', playerId: '', assistPlayerId: '' }
const EMPTY_CARD: CardDraft = { team: 'home', type: 'yellow', minute: '', playerId: '' }

const GOAL_TYPES: Array<{ value: GoalType; label: string }> = [
  { value: 'goal', label: 'Goal' },
  { value: 'penalty', label: 'Penalty' },
  { value: 'own_goal', label: 'Own goal' },
]

const CARD_TYPES: Array<{ value: CardType; label: string }> = [
  { value: 'yellow', label: 'Yellow card' },
  { value: 'second_yellow', label: 'Second yellow' },
  { value: 'red', label: 'Red card' },
]

const FIELD =
  'w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:outline-none focus:border-white/40 transition-colors'

/** The minute somebody typed, or nothing at all. An event without one cannot be placed. */
function minuteOf(entered: string): number | null {
  const minute = Number(entered)
  if (!entered.trim() || !Number.isInteger(minute) || minute < 1 || minute > 130) return null
  return minute
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2 opacity-80">{label}</label>
      {children}
    </div>
  )
}

/**
 * A choice made in one click rather than found in a list.
 *
 * The type of a goal was the fourth select in a row of four and organisers did
 * not see it, so penalties were being recorded as ordinary goals.
 */
function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`px-3 py-2 rounded-lg text-sm border transition-all ${
            value === option.value
              ? 'bg-white/20 border-white/40 text-white'
              : 'border-white/15 text-white/70 hover:bg-white/10'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Which club the event belongs to. For a goal that is the side it counted for. */
function TeamChoice({
  value,
  onChange,
  homeTeam,
  awayTeam,
}: {
  value: Side
  onChange: (side: Side) => void
  homeTeam: Team
  awayTeam: Team
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {([
        { side: 'home' as const, team: homeTeam, on: 'bg-blue-500/25 border-blue-400/50 text-blue-200' },
        { side: 'away' as const, team: awayTeam, on: 'bg-red-500/25 border-red-400/50 text-red-200' },
      ]).map(({ side, team, on }) => (
        <button
          key={side}
          type="button"
          onClick={() => onChange(side)}
          className={`px-3 py-2 rounded-lg text-sm border transition-all ${
            value === side ? on : 'border-white/15 text-white/70 hover:bg-white/10'
          }`}
        >
          {team.name}
        </button>
      ))}
    </div>
  )
}

function PlayerChoice({
  label,
  players,
  value,
  onChange,
  teamName,
  allowNobody,
  nobodyLabel,
  onGoToLineups,
}: {
  label: string
  players: Player[]
  value: string
  onChange: (playerId: string) => void
  teamName: string
  allowNobody?: boolean
  nobodyLabel?: string
  onGoToLineups: () => void
}) {
  // The picker is the teamsheet, so an empty one is a sheet nobody has filled
  // in rather than a club with no players. Saying which, and where to fix it,
  // is the whole difference between a screen that is empty and one that is
  // broken.
  if (players.length === 0) {
    return (
      <Field label={label}>
        <p className="text-sm opacity-70 leading-relaxed">
          Nobody is named for {teamName} in this match yet.{' '}
          <button type="button" onClick={onGoToLineups} className="underline hover:opacity-100">
            Name the side on the Line-ups tab
          </button>
          , then record the event.
        </p>
      </Field>
    )
  }

  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={FIELD}>
        <option value="">{allowNobody ? (nobodyLabel ?? 'Nobody') : 'Select player'}</option>
        {players.map((player) => (
          <option key={player.id} value={player.id}>
            {playerLabel(player)}
          </option>
        ))}
      </select>
    </Field>
  )
}

/**
 * Everything a goal is, in one form.
 *
 * The same fields fill in a new goal and correct an existing one, and neither
 * writes anything until the form is submitted: the previous version of this
 * screen saved on every keystroke and every select, so a half-typed goal was
 * already in the record and the list re-sorted itself under the cursor.
 */
function GoalFields({
  draft,
  onChange,
  match,
  homeTeam,
  awayTeam,
  onGoToLineups,
}: {
  draft: GoalDraft
  onChange: (draft: GoalDraft) => void
  match: Match
  homeTeam: Team
  awayTeam: Team
  onGoToLineups: () => void
}) {
  // An own goal counts for one side and is put in by a player of the other, so
  // the scorer is picked from the opposite teamsheet.
  const side = scorerSide({ team: draft.team, type: draft.type })
  const scorerTeam = side === 'home' ? homeTeam : awayTeam
  const assistTeam = draft.team === 'home' ? homeTeam : awayTeam
  const isOwnGoal = draft.type === 'own_goal'

  const scorers = playersNamedInMatch(scorerTeam, match.lineups?.[side], draft.playerId)
  const assists = playersNamedInMatch(assistTeam, match.lineups?.[draft.team], draft.assistPlayerId)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Counts for">
        <TeamChoice
          value={draft.team}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          onChange={(team) => onChange({ ...draft, team, playerId: '', assistPlayerId: '' })}
        />
      </Field>
      <Field label="Type">
        <Chips
          options={GOAL_TYPES}
          value={draft.type}
          onChange={(type) => {
            // Switching into or out of an own goal moves the scorer to the other
            // squad, so the name chosen for the old side cannot be kept.
            const crossesSides = type === 'own_goal' || draft.type === 'own_goal'
            onChange({
              ...draft,
              type,
              playerId: crossesSides ? '' : draft.playerId,
              assistPlayerId: type === 'own_goal' ? '' : draft.assistPlayerId,
            })
          }}
        />
      </Field>
      <Field label="Minute">
        <input
          type="number"
          min="1"
          max="130"
          inputMode="numeric"
          placeholder="Minute"
          value={draft.minute}
          onChange={(event) => onChange({ ...draft, minute: event.target.value })}
          className={FIELD}
        />
      </Field>
      <PlayerChoice
        label={isOwnGoal ? `Own goal by (${scorerTeam.name})` : 'Scorer'}
        players={scorers}
        value={draft.playerId}
        onChange={(playerId) => onChange({ ...draft, playerId })}
        teamName={scorerTeam.name}
        allowNobody={isOwnGoal}
        nobodyLabel="Not known"
        onGoToLineups={onGoToLineups}
      />
      {/* An own goal has no assist, so the field is not offered for one. */}
      {!isOwnGoal && (
        <PlayerChoice
          label="Assist"
          players={assists}
          value={draft.assistPlayerId}
          onChange={(assistPlayerId) => onChange({ ...draft, assistPlayerId })}
          teamName={assistTeam.name}
          allowNobody
          nobodyLabel="No assist"
          onGoToLineups={onGoToLineups}
        />
      )}
    </div>
  )
}

function CardFields({
  draft,
  onChange,
  match,
  homeTeam,
  awayTeam,
  onGoToLineups,
}: {
  draft: CardDraft
  onChange: (draft: CardDraft) => void
  match: Match
  homeTeam: Team
  awayTeam: Team
  onGoToLineups: () => void
}) {
  const team = draft.team === 'home' ? homeTeam : awayTeam
  const players = playersNamedInMatch(team, match.lineups?.[draft.team], draft.playerId)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Club">
        <TeamChoice
          value={draft.team}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          onChange={(side) => onChange({ ...draft, team: side, playerId: '' })}
        />
      </Field>
      <Field label="Card">
        <Chips options={CARD_TYPES} value={draft.type} onChange={(type) => onChange({ ...draft, type })} />
      </Field>
      <Field label="Minute">
        <input
          type="number"
          min="1"
          max="130"
          inputMode="numeric"
          placeholder="Minute"
          value={draft.minute}
          onChange={(event) => onChange({ ...draft, minute: event.target.value })}
          className={FIELD}
        />
      </Field>
      <PlayerChoice
        label="Player"
        players={players}
        value={draft.playerId}
        onChange={(playerId) => onChange({ ...draft, playerId })}
        teamName={team.name}
        onGoToLineups={onGoToLineups}
      />
    </div>
  )
}

/**
 * The goals and the bookings of one match.
 *
 * Two rules hold this screen together. Nothing is written until a form is
 * submitted, so a list never reorders itself under a cursor; and adding or
 * removing a goal recounts the score in the same write, so the result on the
 * scoreboard above follows the events without anybody retyping it.
 */
export default function MatchEvents({
  match,
  homeTeam,
  awayTeam,
  onSave,
  onGoToLineups,
}: {
  match: Match
  homeTeam: Team
  awayTeam: Team
  onSave: (updates: Partial<Match>) => void
  onGoToLineups: () => void
}) {
  const [goalDraft, setGoalDraft] = useState<GoalDraft>(EMPTY_GOAL)
  const [cardDraft, setCardDraft] = useState<CardDraft>(EMPTY_CARD)
  const [editingGoal, setEditingGoal] = useState<{ id: string; draft: GoalDraft } | null>(null)
  const [editingCard, setEditingCard] = useState<{ id: string; draft: CardDraft } | null>(null)

  const goals = match.goals ?? []
  const cards = match.cards ?? []

  /**
   * The score the recorded events add up to.
   *
   * The score is still a field of its own, edited on the scoreboard: most
   * matches here have a result and no events at all, and a score counted from
   * an empty list would read 0-0 for every one of them. So this is applied only
   * when the event list itself changes.
   */
  const scoreOf = (list: typeof goals) => ({
    homeGoals: list.filter((goal) => goal.team === 'home').length,
    awayGoals: list.filter((goal) => goal.team === 'away').length,
  })

  const nameOf = (playerId: string, side: Side): string => {
    if (!playerId) return ''
    const team = side === 'home' ? homeTeam : awayTeam
    const found = team.players.find((player) => player.id === playerId)
    if (found) return playerLabel(found)
    // Goals recorded before own goals crossed sides name a player of the side
    // the goal counted for, so the other squad is where to look next.
    const fallback = (side === 'home' ? awayTeam : homeTeam).players.find(
      (player) => player.id === playerId,
    )
    return fallback ? playerLabel(fallback) : 'Former player'
  }

  const goalIsComplete = (draft: GoalDraft) =>
    minuteOf(draft.minute) !== null && (draft.type === 'own_goal' || draft.playerId !== '')

  const cardIsComplete = (draft: CardDraft) => minuteOf(draft.minute) !== null && draft.playerId !== ''

  const addGoal = () => {
    const minute = minuteOf(goalDraft.minute)
    if (minute === null || !goalIsComplete(goalDraft)) return
    const next = [
      ...goals,
      {
        id: uid(),
        team: goalDraft.team,
        playerId: goalDraft.playerId,
        minute,
        type: goalDraft.type,
        assistPlayerId:
          goalDraft.type === 'own_goal' ? undefined : goalDraft.assistPlayerId || undefined,
      },
    ]
    onSave({ goals: next, ...scoreOf(next) })
    // The club stays chosen: goals are entered off a scoresheet a side at a time.
    setGoalDraft({ ...EMPTY_GOAL, team: goalDraft.team })
  }

  const saveGoal = (id: string, draft: GoalDraft) => {
    const minute = minuteOf(draft.minute)
    if (minute === null || !goalIsComplete(draft)) return
    const next = goals.map((goal) =>
      goal.id === id
        ? {
            ...goal,
            team: draft.team,
            type: draft.type,
            minute,
            playerId: draft.playerId,
            assistPlayerId:
              draft.type === 'own_goal' ? undefined : draft.assistPlayerId || undefined,
          }
        : goal,
    )
    // The side a goal counts for is editable here, so the score is recounted on
    // a correction as well as on a new event.
    onSave({ goals: next, ...scoreOf(next) })
    setEditingGoal(null)
  }

  const deleteGoal = (id: string) => {
    const next = goals.filter((goal) => goal.id !== id)
    onSave({ goals: next, ...scoreOf(next) })
    if (editingGoal?.id === id) setEditingGoal(null)
  }

  const addCard = () => {
    const minute = minuteOf(cardDraft.minute)
    if (minute === null || !cardIsComplete(cardDraft)) return
    onSave({
      cards: [
        ...cards,
        { id: uid(), team: cardDraft.team, playerId: cardDraft.playerId, minute, type: cardDraft.type },
      ],
    })
    setCardDraft({ ...EMPTY_CARD, team: cardDraft.team })
  }

  const saveCard = (id: string, draft: CardDraft) => {
    const minute = minuteOf(draft.minute)
    if (minute === null || !cardIsComplete(draft)) return
    onSave({
      cards: cards.map((card) =>
        card.id === id
          ? { ...card, team: draft.team, type: draft.type, minute, playerId: draft.playerId }
          : card,
      ),
    })
    setEditingCard(null)
  }

  const deleteCard = (id: string) => {
    onSave({ cards: cards.filter((card) => card.id !== id) })
    if (editingCard?.id === id) setEditingCard(null)
  }

  // Copied before sorting: the array belongs to the record this page is
  // holding, and sorting it in place reorders it there.
  const sortedGoals = [...goals].sort((a, b) => a.minute - b.minute)
  const sortedCards = [...cards].sort((a, b) => a.minute - b.minute)

  // Which goal of the match it was for that club, counted from the order the
  // list is in. It used to be a number stored on the goal, which stayed as it
  // was when an earlier goal was deleted.
  const ordinals = new Map<string, number>()
  let scoredHome = 0
  let scoredAway = 0
  for (const goal of sortedGoals) {
    if (goal.team === 'home') ordinals.set(goal.id, ++scoredHome)
    else ordinals.set(goal.id, ++scoredAway)
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h3 className="font-semibold text-xl">Goals</h3>
          <div className="text-sm opacity-70">
            {homeTeam.name} {scoredHome} - {scoredAway} {awayTeam.name} from the events below
          </div>
        </div>

        <div className="glass rounded-xl p-5 space-y-4">
          <h4 className="font-semibold">Add a goal</h4>
          <GoalFields
            draft={goalDraft}
            onChange={setGoalDraft}
            match={match}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            onGoToLineups={onGoToLineups}
          />
          <div className="flex items-center gap-4 flex-wrap">
            <button
              type="button"
              onClick={addGoal}
              disabled={!goalIsComplete(goalDraft)}
              className="px-4 py-2 rounded-lg glass border border-white/20 hover:bg-white/10 transition-all disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Add goal
            </button>
            <span className="text-sm opacity-60">
              The score above updates with it.
            </span>
          </div>
        </div>

        {sortedGoals.length === 0 ? (
          <div className="glass rounded-xl p-8 text-center">
            <div className="mb-4 flex justify-center opacity-60">
              <IconBall size={36} />
            </div>
            <h4 className="font-semibold text-lg mb-2">No goals yet</h4>
            <p className="opacity-70">Fill the form above in and the goal is recorded once.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedGoals.map((goal) => {
              const side = scorerSide(goal)
              const countsFor = goal.team === 'home' ? homeTeam : awayTeam
              const isHome = goal.team === 'home'

              if (editingGoal?.id === goal.id) {
                return (
                  <div key={goal.id} className="glass rounded-xl p-5 space-y-4 border border-white/20">
                    <GoalFields
                      draft={editingGoal.draft}
                      onChange={(draft) => setEditingGoal({ id: goal.id, draft })}
                      match={match}
                      homeTeam={homeTeam}
                      awayTeam={awayTeam}
                      onGoToLineups={onGoToLineups}
                    />
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => saveGoal(goal.id, editingGoal.draft)}
                        disabled={!goalIsComplete(editingGoal.draft)}
                        className="px-4 py-2 rounded-lg glass border border-white/20 hover:bg-white/10 transition-all disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingGoal(null)}
                        className="px-4 py-2 rounded-lg text-white/70 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div key={goal.id} className="glass rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-sm bg-white/10 px-2 py-1 rounded">{goal.minute}'</span>
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${
                      isHome
                        ? 'bg-blue-500/20 border-blue-400/30 text-blue-300'
                        : 'bg-red-500/20 border-red-400/30 text-red-300'
                    }`}
                    title={`${countsFor.name} goal`}
                  >
                    {ordinals.get(goal.id)}
                  </span>
                  <span className={`font-semibold ${isHome ? 'text-blue-300' : 'text-red-300'}`}>
                    {goal.playerId ? nameOf(goal.playerId, side) : 'Own goal'}
                  </span>
                  {goal.type !== 'goal' && (
                    <span className="text-xs uppercase tracking-wide px-2 py-1 rounded bg-white/10">
                      {goal.type === 'penalty' ? 'Penalty' : 'Own goal'}
                    </span>
                  )}
                  {goal.type !== 'own_goal' && goal.assistPlayerId && (
                    <span className="text-sm opacity-70">
                      assist {nameOf(goal.assistPlayerId, goal.team)}
                    </span>
                  )}
                  <span className="text-sm opacity-50">{countsFor.name}</span>
                  <div className="ml-auto flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingGoal({
                          id: goal.id,
                          draft: {
                            team: goal.team,
                            type: goal.type ?? 'goal',
                            minute: String(goal.minute ?? ''),
                            playerId: goal.playerId ?? '',
                            assistPlayerId: goal.assistPlayerId ?? '',
                          },
                        })
                      }
                      className="text-sm opacity-70 hover:opacity-100 transition-opacity"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteGoal(goal.id)}
                      className="text-sm text-red-400 hover:text-red-300 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Bookings. Recorded as events rather than as two numbers on the
          statistics tab: who was booked is the part a visitor comes for, and
          the totals fall out of the list on their own. */}
      <section className="space-y-4 pt-6 border-t border-white/10">
        <h3 className="font-semibold text-xl">Cards</h3>

        <div className="glass rounded-xl p-5 space-y-4">
          <h4 className="font-semibold">Add a card</h4>
          <CardFields
            draft={cardDraft}
            onChange={setCardDraft}
            match={match}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            onGoToLineups={onGoToLineups}
          />
          <button
            type="button"
            onClick={addCard}
            disabled={!cardIsComplete(cardDraft)}
            className="px-4 py-2 rounded-lg glass border border-white/20 hover:bg-white/10 transition-all disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Add card
          </button>
        </div>

        {sortedCards.length === 0 ? (
          <div className="glass rounded-xl p-8 text-center">
            <div className="mb-4 flex justify-center opacity-60">
              <IconCard size={36} />
            </div>
            <h4 className="font-semibold text-lg mb-2">No cards yet</h4>
            <p className="opacity-70">Fill the form above in and the booking is recorded once.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedCards.map((card) => {
              const team = card.team === 'home' ? homeTeam : awayTeam
              const isHome = card.team === 'home'

              if (editingCard?.id === card.id) {
                return (
                  <div key={card.id} className="glass rounded-xl p-5 space-y-4 border border-white/20">
                    <CardFields
                      draft={editingCard.draft}
                      onChange={(draft) => setEditingCard({ id: card.id, draft })}
                      match={match}
                      homeTeam={homeTeam}
                      awayTeam={awayTeam}
                      onGoToLineups={onGoToLineups}
                    />
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => saveCard(card.id, editingCard.draft)}
                        disabled={!cardIsComplete(editingCard.draft)}
                        className="px-4 py-2 rounded-lg glass border border-white/20 hover:bg-white/10 transition-all disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCard(null)}
                        className="px-4 py-2 rounded-lg text-white/70 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div key={card.id} className="glass rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-sm bg-white/10 px-2 py-1 rounded">{card.minute}'</span>
                  <IconCard size={16} variant={card.type} />
                  <span className={`font-semibold ${isHome ? 'text-blue-300' : 'text-red-300'}`}>
                    {nameOf(card.playerId, card.team)}
                  </span>
                  <span className="text-sm opacity-70">{cardLabel(card.type)}</span>
                  <span className="text-sm opacity-50">{team.name}</span>
                  <div className="ml-auto flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingCard({
                          id: card.id,
                          draft: {
                            team: card.team,
                            type: card.type,
                            minute: String(card.minute ?? ''),
                            playerId: card.playerId ?? '',
                          },
                        })
                      }
                      className="text-sm opacity-70 hover:opacity-100 transition-opacity"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCard(card.id)}
                      className="text-sm text-red-400 hover:text-red-300 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
