import { useMemo, useState } from 'react'
import { useAppStore } from '../store'
import type { Tournament } from '../types'
import { generateRoundRobinSchedule } from '../utils/schedule'

function uid() {
  return Math.random().toString(36).slice(2)
}

export default function TournamentsPage() {
  const tournaments = useAppStore((s) => s.tournaments)
  const addTournament = useAppStore((s) => s.addTournament)
  const removeTournament = useAppStore((s) => s.removeTournament)
  const teams = useAppStore((s) => s.teams)

  const [name, setName] = useState('New League')
  const [teamCount, setTeamCount] = useState(6)

  const teamOptions = useMemo(() => Object.values(teams), [teams])
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  function createTournament() {
    const selected = selectedIds.length > 1 ? selectedIds : teamOptions.slice(0, teamCount).map((t) => t.id)
    if (selected.length < 2) return
    const id = uid()
    const matches = generateRoundRobinSchedule(selected)
    const t: Tournament = {
      id,
      name,
      createdAtISO: new Date().toISOString(),
      teamIds: selected,
      matches,
    }
    addTournament(t)
    setName('New League')
  }

  return (
    <div className="grid gap-6 place-items-center">
      <section className="glass rounded-xl p-6 w-full max-w-2xl text-center">
        <h2 className="text-xl font-semibold mb-3 tracking-wide">Create Tournament</h2>
        <div className="grid gap-3 md:grid-cols-3 text-left">
          <label className="grid gap-1 md:col-span-2">
            <span className="text-sm opacity-80">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="px-3 py-2 rounded-md bg-transparent border border-white/20" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm opacity-80">Team count (fallback)</span>
            <input type="number" min={2} value={teamCount} onChange={(e) => setTeamCount(Number(e.target.value))} className="px-3 py-2 rounded-md bg-transparent border border-white/20" />
          </label>
          <div className="grid gap-1 md:col-span-3">
            <span className="text-sm opacity-80">Select teams</span>
            <div className="flex flex-wrap gap-2 justify-center">
              {teamOptions.map((t) => (
                <button key={t.id} onClick={() => setSelectedIds((prev) => prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id])} className={`px-3 py-1 rounded-full border border-white/20 ${selectedIds.includes(t.id) ? 'bg-white/10' : 'bg-transparent'}`}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <button onClick={createTournament} className="px-5 py-2.5 rounded-md glass">Create</button>
        </div>
      </section>

      <section className="grid gap-3 w-full max-w-4xl">
        <h2 className="text-xl font-semibold text-center tracking-wide">Your Tournaments</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {Object.values(tournaments).length === 0 && (
            <div className="opacity-70">No tournaments yet.</div>
          )}
          {Object.values(tournaments).map((t) => (
            <article key={t.id} className="glass rounded-xl p-4 grid gap-2">
              <div className="flex items-center gap-2">
                <a className="font-medium" href={`/tournaments/${t.id}`}>{t.name}</a>
                <span className="text-xs opacity-60 ml-auto">{new Date(t.createdAtISO).toLocaleString()}</span>
              </div>
              <div className="text-sm opacity-80">{t.teamIds.length} teams • {t.matches.length} matches</div>
              <div className="text-xs opacity-70">Rounds: {Math.max(0, ...t.matches.map((m) => m.round ?? 0)) + 1}</div>
              <div className="flex gap-2 mt-1">
                <a href={`/tournaments/${t.id}`} className="px-3 py-1 rounded-md glass text-sm">Open</a>
                <button onClick={() => removeTournament(t.id)} className="px-3 py-1 rounded-md glass text-sm">Delete</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

