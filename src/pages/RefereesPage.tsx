import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { refereeService } from '../lib/data'
import type { RefereeInviteIssued, RefereeRecord } from '../lib/data'
import { IconCheck, IconClipboard, IconMail, IconPlus, IconTrash, IconWhistle } from '../components/icons'

const FIELD =
  'w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:outline-none focus:border-white/40 transition-colors'

const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''

/**
 * The organiser's referees.
 *
 * A list that belongs to the organiser and not to a competition: the same
 * people referee next season, and typing them in again every year would leave
 * one person's account linked to several copies of themselves. Each referee is
 * a name and, to send them an invitation, an address; the invitation lets them
 * set up an account with which they record the score, goals and cards of the
 * matches they are appointed to on each match's screen.
 */
export default function RefereesPage() {
  const { getCurrentOrganizer, organizers, superAdmin } = useAppStore()
  const current = getCurrentOrganizer()
  const [chosenId, setChosenId] = useState('')
  const organizerId = current?.id ?? chosenId

  const [referees, setReferees] = useState<RefereeRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string; email: string } | null>(null)
  const [issued, setIssued] = useState<{ id: string; invite: RefereeInviteIssued } | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!organizerId) return
    try {
      setReferees(await refereeService.list(organizerId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The referees could not be loaded.')
    }
  }, [organizerId])

  useEffect(() => {
    setReferees(null)
    void load()
  }, [load])

  /** One write, then the list as the server now has it. */
  const act = async (action: () => Promise<unknown>, whenItFails: string): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await load()
      return true
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : whenItFails)
      return false
    } finally {
      setBusy(false)
    }
  }

  if (!organizerId) {
    return (
      <div className="glass rounded-xl p-8 max-w-md mx-auto text-center">
        <h1 className="text-xl font-semibold mb-4">Choose an organiser</h1>
        {superAdmin ? (
          <select value={chosenId} onChange={(event) => setChosenId(event.target.value)} className={FIELD}>
            <option value="">Select organiser</option>
            {organizers.map((organizer) => (
              <option key={organizer.id} value={organizer.id}>
                {organizer.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="opacity-70">Select an organiser first.</p>
        )}
      </div>
    )
  }

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    const added = await act(
      () => refereeService.add(organizerId, { name: name.trim(), email: email.trim() || undefined }),
      'That referee could not be added.',
    )
    if (added) {
      setName('')
      setEmail('')
    }
  }

  const invite = async (referee: RefereeRecord) => {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const result = await refereeService.invite(organizerId, referee.id)
      setIssued({ id: referee.id, invite: result })
      await load()
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : 'The invitation could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold inline-flex items-center gap-2">
          <IconWhistle size={22} /> Referees
        </h1>
        <p className="opacity-70 mt-2 text-sm leading-relaxed">
          The people who referee your matches. Appoint them on a match's screen. A referee with an
          account can record the score, the goals and the cards of the matches they are appointed
          to, as the referee or as an assistant.
        </p>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm bg-red-500/15 border border-red-400/30">{error}</div>
      )}

      <form onSubmit={add} className="glass rounded-xl p-5 space-y-4">
        <h2 className="font-semibold">Add a referee</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="block text-sm opacity-80 mb-1">Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className={FIELD} />
          </label>
          <label className="block">
            <span className="block text-sm opacity-80 mb-1">Email, to send an invitation</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Optional"
              className={FIELD}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg glass border border-white/20 hover:bg-white/10 transition-all disabled:opacity-40"
        >
          <IconPlus size={15} /> Add referee
        </button>
      </form>

      {referees === null ? (
        <div className="glass rounded-xl p-8 text-center opacity-70">Loading...</div>
      ) : referees.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center">
          <div className="mb-3 flex justify-center opacity-60">
            <IconWhistle size={32} />
          </div>
          <p className="opacity-70">No referees yet. Add the first one above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {referees.map((referee) => {
            if (editing?.id === referee.id) {
              return (
                <div key={referee.id} className="glass rounded-xl p-4 space-y-3 border border-white/20">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="block text-sm opacity-80 mb-1">Name</span>
                      <input
                        value={editing.name}
                        onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                        className={FIELD}
                      />
                    </label>
                    {/* Once the referee has an account, the address is the one
                        they sign in with, and the server will not change it. */}
                    {!referee.linked && (
                      <label className="block">
                        <span className="block text-sm opacity-80 mb-1">Email</span>
                        <input
                          type="email"
                          value={editing.email}
                          onChange={(event) => setEditing({ ...editing, email: event.target.value })}
                          className={FIELD}
                        />
                      </label>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={busy || !editing.name.trim()}
                      onClick={async () => {
                        const saved = await act(
                          () =>
                            refereeService.update(organizerId, referee.id, {
                              name: editing.name.trim(),
                              ...(referee.linked ? {} : { email: editing.email.trim() || null }),
                            }),
                          'That change could not be saved.',
                        )
                        if (saved) setEditing(null)
                      }}
                      className="px-4 py-2 rounded-lg glass border border-white/20 hover:bg-white/10 transition-all disabled:opacity-40"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="px-4 py-2 rounded-lg text-white/70 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div key={referee.id} className="glass rounded-xl px-4 py-3 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{referee.name}</div>
                    <div className="text-xs opacity-60 truncate">
                      {referee.email ?? 'No email address'}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] uppercase tracking-wide px-2 py-0.5 rounded border ${
                      referee.linked
                        ? 'border-emerald-400/40 text-emerald-300'
                        : referee.invitedUntil
                          ? 'border-amber-400/40 text-amber-300'
                          : 'border-white/15 opacity-60'
                    }`}
                  >
                    {referee.linked
                      ? 'Has an account'
                      : referee.invitedUntil
                        ? `Invited, until ${formatDate(referee.invitedUntil)}`
                        : 'No account'}
                  </span>
                  <div className="ml-auto flex items-center gap-3 flex-wrap">
                    {!referee.linked && referee.email && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => invite(referee)}
                        className="inline-flex items-center gap-1.5 text-sm opacity-80 hover:opacity-100 disabled:opacity-40"
                      >
                        <IconMail size={14} /> {referee.invitedUntil ? 'Invite again' : 'Invite'}
                      </button>
                    )}
                    {!referee.linked && referee.invitedUntil && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          act(
                            () => refereeService.cancelInvite(organizerId, referee.id),
                            'The invitation could not be cancelled.',
                          )
                        }
                        className="text-sm opacity-70 hover:opacity-100 disabled:opacity-40"
                      >
                        Cancel invitation
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({ id: referee.id, name: referee.name, email: referee.email ?? '' })
                      }
                      className="text-sm opacity-70 hover:opacity-100"
                    >
                      Edit
                    </button>
                    {confirmRemove === referee.id ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            await act(
                              () => refereeService.remove(organizerId, referee.id),
                              'That referee could not be removed.',
                            )
                            setConfirmRemove(null)
                          }}
                          className="text-sm text-red-300 hover:text-red-200"
                        >
                          Remove for good
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemove(null)}
                          className="text-sm opacity-70 hover:opacity-100"
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(referee.id)}
                        className="inline-flex items-center gap-1 text-sm text-red-400 hover:text-red-300"
                      >
                        <IconTrash size={14} /> Remove
                      </button>
                    )}
                  </div>
                </div>

                {confirmRemove === referee.id && (
                  <p className="text-xs opacity-70">
                    They stop being able to enter results for your matches. What they have already
                    entered stays.
                  </p>
                )}

                {issued?.id === referee.id && (
                  <div className="rounded-lg bg-white/5 border border-white/15 p-3 space-y-2 text-sm">
                    <p>
                      {issued.invite.emailed
                        ? `Sent to ${issued.invite.email}. You can also pass the link on yourself:`
                        : `The email could not be sent. Pass this link on to ${issued.invite.email}:`}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={issued.invite.link}
                        className="flex-1 min-w-0 px-3 py-2 rounded-md bg-transparent border border-white/20 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(issued.invite.link)
                          setCopied(true)
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md glass hover:bg-white/10 text-xs"
                      >
                        {copied ? <IconCheck size={14} /> : <IconClipboard size={14} />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-xs opacity-60">
                      It works once, for that address only, until {formatDate(issued.invite.expiresAt)}.
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
