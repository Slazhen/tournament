import { LEAGUE_FINALS } from '../utils/formats'
import type { SchemeId, SchemeSettings as Settings } from '../utils/formats'
import { playoffTiers } from '../utils/standings'
import { IconWarning } from './icons'

type SchemeSettingsProps = {
  scheme: SchemeId
  settings: Settings
  onChange: (settings: Settings) => void
  teamCount: number
}

const selectClass =
  'mt-1 w-full px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none'

/**
 * Everything the chosen scheme still needs, and nothing the others would.
 *
 * These settings used to sit three sections below the format cards, under the
 * logo, the clubs and the schedule, in two coloured boxes that looked like
 * nothing else in the application. They belong directly under the choice they
 * qualify.
 */
export default function SchemeSettings({
  scheme,
  settings,
  onChange,
  teamCount,
}: SchemeSettingsProps) {
  if (scheme === 'knockout') {
    return (
      <p className="text-sm opacity-70">
        The bracket is seeded by the order the clubs are picked, and an odd number gives byes in
        the first round.
      </p>
    )
  }

  if (scheme === 'groups') {
    return <GroupSettings settings={settings} onChange={onChange} teamCount={teamCount} />
  }

  const takesQualifiers = settings.finals === 'playoff' || settings.finals === 'custom'

  return (
    <div className="space-y-5">
      <label className="block text-sm max-w-xs">
        <span className="opacity-70">How many times everyone plays everyone</span>
        <select
          value={settings.legs}
          onChange={(event) => onChange({ ...settings, legs: Number(event.target.value) })}
          className={selectClass}
        >
          <option value={1}>Once</option>
          <option value={2}>Twice — home and away</option>
          <option value={3}>Three times</option>
          <option value={4}>Four times</option>
        </select>
      </label>

      <div>
        <div className="text-sm opacity-70 mb-2">After the league</div>
        <div className="space-y-2">
          {LEAGUE_FINALS.map((option) => (
            <label
              key={option.id}
              className={`flex gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                settings.finals === option.id
                  ? 'border-blue-400/60 bg-blue-500/10'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
              }`}
            >
              <input
                type="radio"
                name="finals"
                checked={settings.finals === option.id}
                onChange={() => onChange({ ...settings, finals: option.id })}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{option.title}</span>
                <span className="block text-xs opacity-60">{option.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {takesQualifiers && (
        <label className="block text-sm max-w-xs">
          <span className="opacity-70">Clubs in the finals</span>
          <input
            type="number"
            min={2}
            max={Math.max(2, teamCount)}
            value={settings.qualifiers}
            onChange={(event) =>
              onChange({ ...settings, qualifiers: Number(event.target.value) || 2 })
            }
            className={selectClass}
          />
          <span className="mt-1 block text-xs opacity-60">
            The bracket is drawn from the table, and the pairings are filled in by hand.
          </span>
        </label>
      )}
    </div>
  )
}

function GroupSettings({
  settings,
  onChange,
  teamCount,
}: {
  settings: Settings
  onChange: (settings: Settings) => void
  teamCount: number
}) {
  const groups = settings.groups
  const size = groups.teamsPerGroup
  const through = groups.qualifiersPerGroup ?? 2
  const second = groups.secondDivisionPerGroup ?? 2
  const third = groups.thirdDivisionPerGroup ?? 0
  const tiers = playoffTiers(groups)

  const set = (next: Partial<typeof groups>) => onChange({ ...settings, groups: { ...groups, ...next } })

  /**
   * Shrinking a group has to shrink what comes out of it: a cut that reaches
   * past the last place is a bracket with slots nobody can qualify for.
   *
   * It returns the whole group config rather than saving it, because changing
   * the number of groups changes the size in the same breath — and two saves
   * built from the same copy of the state lose whichever went first.
   */
  const resized = (base: typeof groups, teamsPerGroup: number): typeof groups => {
    const cut = Math.min(base.qualifiersPerGroup ?? 2, teamsPerGroup)
    const nextSecond = Math.min(base.secondDivisionPerGroup ?? 2, Math.max(0, teamsPerGroup - cut))
    return {
      ...base,
      teamsPerGroup,
      qualifiersPerGroup: cut,
      secondDivisionPerGroup: nextSecond,
      thirdDivisionPerGroup: Math.min(
        base.thirdDivisionPerGroup ?? 0,
        Math.max(0, teamsPerGroup - cut - nextSecond),
      ),
    }
  }

  const needed = groups.numberOfGroups * size

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="opacity-70">Groups</span>
          <select
            value={groups.numberOfGroups}
            onChange={(event) => {
              const numberOfGroups = Number(event.target.value)
              const base = { ...groups, numberOfGroups }
              // The obvious size is the one that uses every club picked so far.
              const even = teamCount > 0 ? Math.floor(teamCount / numberOfGroups) : 0
              onChange({
                ...settings,
                groups: even >= 3 && even <= 8 ? resized(base, even) : base,
              })
            }}
            className={selectClass}
          >
            {[2, 3, 4, 5, 6, 8].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="opacity-70">Clubs in each</span>
          <select
            value={size}
            onChange={(event) =>
              onChange({ ...settings, groups: resized(groups, Number(event.target.value)) })
            }
            className={selectClass}
          >
            {[3, 4, 5, 6, 7, 8].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="opacity-70">Rounds in the group</span>
          <select
            value={groups.groupRounds}
            onChange={(event) => set({ groupRounds: Number(event.target.value) })}
            className={selectClass}
          >
            <option value={1}>Once</option>
            <option value={2}>Twice — home and away</option>
          </select>
        </label>
      </div>

      <div>
        <div className="text-sm opacity-70 mb-1">Who goes through</div>
        <p className="text-xs opacity-60 mb-2">
          One bracket and the clubs in it are simply qualified. Add a second or a third and they
          become the gold, silver and bronze playoffs, each taking the places under the one above.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="opacity-70">
              Into the {(tiers[0]?.name ?? 'Playoffs').toLowerCase()}
            </span>
            <select
              value={through}
              onChange={(event) => {
                const cut = Number(event.target.value)
                const nextSecond = Math.min(second, Math.max(0, size - cut))
                set({
                  qualifiersPerGroup: cut,
                  secondDivisionPerGroup: nextSecond,
                  thirdDivisionPerGroup: Math.min(third, Math.max(0, size - cut - nextSecond)),
                })
              }}
              className={selectClass}
            >
              {Array.from({ length: size }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>
                  Top {count} of each group
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="opacity-70">Silver playoffs</span>
            <select
              value={second}
              onChange={(event) => {
                const nextSecond = Number(event.target.value)
                set({
                  secondDivisionPerGroup: nextSecond,
                  thirdDivisionPerGroup: Math.min(third, Math.max(0, size - through - nextSecond)),
                })
              }}
              className={selectClass}
            >
              <option value={0}>No second bracket</option>
              {Array.from({ length: Math.max(0, size - through) }, (_, index) => index + 1).map(
                (count) => (
                  <option key={count} value={count}>
                    Next {count} of each group
                  </option>
                ),
              )}
            </select>
          </label>
          {second > 0 && (
            <label className="block text-sm">
              <span className="opacity-70">Bronze playoffs</span>
              <select
                value={third}
                onChange={(event) => set({ thirdDivisionPerGroup: Number(event.target.value) })}
                className={selectClass}
              >
                <option value={0}>No third bracket</option>
                {Array.from(
                  { length: Math.max(0, size - through - second) },
                  (_, index) => index + 1,
                ).map((count) => (
                  <option key={count} value={count}>
                    Next {count} of each group
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {teamCount > 0 && teamCount !== needed && (
        <p
          className={`inline-flex items-center gap-1.5 text-sm ${
            teamCount < needed ? 'text-amber-300' : 'opacity-70'
          }`}
        >
          {teamCount < needed && <IconWarning size={14} />}
          {teamCount < needed
            ? `${groups.numberOfGroups} groups of ${size} need ${needed} clubs — ${needed - teamCount} short.`
            : `${teamCount - needed} of the clubs picked will not be in a group.`}
        </p>
      )}
    </div>
  )
}
