import { useState } from 'react'
import { useAppStore } from '../store'

function uid() {
  return Math.random().toString(36).slice(2)
}

export default function TeamsPage() {
  const teams = useAppStore((s) => s.teams)
  const addTeam = useAppStore((s) => s.addTeam)
  const removeTeam = useAppStore((s) => s.removeTeam)

  const [name, setName] = useState('FC Example')
  const [colorHex, setColorHex] = useState('#22d3ee')
  const [bulkCount, setBulkCount] = useState<number>(0)

  function createTeam() {
    if (!name.trim()) return
    addTeam({ id: uid(), name: name.trim(), colorHex })
    setName('')
  }

  function addBulkTeams() {
    const n = Math.max(0, Math.min(64, Math.floor(bulkCount)))
    if (n <= 0) return
    for (let i = 1; i <= n; i++) {
      addTeam({ id: uid(), name: `Team ${i}`, colorHex })
    }
    setBulkCount(0)
  }

  return (
    <div className="grid gap-6 place-items-center">
      <section className="glass rounded-xl p-6 w-full max-w-3xl text-center">
        <h2 className="text-xl font-semibold mb-3 tracking-wide">Add Team</h2>
        <div className="grid md:grid-cols-3 gap-3 text-left">
          <label className="grid gap-1">
            <span className="text-sm opacity-80">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="px-3 py-2 rounded-md bg-transparent border border-white/20" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm opacity-80">Color</span>
            <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="h-[42px] w-full rounded-md bg-transparent border border-white/20" />
          </label>
          <div className="flex items-end">
            <button onClick={createTeam} className="px-5 py-2.5 rounded-md glass w-full">Add</button>
          </div>
          <label className="grid gap-1 md:col-span-2">
            <span className="text-sm opacity-80">Add N teams (auto-named)</span>
            <input type="number" min={0} max={64} value={bulkCount} onChange={(e) => setBulkCount(Number(e.target.value))} className="px-3 py-2 rounded-md bg-transparent border border-white/20" />
          </label>
          <div className="flex items-end">
            <button onClick={addBulkTeams} className="px-5 py-2.5 rounded-md glass w-full">Add N</button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 w-full max-w-4xl">
        <h2 className="text-xl font-semibold text-center tracking-wide">Teams</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {Object.values(teams).length === 0 && (
            <div className="opacity-70">No teams yet.</div>
          )}
          {Object.values(teams).map((t) => (
            <article key={t.id} className="glass rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 rounded-full" style={{ background: t.colorHex }} />
                <div className="font-medium">{t.name}</div>
                <button onClick={() => removeTeam(t.id)} className="ml-auto px-3 py-1 rounded-md glass text-sm">Delete</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

