import { Link } from 'react-router-dom'
import type { Match, Team } from '../types'
import { headerColor, inkOn, shade } from '../utils/crest'
import { isPlayed } from '../utils/matches'
import { publicTeamUrl } from '../utils/teams'
import { cdnUrl } from '../utils/images'

/**
 * The two clubs and the score, as one plate split down the middle.
 *
 * It is the public club header applied twice: each half is painted in its
 * club's own colour, read from the crest at upload time rather than from the
 * colours somebody typed into a form, and carries that crest blown up and
 * dimmed behind it — `utils/crest.ts` covers where the colour comes from and
 * why it cannot be read later.
 *
 * Both gradients run from light at the outer edge to dark at the seam, so the
 * score sits on the darkest part of both halves whatever the two clubs wear.
 * That is also what keeps two clubs in near-identical colours from reading as
 * one plate: the seam is a hard line between two dark ends, not a fade.
 */
export default function MatchScoreboard({
  match,
  homeTeam,
  awayTeam,
  status,
  tournamentId,
}: {
  match: Match
  homeTeam: Team
  awayTeam: Team
  status: 'scheduled' | 'live' | 'finished'
  /** Carried into the club links so the club page opens this competition's squad. */
  tournamentId?: string
}) {
  const played = isPlayed(match)

  return (
    <section className="relative w-full rounded-2xl overflow-hidden border border-white/10">
      <Half team={homeTeam} side="home" />
      <Half team={awayTeam} side="away" />

      {/* The seam. Two clubs in the same colour would otherwise meet in one
          unbroken field, and the fixture would read as one club. */}
      <div aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-white/25" />

      {/* Something for the score to sit on, whatever the two colours are. */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1/2 sm:w-1/3"
        style={{
          background:
            'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.45) 30%, rgba(0,0,0,.45) 70%, rgba(0,0,0,0) 100%)',
        }}
      />

      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-1 sm:gap-4 px-3 py-6 sm:px-8 sm:py-9">
        <ClubMark team={homeTeam} align="end" tournamentId={tournamentId} />

        <div className="text-center px-1 sm:px-4">
          <div className="text-4xl sm:text-6xl font-bold tabular-nums text-white drop-shadow-lg leading-none">
            {played ? `${match.homeGoals} : ${match.awayGoals}` : '– : –'}
          </div>
          <div
            className={`mt-2 text-[10px] sm:text-xs uppercase tracking-widest font-medium ${
              status === 'finished'
                ? 'text-green-300'
                : status === 'live'
                  ? 'text-yellow-300'
                  : 'text-blue-200'
            }`}
          >
            {status === 'finished' ? 'Full time' : status === 'live' ? 'In progress' : 'Scheduled'}
          </div>
        </div>

        <ClubMark team={awayTeam} align="start" tournamentId={tournamentId} />
      </div>
    </section>
  )
}

/** One club's half of the plate: its colour, and its crest as the ground. */
function Half({ team, side }: { team: Team; side: 'home' | 'away' }) {
  const base = headerColor(team)
  const gradient = `linear-gradient(${side === 'home' ? '90deg' : '270deg'}, ${shade(base, 0.08)} 0%, ${shade(base, -0.08)} 45%, ${shade(base, -0.45)} 100%)`

  return (
    <div
      aria-hidden
      className={`absolute inset-y-0 w-1/2 ${side === 'home' ? 'left-0' : 'right-0'}`}
      style={{ background: gradient }}
    >
      {/* The crest at the outer edge, running off it. The radial mask fades the
          picture into the colour: a crest uploaded with its background still on
          it — a JPEG, or a PNG on a white plate — otherwise shows here as a pale
          rectangle rather than a badge, which is also why such a crest is dimmed
          further and drained of its colour. */}
      {team.logo && (
        <div
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 h-[220px] w-[220px] sm:h-[300px] sm:w-[300px] ${
            side === 'home' ? '-left-16' : '-right-16'
          }`}
          style={{
            opacity: team.crestOpaqueBackground ? 0.12 : 0.18,
            filter: team.crestOpaqueBackground ? 'grayscale(1) contrast(0.8)' : undefined,
            maskImage: 'radial-gradient(closest-side, #000 52%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(closest-side, #000 52%, transparent 100%)',
          }}
        >
          <img decoding="async" src={cdnUrl(team.logo)} alt="" className="w-full h-full object-contain" />
        </div>
      )}
    </div>
  )
}

/** The badge and the name, on the side of the seam their club is painted on. */
function ClubMark({
  team,
  align,
  tournamentId,
}: {
  team: Team
  align: 'start' | 'end'
  tournamentId?: string
}) {
  const ink = inkOn(shade(headerColor(team), -0.08))

  return (
    <div
      className={`min-w-0 flex flex-col items-center gap-2 sm:gap-3 ${
        align === 'end' ? 'sm:items-end' : 'sm:items-start'
      }`}
    >
      {/* `object-contain`: a crest that is not square loses its edges to a box
          it was never drawn for under `object-cover`. */}
      <div className="w-14 h-14 sm:w-20 sm:h-20 shrink-0 rounded-2xl bg-white/20 backdrop-blur-sm shadow-2xl p-1.5 flex items-center justify-center">
        {team.logo ? (
          <img
            decoding="async"
            src={cdnUrl(team.logo)}
            alt={`${team.name} crest`}
            className="w-full h-full object-contain rounded-xl"
          />
        ) : (
          <span className="text-2xl font-bold" style={{ color: ink }}>
            {team.name.charAt(0)}
          </span>
        )}
      </div>

      <Link
        to={publicTeamUrl(team.id, tournamentId)}
        className={`text-sm sm:text-2xl font-bold leading-tight drop-shadow-lg hover:opacity-80 transition-opacity text-center ${
          align === 'end' ? 'sm:text-right' : 'sm:text-left'
        }`}
        style={{ color: ink }}
      >
        {team.name}
      </Link>
    </div>
  )
}
