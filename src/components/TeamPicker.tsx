import { useMemo, useState } from 'react'
import type { Team, Tournament } from '../types'
import { cdnUrl } from '../utils/images'

type TeamPickerProps = {
  teams: Team[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  /** Earlier tournaments, offered as a starting line-up. */
  previousTournaments?: Tournament[]
}

/**
 * Choosing which teams take part.
 *
 * This was a plain checkbox list in whatever order the database returned, which
 * is unusable once an organiser has thirty-odd teams. Here they are sorted,
 * searchable, and a previous tournament's line-up can be copied in one click —
 * most seasons are the same clubs as last time.
 *
 * The order teams are selected in is preserved, because knockout seeding uses it.
 */
export default function TeamPicker({
  teams,
  selectedIds,
  onChange,
  previousTournaments = [],
}: TeamPickerProps) {
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return [...teams]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((team) => !needle || team.name.toLowerCase().includes(needle))
  }, [teams, search])

  const toggle = (teamId: string) => {
    onChange(
      selectedIds.includes(teamId)
        ? selectedIds.filter((id) => id !== teamId)
        : [...selectedIds, teamId],
    )
  }

  const copyFrom = (tournamentId: string) => {
    const source = previousTournaments.find((tournament) => tournament.id === tournamentId)
    if (!source) return
    // Only teams that still exist.
    const known = new Set(teams.map((team) => team.id))
    onChange(source.teamIds.filter((id) => known.has(id)))
  }

  const reusable = previousTournaments.filter((tournament) => tournament.teamIds?.length >= 2)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search teams..."
          className="flex-1 min-w-[12rem] px-3 py-2 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
        />
        <button
          type="button"
          onClick={() => onChange(visible.map((team) => team.id))}
          className="px-3 py-2 rounded-md glass text-sm hover:bg-white/10 transition-all"
        >
          Select all{search ? ' shown' : ''}
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          disabled={selectedIds.length === 0}
          className="px-3 py-2 rounded-md glass text-sm hover:bg-white/10 transition-all disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      {reusable.length > 0 && (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="opacity-70">Same teams as</span>
          <select
            defaultValue=""
            onChange={(event) => {
              copyFrom(event.target.value)
              event.target.value = ''
            }}
            className="px-2 py-1.5 rounded-md bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
          >
            <option value="" disabled>
              choose a tournament...
            </option>
            {reusable.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.name} ({tournament.teamIds.length})
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-1 max-h-56 overflow-y-auto p-2 rounded-lg border border-white/10 bg-black/20">
        {visible.map((team) => {
          const index = selectedIds.indexOf(team.id)
          const isSelected = index !== -1
          return (
            <label
              key={team.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                isSelected ? 'bg-blue-500/15' : 'hover:bg-white/5'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(team.id)}
                className="rounded"
              />
              {team.logo ? (
                <img
                  loading="lazy"
                  decoding="async"
                  src={cdnUrl(team.logo)}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover shrink-0"
                />
              ) : (
                <span className="w-5 h-5 rounded-full bg-white/10 shrink-0" />
              )}
              <span className="text-sm truncate">{team.name}</span>
              {isSelected && <span className="ml-auto text-[10px] opacity-50">#{index + 1}</span>}
            </label>
          )
        })}

        {visible.length === 0 && (
          <p className="col-span-full text-sm opacity-60 text-center py-4">
            {teams.length === 0 ? 'No teams yet — create some first.' : 'No team matches that search.'}
          </p>
        )}
      </div>
    </div>
  )
}
