import { useAppStore } from '../store'
import { format } from 'date-fns'

export default function CalendarPage() {
  const tournaments = useAppStore((s) => s.tournaments)
  const teams = useAppStore((s) => s.teams)

  const matches = Object.values(tournaments).flatMap((t) => t.matches.map((m) => ({ ...m, tournamentName: t.name })))
  const dated = matches.filter((m) => m.dateISO)
  const undated = matches.filter((m) => !m.dateISO)

  return (
    <div className="grid gap-6 place-items-center">
      <section className="grid gap-2 w-full max-w-3xl">
        <h2 className="text-lg font-semibold text-center tracking-wide">Scheduled Matches</h2>
        {dated.length === 0 && <div className="opacity-70">No scheduled matches.</div>}
        <div className="grid gap-3">
          {dated.map((m) => (
            <article key={m.id} className="glass rounded-xl p-3">
              <div className="text-sm opacity-80">{m.tournamentName}</div>
              <div className="font-medium">
                {teams[m.homeTeamId]?.name ?? 'Home'} vs {teams[m.awayTeamId]?.name ?? 'Away'}
              </div>
              <div className="text-sm opacity-70">{format(new Date(m.dateISO!), 'PPpp')}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-2 w-full max-w-3xl">
        <h2 className="text-lg font-semibold text-center tracking-wide">Unscheduled Matches</h2>
        {undated.length === 0 && <div className="opacity-70">All matches scheduled.</div>}
        <div className="grid gap-2">
          {undated.map((m) => (
            <div key={m.id} className="glass rounded-xl p-3 text-sm">
              Round {m.round! + 1}: {teams[m.homeTeamId]?.name ?? 'Home'} vs {teams[m.awayTeamId]?.name ?? 'Away'}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

