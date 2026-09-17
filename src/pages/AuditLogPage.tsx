import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchAuditLog, fetchAuditOptions } from '../lib/auth'
import type {
  AuditEntry,
  AuditFilter,
  AuditGroup,
  AuditOptions,
  UserRole,
} from '../lib/auth'
import { useAuth } from '../contexts/AuthContext'
import { IconArrowLeft, IconClose, IconSearch, IconShield } from '../components/icons'

const PAGE_SIZE = 100

const GROUPS: { value: AuditGroup; label: string }[] = [
  { value: 'competitions', label: 'Competitions' },
  { value: 'matches', label: 'Matches, goals and line-ups' },
  { value: 'clubs', label: 'Clubs and players' },
  { value: 'entries', label: 'Entries and registrations' },
  { value: 'organizers', label: 'Organisers' },
  { value: 'accounts', label: 'Accounts' },
]

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'super_admin', label: 'Super admin' },
  { value: 'organizer', label: 'Organiser' },
  { value: 'team_manager', label: 'Club manager' },
]

const ROLE_BADGE: Record<UserRole, { label: string; className: string }> = {
  super_admin: { label: 'super admin', className: 'text-yellow-400' },
  organizer: { label: 'organiser', className: 'text-sky-300' },
  team_manager: { label: 'club manager', className: 'text-emerald-300' },
}

/** The filter keys the address carries, so a filtered view can be reloaded or sent on. */
const PARAM_KEYS = [
  'organizerId',
  'tournamentId',
  'actorId',
  'email',
  'role',
  'group',
  'action',
  'from',
  'to',
] as const
type ParamKey = (typeof PARAM_KEYS)[number]

/**
 * A day typed into a date field is a day where the reader is, so the range is
 * cut at local midnight and sent as an instant. `to` is the start of the day
 * after, which is how the server's exclusive end includes the whole of the day
 * that was picked.
 */
function dayStart(day: string, offsetDays = 0): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return undefined
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + offsetDays)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function whenOf(entry: AuditEntry): Date {
  return new Date(entry.at.split('#')[0]!)
}

/** Which competition a line is about, when it is about one. */
function tournamentIdOf(entry: AuditEntry): string | undefined {
  if (entry.entity === 'tournament') return entry.entityId
  if (entry.entity === 'match') return entry.entityId.split('/')[0]
  return undefined
}

const inputClass =
  'w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 focus:border-white/40 focus:outline-none text-sm'

/**
 * Who changed what.
 *
 * A super admin can edit any organiser's tournament, and until this existed
 * that was indistinguishable from the organiser doing it themselves. When
 * somebody says "our result was changed", this is the answer.
 *
 * The filters are applied by the API, not to the lines already on screen: the
 * log is read a page at a time, and narrowing the newest page would report
 * "nothing" for everything older than it.
 */
