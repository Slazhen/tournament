import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { clubService, playerService, uploadImage } from '../lib/data'
import type { Player, Team, Tournament } from '../types'
import { useAuth } from '../contexts/AuthContext'
import PhotoUploader from '../components/PhotoUploader'
import { allMatches, recordOf } from '../utils/matches'
import { seasonLabel, seriesName } from '../utils/seasons'
import { IconArrowLeft, IconUser } from '../components/icons'

/**
 * One player, as the club that signed them sees it.
 *
 * The squad list edits a name and a number in place, which is the right shape
 * for a correction and the wrong one for everything else a club knows about a
 * player. This page is where the rest of it lives — the photograph, how tall
 * they are, which foot, when they were born — and where their record across the
 * club's competitions is read back to them.
 *
 * It reads the same `/manager/overview` the club page does rather than a route
 * of its own: the squad is already in that answer, and a second endpoint would
 * be a second permission check to get wrong.
 */

/** What the picker holds: a foot, or nothing said. */
type Foot = NonNullable<Player['preferredFoot']> | ''

const FEET = [
  { value: '', label: 'Not said' },
  { value: 'right', label: 'Right' },
  { value: 'left', label: 'Left' },
  { value: 'both', label: 'Both' },
] as const

export default function ClubPlayerPage() {
  const { playerId } = useParams()
  const { user, isLoading: authLoading } = useAuth()
  const [teams, setTeams] = useState<Team[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const overview = await clubService.overview()
    setTeams(overview.teams)
    setTournaments(overview.tournaments)
  }

  useEffect(() => {
    if (!user) return
    let cancelled = false

    load()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const found = useMemo(() => {
    for (const team of teams) {
      const player = (team.players ?? []).find((candidate) => candidate.id === playerId)
      if (player) return { team, player }
    }
    return null
  }, [teams, playerId])

  if (authLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white/70 animate-spin" />
      </div>
    )
  }

  if (!found) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-3">No such player</h1>
          <p className="opacity-70 mb-6">
            Nobody with that link is in a squad you run. They may have been released.
          </p>
          <Link to="/my-club" className="px-6 py-3 rounded-lg glass hover:bg-white/10">
            Back to the club
          </Link>
        </div>
      </div>
    )
  }

  return (
    <PlayerDetail
      team={found.team}
      player={found.player}
      tournaments={tournaments.filter((tournament) =>
        (tournament.teamIds || []).includes(found.team.id),
      )}
      onReload={load}
    />
  )
}

