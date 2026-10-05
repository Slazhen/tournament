import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { refereeService, REFEREE_POSITIONS } from '../lib/data'
import type { RefereeMatch } from '../lib/data'
import type { Team } from '../types'
import MatchEvents from '../components/MatchEvents'
import { roundLabel } from '../utils/matches'
import { cdnUrl } from '../utils/images'
import { IconArrowLeft, IconShield, IconWhistle } from '../components/icons'

const SCORE_FIELD =
  'w-20 text-center text-3xl font-bold bg-white/5 rounded-lg border border-white/20 focus:border-white/40 focus:outline-none py-2'

/**
 * One match, as the referee appointed to it records it.
 *
 * The score, the goals and the cards, and nothing else: the teamsheets, the
 * venue and the date stay the organiser's. What is offered follows the rules
 * the API enforces, and every write is followed by a fresh read of the match -
 * the score moves on the server with some goals and not others, and a screen
 * that guessed would be a second answer.
 */
export default function RefereeMatchPage() {
  const { tournamentId = '', matchId = '' } = useParams()
  const [data, setData] = useState<RefereeMatch | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [score, setScore] = useState<{ home: string; away: string }>({ home: '', away: '' })
  const [scoreError, setScoreError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const next = await refereeService.match(tournamentId, matchId)
      setData(next)
      setScore({
        home: typeof next.match.homeGoals === 'number' ? String(next.match.homeGoals) : '',
        away: typeof next.match.awayGoals === 'number' ? String(next.match.awayGoals) : '',
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This match could not be loaded.')
    }
  }, [tournamentId, matchId])

  useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return (
      <div className="glass rounded-xl p-8 max-w-xl mx-auto text-center space-y-4">
        <p className="text-red-300">{error}</p>
        <Link to="/referee" className="underline opacity-80">
          Back to my matches
        </Link>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
      </div>
    )
  }

  const { match, tournament } = data
  if (!data.homeTeam || !data.awayTeam) {
    return (
      <div className="glass rounded-xl p-8 max-w-xl mx-auto text-center space-y-4">
        <p className="opacity-80">The clubs in this match have not been decided yet.</p>
        <Link to="/referee" className="underline opacity-80">
          Back to my matches
        </Link>
      </div>
    )
  }
  const homeTeam = data.homeTeam as Team
  const awayTeam = data.awayTeam as Team

  /** Every write, then the match as the server now holds it. */
  const thenReload = async (action: () => Promise<unknown>) => {
    try {
      await action()
    } finally {
      await load()
    }
  }

  const parsed = (value: string) => {
    const number = Number(value)
    return value.trim() !== '' && Number.isInteger(number) && number >= 0 && number <= 99 ? number : null
  }
  const home = parsed(score.home)
  const away = parsed(score.away)
  const storedHome = typeof match.homeGoals === 'number' ? match.homeGoals : null
  const storedAway = typeof match.awayGoals === 'number' ? match.awayGoals : null
  const scoreChanged = home !== storedHome || away !== storedAway

  const saveScore = async () => {
    if (home === null || away === null) return
    setSaving(true)
    setScoreError(null)
    try {
      await refereeService.setScore(tournament.id, match.id, { homeGoals: home, awayGoals: away })
      await load()
    } catch (caught) {
      setScoreError(caught instanceof Error ? caught.message : 'The score could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const crest = (team: Team) =>
    team.logo ? (
      <img src={cdnUrl(team.logo)} alt="" className="w-14 h-14 rounded-full object-cover mx-auto mb-2" />
    ) : (
      <span className="w-14 h-14 rounded-full mx-auto mb-2 flex items-center justify-center bg-white/10">
        <IconShield size={22} />
      </span>
    )

  const officials = REFEREE_POSITIONS.filter(({ value }) => data.officials[value])

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link to="/referee" className="text-sm opacity-70 hover:opacity-100 inline-flex items-center gap-2">
        <IconArrowLeft size={15} /> My matches
      </Link>

      <section className="glass rounded-xl p-6 text-center space-y-4">
        <div className="text-sm opacity-70">
          {tournament.name} - {roundLabel(match)} - {tournament.organizerName}
        </div>

        <div className="flex items-center justify-center gap-6">
          <div className="flex-1 min-w-0">
            {crest(homeTeam)}
            <div className="font-semibold truncate">{homeTeam.name}</div>
          </div>
          <div className="flex items-center gap-2">
            {data.scoreIsMine ? (
              <>
                <input
                  inputMode="numeric"
                  aria-label={`${homeTeam.name} score`}
                  value={score.home}
                  placeholder="-"
                  onChange={(event) => setScore({ ...score, home: event.target.value })}
                  className={SCORE_FIELD}
                />
                <span className="text-2xl opacity-50">:</span>
                <input
                  inputMode="numeric"
                  aria-label={`${awayTeam.name} score`}
                  value={score.away}
                  placeholder="-"
                  onChange={(event) => setScore({ ...score, away: event.target.value })}
                  className={SCORE_FIELD}
                />
              </>
            ) : (
              <span className="text-4xl font-bold tabular-nums">
                {storedHome ?? '-'} : {storedAway ?? '-'}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {crest(awayTeam)}
            <div className="font-semibold truncate">{awayTeam.name}</div>
          </div>
        </div>

        {data.scoreIsMine ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={saveScore}
              disabled={saving || home === null || away === null || !scoreChanged}
              className="px-5 py-2 rounded-lg glass border border-white/20 hover:bg-white/10 transition-all disabled:opacity-40"
            >
              {saving ? 'Saving...' : 'Save score'}
            </button>
            {scoreError && <p className="text-sm text-red-300">{scoreError}</p>}
            <p className="text-xs opacity-60">
              Recording a goal below also moves the score. Once the organiser changes the result,
              it is theirs.
            </p>
          </div>
        ) : (
          <p className="text-xs opacity-60">
            The organiser set this result, so only they can change it. You can still name who
            scored and record the cards.
          </p>
        )}

        {officials.length > 0 && (
          <div className="text-xs opacity-70 inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <IconWhistle size={13} />
            {officials.map(({ value, label }) => (
              <span key={value} className={value === data.position ? 'font-semibold opacity-100' : ''}>
                {label}: {data.officials[value]}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="glass rounded-xl p-6">
        <MatchEvents
          match={match}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          registered={data.nameable}
          scoreIsMine={data.scoreIsMine}
          // What the referee may correct: their own entries and a club's, never
          // the organiser's. Bookings have no club author.
          mayCorrect={(event) => event.enteredBy === 'referee' || event.enteredBy === 'club'}
          onAddGoal={(goal) => thenReload(() => refereeService.addGoal(tournament.id, match.id, goal))}
          onUpdateGoal={(goalId, goal) =>
            thenReload(() => refereeService.updateGoal(tournament.id, match.id, goalId, goal))
          }
          onDeleteGoal={(goalId) => thenReload(() => refereeService.removeGoal(tournament.id, match.id, goalId))}
          onAddCard={(card) => thenReload(() => refereeService.addCard(tournament.id, match.id, card))}
          onUpdateCard={(cardId, card) =>
            thenReload(() => refereeService.updateCard(tournament.id, match.id, cardId, card))
          }
          onDeleteCard={(cardId) => thenReload(() => refereeService.removeCard(tournament.id, match.id, cardId))}
        />
      </section>
    </div>
  )
}