export default function AuditLogPage() {
  const { isSuperAdmin, isLoading } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [options, setOptions] = useState<AuditOptions | null>(null)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [searchedTo, setSearchedTo] = useState<string | undefined>()
  // A page shorter than asked for, with a cursor, means the server stopped at
  // its read budget rather than at the end of the log.
  const [lastPageShort, setLastPageShort] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const param = useCallback((key: ParamKey) => searchParams.get(key) ?? '', [searchParams])

  // The address field is typed into, so it is held locally and reaches the
  // address (and the API) once the typing pauses.
  const urlEmail = param('email')
  const [emailDraft, setEmailDraft] = useState(urlEmail)
  useEffect(() => {
    setEmailDraft(urlEmail)
  }, [urlEmail])

  const setParams = useCallback(
    (changes: Partial<Record<ParamKey, string>>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  useEffect(() => {
    if (emailDraft.trim() === urlEmail) return
    const timer = window.setTimeout(() => setParams({ email: emailDraft.trim() }), 350)
    return () => window.clearTimeout(timer)
  }, [emailDraft, urlEmail, setParams])

  const filter = useMemo<AuditFilter>(() => {
    const result: AuditFilter = {}
    for (const key of ['organizerId', 'tournamentId', 'actorId', 'email', 'action'] as const) {
      const value = searchParams.get(key)
      if (value) result[key] = value
    }
    const role = searchParams.get('role')
    if (role) result.role = role as UserRole
    const group = searchParams.get('group')
    if (group) result.group = group as AuditGroup
    const from = dayStart(searchParams.get('from') ?? '')
    const to = dayStart(searchParams.get('to') ?? '', 1)
    if (from) result.from = from
    if (to) result.to = to
    return result
  }, [searchParams])

  const filterKey = JSON.stringify(filter)
  const hasFilter = Object.keys(filter).length > 0
  const rangeIsBackwards = Boolean(filter.from && filter.to && filter.from >= filter.to)

  useEffect(() => {
    if (!isSuperAdmin) return
    let cancelled = false
    fetchAuditOptions()
      .then((result) => {
        if (!cancelled) setOptions(result)
      })
      .catch(() => {
        // The log still reads without names in the pickers; the filters that
        // need them simply offer nothing.
      })
    return () => {
      cancelled = true
    }
  }, [isSuperAdmin])

  // A response that arrives after the filter has moved on belongs to a
  // question nobody is asking any more.
  const requestId = useRef(0)

  useEffect(() => {
    const id = ++requestId.current
    if (!isSuperAdmin || rangeIsBackwards) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    fetchAuditLog(JSON.parse(filterKey) as AuditFilter, { limit: PAGE_SIZE })
      .then((page) => {
        if (id !== requestId.current) return
        setEntries(page.entries)
        setCursor(page.cursor)
        setSearchedTo(page.searchedTo)
        setLastPageShort(page.entries.length < PAGE_SIZE)
      })
      .catch(() => {
        if (id !== requestId.current) return
        setEntries([])
        setCursor(undefined)
        setError('The log could not be loaded.')
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
  }, [isSuperAdmin, filterKey, rangeIsBackwards])

  const loadMore = async () => {
    if (!cursor) return
    const id = requestId.current
    setLoadingMore(true)
    try {
      const page = await fetchAuditLog(filter, { limit: PAGE_SIZE, cursor })
      if (id !== requestId.current) return
      setEntries((current) => [...current, ...page.entries])
      setCursor(page.cursor)
      setSearchedTo(page.searchedTo)
      setLastPageShort(page.entries.length < PAGE_SIZE)
    } catch {
      if (id === requestId.current) setError('The next page could not be loaded.')
    } finally {
      setLoadingMore(false)
    }
  }

  const organizerNames = useMemo(
    () => new Map((options?.organizers ?? []).map((o) => [o.id, o.name])),
    [options],
  )

  const tournamentNames = useMemo(
    () =>
      new Map(
        (options?.tournaments ?? []).map((t) => [
          t.id,
          t.seasonLabel ? `${t.name} (${t.seasonLabel})` : t.name,
        ]),
      ),
    [options],
  )

  const organizerId = param('organizerId')
  const tournamentChoices = useMemo(
    () =>
      (options?.tournaments ?? []).filter((t) => !organizerId || t.organizerId === organizerId),
    [options, organizerId],
  )

  const actorId = param('actorId')
  const actorLabel =
    entries.find((entry) => entry.actorId === actorId)?.actorEmail || actorId

  if (isLoading) return null

  if (!isSuperAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="glass rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-2">Not for this account</h1>
          <p className="opacity-70 mb-6">The record of changes is for super admins.</p>
          <Link to="/" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
            Go home
          </Link>
        </div>
      </div>
    )
  }

  // The last page came back short only because the read budget ran out, so
  // "nothing more" would be a guess; say how far back the search went instead.
  const stoppedEarly = Boolean(cursor && searchedTo && lastPageShort)

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold inline-flex items-center gap-2">
            <IconShield size={24} /> Changes
          </h1>
          <p className="opacity-70 mt-1">Every edit that reached the database, newest first.</p>
        </div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100 transition-opacity"
        >
          <IconArrowLeft size={15} /> Back
        </Link>
      </div>

      <section className="glass rounded-xl p-4 sm:p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="block text-xs opacity-70 mb-1">Organiser</span>
            <select
              value={organizerId}
              onChange={(event) => {
                const next = event.target.value
                const tournament = options?.tournaments.find((t) => t.id === param('tournamentId'))
                // A season from another organiser would leave a filter that
                // can match nothing, with nothing on screen saying why.
                setParams({
                  organizerId: next,
                  tournamentId:
                    next && tournament && tournament.organizerId !== next
                      ? ''
                      : param('tournamentId'),
                })
              }}
              className={inputClass}
            >
              <option value="">All organisers</option>
              {(options?.organizers ?? []).map((organizer) => (
                <option key={organizer.id} value={organizer.id}>
                  {organizer.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs opacity-70 mb-1">Competition</span>
            <select
              value={param('tournamentId')}
              onChange={(event) => setParams({ tournamentId: event.target.value })}
              className={inputClass}
            >
              <option value="">All competitions</option>
              {tournamentChoices.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournamentNames.get(tournament.id)}
                  {!organizerId && organizerNames.get(tournament.organizerId)
                    ? ` — ${organizerNames.get(tournament.organizerId)}`
                    : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs opacity-70 mb-1">Kind of event</span>
            <select
              value={param('group')}
              onChange={(event) => setParams({ group: event.target.value })}
              className={inputClass}
            >
              <option value="">Everything</option>
              {GROUPS.map((group) => (
                <option key={group.value} value={group.value}>
                  {group.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs opacity-70 mb-1">Author's email</span>
            <span className="relative block">
              <IconSearch
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none"
              />
              <input
                type="search"
                value={emailDraft}
                onChange={(event) => setEmailDraft(event.target.value)}
                placeholder="Any part of the address"
                maxLength={200}
                className={`${inputClass} pl-8`}
              />
            </span>
          </label>

          <label className="block">
            <span className="block text-xs opacity-70 mb-1">Author's role</span>
            <select
              value={param('role')}
              onChange={(event) => setParams({ role: event.target.value })}
              className={inputClass}
            >
              <option value="">Any role</option>
              {ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs opacity-70 mb-1">From</span>
              <input
                type="date"
                value={param('from')}
                max={param('to') || undefined}
                onChange={(event) => setParams({ from: event.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="block text-xs opacity-70 mb-1">To</span>
              <input
                type="date"
                value={param('to')}
                min={param('from') || undefined}
                onChange={(event) => setParams({ to: event.target.value })}
                className={inputClass}
              />
            </label>
          </div>
        </div>

        {(actorId || param('action') || hasFilter) && (
          <div className="flex flex-wrap items-center gap-2">
            {actorId && (
              <FilterChip label={`Author: ${actorLabel}`} onClear={() => setParams({ actorId: '' })} />
            )}
            {param('action') && (
              <FilterChip
                label={`Action: ${param('action')}`}
                onClear={() => setParams({ action: '' })}
              />
            )}
            {hasFilter && (
              <button
                type="button"
                onClick={() => {
                  setEmailDraft('')
                  setSearchParams(new URLSearchParams(), { replace: true })
                }}
                className="text-xs opacity-70 hover:opacity-100 underline underline-offset-2"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </section>

      <section className="glass rounded-xl p-4 sm:p-6">
        {rangeIsBackwards ? (
          <p className="text-amber-300 py-6 text-center">The start date is after the end date.</p>
        ) : loading ? (
          <p className="opacity-60 py-6 text-center">Loading…</p>
        ) : error && entries.length === 0 ? (
          <p className="text-red-300 py-6 text-center">{error}</p>
        ) : entries.length === 0 ? (
          <div className="py-6 text-center space-y-3">
            <p className="opacity-60">
              {hasFilter ? 'Nothing matches these filters.' : 'Nothing has been changed yet.'}
            </p>
            {cursor && searchedTo && (
              <SearchFurther searchedTo={searchedTo} loading={loadingMore} onClick={loadMore} />
            )}
          </div>
        ) : (
          <>
            <ul className="divide-y divide-white/10">
              {entries.map((entry) => (
                <AuditRow
                  key={entry.at}
                  entry={entry}
                  namesLoaded={options !== null}
                  organizerName={entry.organizerId ? organizerNames.get(entry.organizerId) : undefined}
                  tournamentId={tournamentIdOf(entry)}
                  tournamentName={tournamentNames.get(tournamentIdOf(entry) ?? '')}
                  onFilter={setParams}
                />
              ))}
            </ul>

            <div className="pt-4 flex flex-col items-center gap-2 text-sm">
              <p className="opacity-60">
                {entries.length} {entries.length === 1 ? 'change' : 'changes'} shown
              </p>
              {error && <p className="text-red-300">{error}</p>}
              {cursor &&
                (stoppedEarly && searchedTo ? (
                  <SearchFurther searchedTo={searchedTo} loading={loadingMore} onClick={loadMore} />
                ) : (
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="px-4 py-2 rounded-lg glass hover:bg-white/10 transition-all disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function AuditRow({
  entry,
  namesLoaded,
  organizerName,
  tournamentId,
  tournamentName,
  onFilter,
}: {
  entry: AuditEntry
  /** Until the names arrive a missing one is not yet known, not deleted. */
  namesLoaded: boolean
  organizerName?: string
  tournamentId?: string
  tournamentName?: string
  onFilter: (changes: Partial<Record<ParamKey, string>>) => void
}) {
  const badge = ROLE_BADGE[entry.actorRole]
  return (
    <li className="py-3 space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs opacity-60 w-40 shrink-0">{whenOf(entry).toLocaleString()}</span>
        <FilterLink
          title="Show only this author"
          onClick={() => onFilter({ actorId: entry.actorId })}
          className="text-sm font-medium"
        >
          {entry.actorEmail || entry.actorId}
        </FilterLink>
        {badge && (
          <span className={`text-[10px] uppercase tracking-wide ${badge.className}`}>
            {badge.label}
          </span>
        )}
        <span className="text-sm opacity-80 flex-1 min-w-0">{entry.summary || entry.action}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:pl-43 text-[11px]">
        {entry.organizerId && (
          <FilterLink
            title="Show only this organiser"
            onClick={() => onFilter({ organizerId: entry.organizerId })}
            className="opacity-60"
          >
            {organizerName ?? (namesLoaded ? 'Deleted organiser' : 'Organiser')}
          </FilterLink>
        )}
        {tournamentId && (
          <FilterLink
            title="Show only this competition"
            onClick={() => onFilter({ tournamentId })}
            className="opacity-60"
          >
            {tournamentName ?? (namesLoaded ? 'Deleted competition' : 'Competition')}
          </FilterLink>
        )}
        <FilterLink
          title="Show only this action"
          onClick={() => onFilter({ action: entry.action })}
          className="opacity-40 font-mono"
        >
          {entry.action}
        </FilterLink>
      </div>
    </li>
  )
}

function FilterLink({
  children,
  onClick,
  title,
  className = '',
}: {
  children: ReactNode
  onClick: () => void
  title: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`${className} hover:opacity-100 hover:underline underline-offset-2 text-left`}
    >
      {children}
    </button>
  )
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3 py-1 text-xs">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove filter: ${label}`}
        className="opacity-60 hover:opacity-100"
      >
        <IconClose size={12} />
      </button>
    </span>
  )
}

function SearchFurther({
  searchedTo,
  loading,
  onClick,
}: {
  searchedTo: string
  loading: boolean
  onClick: () => void
}) {
  const date = new Date(searchedTo.split('#')[0]!)
  return (
    <div className="flex flex-col items-center gap-2 text-sm">
      <p className="opacity-60">Searched back to {date.toLocaleDateString()}.</p>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="px-4 py-2 rounded-lg glass hover:bg-white/10 transition-all disabled:opacity-50"
      >
        {loading ? 'Searching…' : 'Search further back'}
      </button>
    </div>
  )
}