function PlayerDetail({
  team,
  player,
  tournaments,
  onReload,
}: {
  team: Team
  player: Player
  tournaments: Tournament[]
  onReload: () => Promise<void>
}) {
  const [firstName, setFirstName] = useState(player.firstName)
  const [lastName, setLastName] = useState(player.lastName)
  const [number, setNumber] = useState(player.number?.toString() ?? '')
  const [position, setPosition] = useState(player.position ?? '')
  const [height, setHeight] = useState(player.heightCm?.toString() ?? '')
  const [weight, setWeight] = useState(player.weightKg?.toString() ?? '')
  const [foot, setFoot] = useState<Foot>(player.preferredFoot ?? '')
  const [dateOfBirth, setDateOfBirth] = useState(player.dateOfBirth?.slice(0, 10) ?? '')
  const [instagram, setInstagram] = useState(player.socialMedia?.instagram ?? '')
  const [facebook, setFacebook] = useState(player.socialMedia?.facebook ?? '')
  const [isPublic, setIsPublic] = useState(player.isPublic !== false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed from the record whenever it is reloaded, so a save made in the
  // squad list — or by the organiser — is not sitting behind a stale form.
  useEffect(() => {
    setFirstName(player.firstName)
    setLastName(player.lastName)
    setNumber(player.number?.toString() ?? '')
    setPosition(player.position ?? '')
    setHeight(player.heightCm?.toString() ?? '')
    setWeight(player.weightKg?.toString() ?? '')
    setFoot(player.preferredFoot ?? '')
    setDateOfBirth(player.dateOfBirth?.slice(0, 10) ?? '')
    setInstagram(player.socialMedia?.instagram ?? '')
    setFacebook(player.socialMedia?.facebook ?? '')
    setIsPublic(player.isPublic !== false)
  }, [player])

  /**
   * An emptied field has to be sent as `null`, not left out: JSON has no
   * undefined, so a key that is simply absent means "unchanged" and the old
   * height would survive being deleted on screen.
   */
  const numberOrNull = (value: string): number | null => {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  const save = async () => {
    if (!firstName.trim() && !lastName.trim()) {
      setError('A player needs a name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await playerService.update(team.id, player.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        position: position.trim(),
        number: numberOrNull(number),
        heightCm: numberOrNull(height),
        weightKg: numberOrNull(weight),
        preferredFoot: foot || null,
        dateOfBirth: dateOfBirth || null,
        socialMedia: { instagram: instagram.trim(), facebook: facebook.trim() },
        isPublic,
      })
      await onReload()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const uploadPhoto = async (file: File) => {
    // The upload route is scoped by club, not by player: the key it mints is
    // teams/<club>/players/<random>, and the club is what the caller's
    // permission was checked against.
    const url = await uploadImage(file, { kind: 'player', id: team.id })
    await playerService.update(team.id, player.id, { photo: url })
    await onReload()
  }

  const fixtures = useMemo(
    () => tournaments.flatMap((tournament) => allMatches(tournament)),
    [tournaments],
  )
  const record = recordOf(fixtures, player.id)

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Link
        to="/my-club"
        className="inline-flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors"
      >
        <IconArrowLeft size={15} /> {team.name}
      </Link>

      <div className="glass rounded-2xl p-5 border border-white/15">
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="shrink-0 space-y-2">
            <PhotoUploader
              photo={player.photo}
              alt={`${player.firstName} ${player.lastName}`}
              label="photo"
              width={144}
              height={176}
              compressionType="profile"
              onUpload={uploadPhoto}
            />
          </div>

          <div className="flex-1 min-w-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-[5rem_1fr_1fr]">
              <Field label="Number">
                <input
                  value={number}
                  onChange={(event) => setNumber(event.target.value)}
                  inputMode="numeric"
                  className={INPUT}
                />
              </Field>
              <Field label="First name">
                <input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label="Last name">
                <input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  className={INPUT}
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Position">
                <input
                  value={position}
                  onChange={(event) => setPosition(event.target.value)}
                  className={INPUT}
                />
              </Field>
              <Field label="Height (cm)">
                <input
                  value={height}
                  onChange={(event) => setHeight(event.target.value)}
                  inputMode="numeric"
                  className={INPUT}
                />
              </Field>
              <Field label="Weight (kg)">
                <input
                  value={weight}
                  onChange={(event) => setWeight(event.target.value)}
                  inputMode="numeric"
                  className={INPUT}
                />
              </Field>
              <Field label="Stronger foot">
                <select
                  value={foot}
                  onChange={(event) => setFoot(event.target.value as Foot)}
                  className={INPUT}
                >
                  {FEET.map((option) => (
                    <option key={option.value} value={option.value} className="bg-gray-900">
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Date of birth">
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(event) => setDateOfBirth(event.target.value)}
                  className={INPUT}
                />
                <span className="text-xs text-gray-500">
                  {team.hidePlayerAges
                    ? 'The club is not publishing ages.'
                    : 'The public sees an age, never the date.'}
                </span>
              </Field>
              <Field label="Instagram">
                <input
                  value={instagram}
                  onChange={(event) => setInstagram(event.target.value)}
                  placeholder="https://instagram.com/…"
                  className={INPUT}
                />
              </Field>
              <Field label="Facebook">
                <input
                  value={facebook}
                  onChange={(event) => setFacebook(event.target.value)}
                  placeholder="https://facebook.com/…"
                  className={INPUT}
                />
              </Field>
            </div>

            <label className="flex items-start gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(event) => setIsPublic(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                Show on the public pages
                <span className="block text-xs text-gray-500">
                  Off, and this player is left out of the squad a visitor sees. Goals already
                  recorded still count in the competition's tables.
                </span>
              </span>
            </label>

            {error && <p className="text-sm text-red-300">{error}</p>}

            <div className="flex items-center gap-3">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              {saved && <span className="text-sm text-gray-400">Saved.</span>}
              {player.isPublic !== false && (
                <Link
                  to={`/public/players/${player.id}`}
                  className="text-sm text-gray-300 hover:text-white transition-colors"
                >
                  See the public page
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-5 border border-white/15">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-1 inline-flex items-center gap-2">
          <IconUser size={15} /> Record
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Appearances come from the teamsheets; goals and assists from the goals recorded in each
          match. A competition nobody fills teamsheets in has no appearances to show.
        </p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Tile value={record.played} label="Played" />
          <Tile value={record.goals} label="Goals" />
          <Tile value={record.assists} label="Assists" />
        </div>

        {tournaments.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {tournaments.map((tournament) => {
              const own = recordOf(allMatches(tournament), player.id)
              return (
                <li
                  key={tournament.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.03]"
                >
                  <span className="truncate">
                    {seriesName(tournament)}{' '}
                    <span className="opacity-60">{seasonLabel(tournament)}</span>
                  </span>
                  <span className="text-xs text-gray-300 shrink-0">
                    {own.played} played · {own.goals} goals · {own.assists} assists
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

const INPUT =
  'mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-gray-300">{label}</span>
      {children}
    </label>
  )
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="p-4 rounded-xl bg-white/[0.04]">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
    </div>
  )
}
