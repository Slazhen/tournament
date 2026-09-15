import type { TiebreakerKey } from '../utils/standings'
import { IconArrowUp, IconArrowDown } from './icons'

const TIEBREAKER_LABELS: Record<TiebreakerKey, string> = {
  headToHead: 'The matches between them',
  goalDifference: 'Goal difference',
  goalsFor: 'Goals scored',
  wins: 'Most wins',
}

const ALL_TIEBREAKERS: TiebreakerKey[] = ['headToHead', 'goalDifference', 'goalsFor', 'wins']

type TableRulesEditorProps = {
  scoring: { win: number; draw: number; loss: number }
  onScoringChange: (scoring: { win: number; draw: number; loss: number }) => void
  tiebreakers: TiebreakerKey[]
  onTiebreakersChange: (tiebreakers: TiebreakerKey[]) => void
}

/**
 * The points a result is worth and what separates two clubs level on them.
 *
 * Both are the season's own, and both start at what nearly every competition
 * here plays by, so an organiser who reads this panel and changes nothing has
 * made the same choice as one who never opened it.
 *
 * Points are not in the list of tiebreakers and cannot be moved out of first
 * place: they are the table, and a list they could be dragged out of is a list
 * somebody can arrange into nonsense.
 */
export default function TableRulesEditor({
  scoring,
  onScoringChange,
  tiebreakers,
  onTiebreakersChange,
}: TableRulesEditorProps) {
  const unused = ALL_TIEBREAKERS.filter((key) => !tiebreakers.includes(key))

  const move = (index: number, by: number) => {
    const next = [...tiebreakers]
    const to = index + by
    if (to < 0 || to >= next.length) return
    ;[next[index], next[to]] = [next[to], next[index]]
    onTiebreakersChange(next)
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm font-medium mb-2">Points</div>
        <div className="grid gap-3 sm:grid-cols-3">
          {(['win', 'draw', 'loss'] as const).map((outcome) => (
            <label key={outcome} className="text-sm">
              <span className="opacity-70 capitalize">{outcome}</span>
              <input
                type="number"
                min={-10}
                max={10}
                value={scoring[outcome]}
                onChange={(event) =>
                  onScoringChange({ ...scoring, [outcome]: Number(event.target.value) || 0 })
                }
                className="mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none"
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-medium mb-1">Clubs level on points are separated by</div>
        <p className="text-xs opacity-60 mb-2">
          In this order. Three clubs level are ranked by a table of the matches among the three,
          and clubs that have not met fall through to the next line.
        </p>
        <ol className="space-y-2">
          {tiebreakers.map((key, index) => (
            <li
              key={key}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              <span className="w-5 text-xs opacity-50">{index + 1}</span>
              <span className="flex-1 text-sm">{TIEBREAKER_LABELS[key]}</span>
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Move ${TIEBREAKER_LABELS[key]} up`}
                className="p-1 rounded opacity-70 hover:opacity-100 hover:bg-white/10 disabled:opacity-25"
              >
                <IconArrowUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === tiebreakers.length - 1}
                aria-label={`Move ${TIEBREAKER_LABELS[key]} down`}
                className="p-1 rounded opacity-70 hover:opacity-100 hover:bg-white/10 disabled:opacity-25"
              >
                <IconArrowDown size={14} />
              </button>
              <button
                type="button"
                onClick={() => onTiebreakersChange(tiebreakers.filter((other) => other !== key))}
                disabled={tiebreakers.length === 1}
                className="text-xs opacity-60 hover:opacity-100 disabled:opacity-25"
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
        {unused.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="opacity-60">Add:</span>
            {unused.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onTiebreakersChange([...tiebreakers, key])}
                className="px-2 py-1 rounded-md border border-white/15 bg-white/[0.03] hover:bg-white/10"
              >
                {TIEBREAKER_LABELS[key]}
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs opacity-60">
          Clubs nothing separates hold the order they were entered in.
        </p>
      </div>
    </div>
  )
}
