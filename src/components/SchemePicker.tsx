import { SCHEMES } from '../utils/formats'
import type { Scheme, SchemeId, FormatIconName } from '../utils/formats'
import type { ComponentType } from 'react'
import { IconTable, IconBracket, IconGroups, IconRepeat, IconMedal, IconRounds, IconRest, IconTools } from './icons'

/** The drawing for each scheme, in place of the emoji these cards used to show. */
const SCHEME_ICONS: Record<FormatIconName, ComponentType<{ size?: number }>> = {
  table: IconTable,
  repeat: IconRepeat,
  bracket: IconBracket,
  medal: IconMedal,
  groups: IconGroups,
  rounds: IconRounds,
  rest: IconRest,
  tools: IconTools,
}

type SchemePickerProps = {
  value: SchemeId
  onChange: (scheme: SchemeId) => void
  teamCount: number
}

/**
 * How the competition is played, asked first and asked once.
 *
 * Three cards and no settings on them. What the fixture list will actually come
 * to is not on a card either: it depends on clubs that have not been picked
 * yet, and every card saying "pick teams to see the fixture count" taught the
 * reader nothing. The count belongs in the summary above the create button,
 * where the clubs are already known.
 */
export default function SchemePicker({ value, onChange, teamCount }: SchemePickerProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {SCHEMES.map((scheme) => (
        <SchemeCard
          key={scheme.id}
          scheme={scheme}
          selected={scheme.id === value}
          teamCount={teamCount}
          onSelect={() => onChange(scheme.id)}
        />
      ))}
    </div>
  )
}

function SchemeCard({
  scheme,
  selected,
  teamCount,
  onSelect,
}: {
  scheme: Scheme
  selected: boolean
  teamCount: number
  onSelect: () => void
}) {
  const Icon = SCHEME_ICONS[scheme.icon]
  const short = teamCount > 0 && teamCount < scheme.minTeams

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`text-left rounded-xl p-4 border transition-all duration-150 ${
        selected
          ? 'border-blue-400/70 bg-blue-500/10 shadow-[0_0_0_1px_rgba(96,165,250,0.35)]'
          : 'border-white/10 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.06]'
      }`}
    >
      <span
        className={`inline-flex w-9 h-9 rounded-lg items-center justify-center border mb-3 ${
          selected
            ? 'bg-blue-500/15 border-blue-400/40 text-blue-200'
            : 'bg-white/5 border-white/10 text-white/70'
        }`}
      >
        <Icon size={20} />
      </span>
      <div className="font-semibold">{scheme.title}</div>
      <p className="text-sm opacity-70">{scheme.tagline}</p>
      <ul className="mt-2 space-y-0.5 text-xs opacity-60">
        {scheme.points.map((point) => (
          <li key={point}>— {point}</li>
        ))}
      </ul>
      {short && (
        <p className="mt-2 text-xs text-amber-300/80">
          Needs at least {scheme.minTeams} clubs
        </p>
      )}
    </button>
  )
}
