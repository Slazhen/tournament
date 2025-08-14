import { useParams } from 'react-router-dom'
import { useAppStore } from '../store'
import { useMemo } from 'react'

export default function TournamentPage() {
  const { id } = useParams()
  const tournament = useAppStore((s) => (id ? s.tournaments[id] : undefined))
  const updateTournament = useAppStore((s) => s.updateTournament)
  const teams = useAppStore((s) => s.teams)

  const rounds = useMemo(() => {
    if (!tournament) return [] as { round: number; matchIds: string[] }[]
    const groups: Record<number, string[]> = {}
    for (const m of tournament.matches) {
      const r = m.round ?? 0
      groups[r] = groups[r] || []
      groups[r].push(m.id)
    }
    return Object.entries(groups)
      .map(([r, ids]) => ({ round: Number(r), matchIds: ids }))
      .sort((a, b) => a.round - b.round)
  }, [tournament])

  if (!tournament) return <div className="opacity-70">Tournament not found.</div>

  function setScore(mid: string, homeGoals: number, awayGoals: number) {
    if (!tournament) return
    const matches = tournament.matches.map((m) => (m.id === mid ? { ...m, homeGoals: isNaN(homeGoals) ? undefined : homeGoals, awayGoals: isNaN(awayGoals) ? undefined : awayGoals } : m))
    updateTournament({ ...tournament, matches })
  }

  function setDate(mid: string, dateISO: string) {
    if (!tournament) return
    const matches = tournament.matches.map((m) => (m.id === mid ? { ...m, dateISO } : m))
    updateTournament({ ...tournament, matches })
  }

  const table = useMemo(() => {
    const stats: Record<string, { p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }> = {}
    for (const tid of tournament.teamIds) {
      stats[tid] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
    }
    for (const m of tournament.matches) {
      if (m.homeGoals == null || m.awayGoals == null) continue
      const a = stats[m.homeTeamId]
      const b = stats[m.awayTeamId]
      a.p++; b.p++
      a.gf += m.homeGoals; a.ga += m.awayGoals
      b.gf += m.awayGoals; b.ga += m.homeGoals
      if (m.homeGoals > m.awayGoals) { a.w++; b.l++; a.pts += 3 }
      else if (m.homeGoals < m.awayGoals) { b.w++; a.l++; b.pts += 3 }
      else { a.d++; b.d++; a.pts++; b.pts++ }
    }
    return Object.entries(stats).map(([id, s]) => ({ id, ...s }))
      .sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf)
  }, [tournament])

  return (
    <div className="grid gap-6 place-items-center">
      <section className="glass rounded-xl p-6 w-full max-w-3xl text-center">
        <h1 className="text-xl font-semibold">{tournament.name}</h1>
        <div className="text-sm opacity-70">{tournament.teamIds.length} teams • {tournament.matches.length} matches</div>
      </section>

      <section className="glass rounded-xl p-6 w-full max-w-4xl">
        <h2 className="text-lg font-semibold mb-2 text-center tracking-wide">Table</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="opacity-70 text-left">
              <tr>
                <th className="py-2 pr-3">Team</th>
                <th className="py-2 pr-3">P</th>
                <th className="py-2 pr-3">W</th>
                <th className="py-2 pr-3">D</th>
                <th className="py-2 pr-3">L</th>
                <th className="py-2 pr-3">GF</th>
                <th className="py-2 pr-3">GA</th>
                <th className="py-2 pr-3">Pts</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row) => (
                <tr key={row.id} className="border-t border-white/10">
                  <td className="py-2 pr-3 flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full inline-block" style={{ background: teams[row.id]?.colorHex }} />
                    {teams[row.id]?.name ?? row.id}
                  </td>
                  <td className="py-2 pr-3">{row.p}</td>
                  <td className="py-2 pr-3">{row.w}</td>
                  <td className="py-2 pr-3">{row.d}</td>
                  <td className="py-2 pr-3">{row.l}</td>
                  <td className="py-2 pr-3">{row.gf}</td>
                  <td className="py-2 pr-3">{row.ga}</td>
                  <td className="py-2 pr-3 font-semibold">{row.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 w-full max-w-3xl">
        <h2 className="text-lg font-semibold text-center tracking-wide">Fixtures</h2>
        {rounds.map((r) => (
          <div key={r.round} className="glass rounded-xl p-4 grid gap-2">
            <div className="font-medium">Round {r.round + 1}</div>
            {r.matchIds.map((mid) => {
              const m = tournament.matches.find((x) => x.id === mid)!
              return (
                <div key={mid} className="grid md:grid-cols-4 gap-2 items-center">
                  <div className="md:col-span-2">
                    {teams[m.homeTeamId]?.name ?? 'Home'} vs {teams[m.awayTeamId]?.name ?? 'Away'}
                  </div>
                  <div className="flex gap-2 items-center">
                    <input inputMode="numeric" pattern="[0-9]*" className="w-14 px-2 py-1 rounded-md bg-transparent border border-white/20" value={m.homeGoals ?? ''} onChange={(e) => setScore(mid, e.target.value === '' ? NaN : Number(e.target.value), m.awayGoals ?? NaN)} />
                    <span>:</span>
                    <input inputMode="numeric" pattern="[0-9]*" className="w-14 px-2 py-1 rounded-md bg-transparent border border-white/20" value={m.awayGoals ?? ''} onChange={(e) => setScore(mid, m.homeGoals ?? NaN, e.target.value === '' ? NaN : Number(e.target.value))} />
                  </div>
                  <div>
                    <input type="datetime-local" className="px-2 py-1 rounded-md bg-transparent border border-white/20 w-full" value={m.dateISO ? new Date(m.dateISO).toISOString().slice(0,16) : ''} onChange={(e) => setDate(mid, new Date(e.target.value).toISOString())} />
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </section>
    </div>
  )
}

