import { FORMAT_OPTIONS, planSchedule } from '../utils/formats'
import type { FormatOption, FormatIconName } from '../utils/formats'
import type { ComponentType } from 'react'
import {
  IconTable,
  IconRepeat,
  IconBracket,
  IconMedal,
  IconGroups,
  IconRounds,
  IconRest,
  IconTools,
} from './icons'

/** The drawing for each format, in place of the emoji these cards used to show. */
const FORMAT_ICONS: Record<FormatIconName, ComponentType<{ size?: number }>> = {
  table: IconTable,
  repeat: IconRepeat,
  bracket: IconBracket,
  medal: IconMedal,
  groups: IconGroups,
  rounds: IconRounds,
  rest: IconRest,
  tools: IconTools,
}

type FormatPickerProps = {
  value: string
  onChange: (formatId: string) => void
  teamCount: number
  qualifiers?: number
}

/**
 * How the tournament will be played, chosen from cards rather than a dropdown.
 *
 * This decision generates the entire fixture list and cannot be changed
 * afterwards without deleting the tournament, so it deserves more room than a
 * <select> hidden behind an "advanced options" button — which is where it used
 * to live.
 */
export default function FormatPicker({ value, onChange, teamCount, qualifiers }: FormatPickerProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {FORMAT_OPTIONS.map((option) => (
        <FormatCard
          key={option.id}
          option={option}
          selected={option.id === value}
          teamCount={teamCount}
          qualifiers={qualifiers}
          onSelect={() => onChange(option.id)}
        />
      ))}
    </div>
  )
}

function FormatCard({
  option,
  selected,
  teamCount,
  qualifiers,
  onSelect,
}: {
  option: FormatOption
  selected: boolean
  teamCount: number
  qualifiers?: number
  onSelect: () => void
}) {
  const enoughTeams = teamCount >= option.minTeams
  const plan = planSchedule(option, teamCount, qualifiers)
  const Icon = FORMAT_ICONS[option.icon]

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`
        text-left rounded-xl p-4 border transition-all duration-150
        ${
          selected
            ? 'border-blue-400/70 bg-blue-500/10 shadow-[0_0_0_1px_rgba(96,165,250,0.35)]'
            : 'border-white/10 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.06]'
        }
      `}
    >
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border ${
            selected
              ? 'bg-blue-500/15 border-blue-400/40 text-blue-200'
              : 'bg-white/5 border-white/10 text-white/70'
          }`}
        >
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{option.title}</span>
            {option.needsSetup && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/10 opacity-70">
                needs setup
              </span>
            )}
          </div>
          <p className="text-sm opacity-70">{option.tagline}</p>

          <ul className="mt-2 space-y-0.5 text-xs opacity-60">
            {option.points.map((point) => (
              <li key={point}>— {point}</li>
            ))}
          </ul>

          {/* What this choice produces for the teams picked so far. */}
          <p className={`mt-2 text-xs ${enoughTeams ? 'text-blue-300' : 'text-amber-300/80'}`}>
            {teamCount === 0 ? 'Pick teams to see the fixture count' : plan.summary}
          </p>
        </div>
      </div>
    </button>
  )
}
