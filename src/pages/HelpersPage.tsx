import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { useAuth } from '../contexts/AuthContext'
import { helperService } from '../lib/data'
import type { HelperInviteIssued, OrganizerHelpers, OrganizerMember } from '../lib/data'
import { IconCheck, IconClipboard, IconMail, IconShield, IconTrash, IconUsers } from '../components/icons'

const FIELD =
  'w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:outline-none focus:border-white/40 transition-colors'

const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''

/**
 * The people who run this organiser.
 *
 * Helpers can do everything the owner does with competitions, clubs, results
 * and referees; what they cannot do is decide who else is here, or rename the
 * organiser. So every member sees this list, and only the owner (or the super
 * admin) sees the invitations and the buttons. The server decides that too:
 * hiding the buttons is a courtesy, not the check.
 */
export default function HelpersPage() {
  const { getCurrentOrganizer, organizers, superAdmin } = useAppStore()
  const { refresh } = useAuth()
  const current = getCurrentOrganizer()
  const [chosenId, setChosenId] = useState('')
  const organizerId = current?.id ?? chosenId

  const [data, setData] = useState<OrganizerHelpers | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [issued, setIssued] = useState<HelperInviteIssued | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState<{ id: string; action: 'remove' | 'owner' } | null>(null)

  const load = useCallback(async () => {
    if (!organizerId) return
    try {
      setData(await helperService.list(organizerId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The list could not be loaded.')
    }
  }, [organizerId])

  useEffect(() => {
    setData(null)
    setIssued(null)
    void load()
  }, [load])

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

  /** Also how a lost link is replaced: the server takes the old one to that address away. */
  const sendInvite = async (address: string) => {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const result = await helperService.invite(organizerId, address)
      setIssued(result)
      setEmail('')
      await load()
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : 'The invitation could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  const helperCount = data ? data.members.filter((member) => !member.isOwner).length + data.invites.length : 0
  const full = data ? helperCount >= data.maxHelpers : false

  const memberRow = (member: OrganizerMember) => {
    const confirming = confirm?.id === member.id ? confirm.action : null
    return (
      <div key={member.id} className="glass rounded-xl px-4 py-3 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-semibold truncate">
              {member.displayName || member.email}
              {member.isYou && <span className="opacity-60 font-normal"> (you)</span>}
            </div>
            <div className="text-xs opacity-60 truncate">
              {member.email}
              {member.lastLogin ? ` · last signed in ${formatDate(member.lastLogin)}` : ' · never signed in'}
            </div>
          </div>
          <span
            className={`text-[11px] uppercase tracking-wide px-2 py-0.5 rounded border ${
              member.isOwner ? 'border-emerald-400/40 text-emerald-300' : 'border-white/15 opacity-70'
            }`}
          >
            {member.isOwner ? 'Owner' : 'Helper'}
          </span>

          {data?.mayManage && !member.isOwner && (
            <div className="ml-auto flex items-center gap-3 flex-wrap">
              {confirming === 'owner' ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      const done = await act(
                        () => helperService.makeOwner(organizerId, member.id),
                        'The organizer could not be handed over.',
                      )
                      setConfirm(null)
                      // The reader may just have stopped being the owner.
                      if (done) await refresh()
                    }}
                    className="text-sm text-amber-300 hover:text-amber-200"
                  >
                    Make owner
                  </button>
                  <button type="button" onClick={() => setConfirm(null)} className="text-sm opacity-70 hover:opacity-100">
                    Keep
                  </button>
                </>
              ) : confirming === 'remove' ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      await act(() => helperService.remove(organizerId, member.id), 'They could not be removed.')
                      setConfirm(null)
                    }}
                    className="text-sm text-red-300 hover:text-red-200"
                  >
                    Remove
                  </button>
                  <button type="button" onClick={() => setConfirm(null)} className="text-sm opacity-70 hover:opacity-100">
                    Keep
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirm({ id: member.id, action: 'owner' })}
                    className="inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100"
                  >
                    <IconShield size={14} /> Make owner
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm({ id: member.id, action: 'remove' })}
                    className="inline-flex items-center gap-1 text-sm text-red-400 hover:text-red-300"
                  >
                    <IconTrash size={14} /> Remove
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {confirming === 'owner' && (
          <p className="text-xs opacity-70">
            They will invite and remove helpers instead of you, and can remove you. You stay on as a
            helper.
          </p>
        )}
        {confirming === 'remove' && (
          <p className="text-xs opacity-70">
            {member.runsClubs
              ? 'They stop having access to this organizer. Their account stays, for the clubs it runs.'
              : 'They stop having access to this organizer and can no longer sign in. Inviting them again brings the account back.'}{' '}
            What they have already done stays.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold inline-flex items-center gap-2">
          <IconUsers size={22} /> Helpers
        </h1>
        <p className="opacity-70 mt-2 text-sm leading-relaxed">
          The people who run this organizer with you. A helper can do everything with competitions,
          clubs, fixtures, results and referees. Only the owner invites and removes helpers, hands the
          organizer on, and changes its name.
        </p>
      </div>

      {error && <div className="rounded-lg px-4 py-3 text-sm bg-red-500/15 border border-red-400/30">{error}</div>}

      {data?.mayManage && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (email.trim()) void sendInvite(email.trim())
          }}
          className="glass rounded-xl p-5 space-y-4">
          <h2 className="font-semibold">Invite a helper</h2>
          <label className="block">
            <span className="block text-sm opacity-80 mb-1">Email address</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={full}
              className={FIELD}
            />
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="submit"
              disabled={busy || full || !email.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg glass border border-white/20 hover:bg-white/10 transition-all disabled:opacity-40"
            >
              <IconMail size={15} /> Send invitation
            </button>
            <span className="text-xs opacity-60">
              {helperCount} of {data.maxHelpers} helpers, invitations included.
            </span>
          </div>
          <p className="text-xs opacity-60">
            Somebody who already runs a club here can accept with their own login and keep their club.
            A referee's login cannot also help run an organizer: they need another address.
          </p>

          {issued && (
            <div className="rounded-lg bg-white/5 border border-white/15 p-3 space-y-2 text-sm">
              <p>
                {issued.emailed
                  ? `Sent to ${issued.email}. You can also pass the link on yourself:`
                  : `The email could not be sent. Pass this link on to ${issued.email}:`}
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={issued.link}
                  className="flex-1 min-w-0 px-3 py-2 rounded-md bg-transparent border border-white/20 text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(issued.link)
                    setCopied(true)
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md glass hover:bg-white/10 text-xs"
                >
                  {copied ? <IconCheck size={14} /> : <IconClipboard size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs opacity-60">
                It works once, for that address only, until {formatDate(issued.expiresAt)}.
              </p>
            </div>
          )}
        </form>
      )}

      {data === null ? (
        <div className="glass rounded-xl p-8 text-center opacity-70">Loading...</div>
      ) : (
        <>
          <div className="space-y-2">{data.members.map(memberRow)}</div>

          {data.invites.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold opacity-80">Invited</h2>
              {data.invites.map((pending) => (
                <div key={pending.email} className="glass rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="truncate">{pending.email}</div>
                    <div className="text-xs opacity-60">Until {formatDate(pending.expiresAt)}</div>
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void sendInvite(pending.email)}
                      className="inline-flex items-center gap-1.5 text-sm opacity-80 hover:opacity-100 disabled:opacity-40"
                    >
                      <IconMail size={14} /> Invite again
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        act(
                          () => helperService.cancelInvite(organizerId, pending.email),
                          'The invitation could not be cancelled.',
                        )
                      }
                      className="text-sm opacity-70 hover:opacity-100 disabled:opacity-40"
                    >
                      Cancel invitation
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!data.mayManage && (
            <p className="text-xs opacity-60">Only the owner can invite or remove helpers.</p>
          )}
        </>
      )}
    </div>
  )
}
