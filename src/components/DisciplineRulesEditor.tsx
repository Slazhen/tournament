import type { DisciplineRules } from '../utils/discipline'
import { IconCard } from './icons'

/**
 * What a card costs a player, as a panel.
 *
 * Two questions, and they are asked separately because they are different
 * rules. A sending-off is about the card itself: the referee shows it and the
 * player misses the next match, or in the case of a blue does not. An
 * accumulation is about a count nobody is watching from the touchline — the
 * fifth booking of a season — and it needs a threshold before it means
 * anything.
 *
 * Every number is matches, and nought is a rule rather than an empty box: it
 * says this card costs the player nothing beyond the match it was shown in.
 * The panel says so, because a form where a nought reads as "not filled in
 * yet" is one nobody trusts.
 */

type Props = {
  rules: DisciplineRules
  onChange: (rules: DisciplineRules) => void
}

const FIELD =
  'w-20 px-2 py-1 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-center'

function Count({
  value,
  onChange,
  max,
  label,
}: {
  value: number
  onChange: (value: number) => void
  max: number
  label: string
}) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      value={value}
      aria-label={label}
      onChange={(event) => {
        const typed = Number(event.target.value)
        if (!Number.isFinite(typed)) return
        onChange(Math.min(Math.max(Math.trunc(typed), 0), max))
      }}
      className={FIELD}
    />
  )
}

const matches = (n: number) => (n === 1 ? 'match' : 'matches')

export default function DisciplineRulesEditor({ rules, onChange }: Props) {
  const set = (patch: Partial<DisciplineRules>) => onChange({ ...rules, ...patch })

  const yellowAccumulates = rules.yellowEvery > 0
  const blueAccumulates = rules.blueEvery > 0

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-medium mb-1">A card the referee shows</div>
        <p className="text-xs opacity-60 mb-3">
          How many of the club's next matches the player misses. Nought means the card costs him
          nothing beyond the match it was shown in.
        </p>
        <div className="space-y-2">
          {(
            [
              ['red', 'red', 'Red card'],
              ['second_yellow', 'secondYellow', 'Two bookings in a match'],
              ['blue', 'blue', 'Blue card'],
            ] as const
          ).map(([variant, key, label]) => (
            <div
              key={key}
              className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              <IconCard size={16} variant={variant} />
              <span className="flex-1 text-sm">{label}</span>
              <Count
                value={rules[key]}
                max={20}
                label={`Matches missed for a ${label.toLowerCase()}`}
                onChange={(value) => set({ [key]: value } as Partial<DisciplineRules>)}
              />
              <span className="w-16 text-xs opacity-60">{matches(rules[key])}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs opacity-60">
          A blue card sends the player off for the rest of that match whatever this says. Leaving it
          at nought is what makes it a blue card rather than a red one.
        </p>
      </div>

      <div>
        <div className="text-sm font-medium mb-1">Cards that add up</div>
        <p className="text-xs opacity-60 mb-3">
          A count kept across the whole competition. Reaching the number costs a suspension and
          starts the count again, so a season that suspends on the second booking suspends again on
          the fourth.
        </p>

        <div className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={yellowAccumulates}
                onChange={(event) => set({ yellowEvery: event.target.checked ? 3 : 0 })}
                className="accent-white/80"
              />
              <IconCard size={16} variant="yellow" />
              <span>Yellow cards add up</span>
            </label>
            {yellowAccumulates && (
              <div className="mt-3 space-y-2 pl-8 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="opacity-70">Every</span>
                  <Count
                    value={rules.yellowEvery}
                    max={50}
                    label="Yellow cards before a suspension"
                    onChange={(value) => set({ yellowEvery: Math.max(1, value) })}
                  />
                  <span className="opacity-70">yellow cards costs</span>
                  <Count
                    value={rules.yellowSuspension}
                    max={20}
                    label="Matches missed for accumulated yellows"
                    onChange={(value) => set({ yellowSuspension: value })}
                  />
                  <span className="opacity-70">{matches(rules.yellowSuspension)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="opacity-70">A second yellow adds</span>
                  <Count
                    value={rules.secondYellowCounts}
                    max={2}
                    label="Yellows added by a second yellow"
                    onChange={(value) => set({ secondYellowCounts: value })}
                  />
                  <span className="opacity-70">to that count</span>
                </div>
                <p className="text-xs opacity-60">
                  Nought is the usual rule: the player has already been sent off, and the count that
                  would suspend him again a week later is left alone.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={blueAccumulates}
                onChange={(event) => set({ blueEvery: event.target.checked ? 2 : 0 })}
                className="accent-white/80"
              />
              <IconCard size={16} variant="blue" />
              <span>Blue cards add up</span>
            </label>
            {blueAccumulates && (
              <div className="mt-3 flex flex-wrap items-center gap-2 pl-8 text-sm">
                <span className="opacity-70">Every</span>
                <Count
                  value={rules.blueEvery}
                  max={50}
                  label="Blue cards before a suspension"
                  onChange={(value) => set({ blueEvery: Math.max(1, value) })}
                />
                <span className="opacity-70">blue cards costs</span>
                <Count
                  value={rules.blueSuspension}
                  max={20}
                  label="Matches missed for accumulated blues"
                  onChange={(value) => set({ blueSuspension: value })}
                />
                <span className="opacity-70">{matches(rules.blueSuspension)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
