import { useEffect, useState } from 'react'
import { clubService } from '../lib/data'
import type { ClubPeople, CoManagerInvite } from '../lib/data'
import type { Team } from '../types'
import { IconCheck, IconClipboard, IconClose, IconMail, IconPlus, IconUsers } from './icons'

/**
 * Who runs this club, on the club's own page.
 *
 * Every manager sees the others. Only the head manager brings people in, takes
 * them off and hands the role on; everybody may leave. The server decides all
 * of it — `lib/club-managers.ts` — and this screen only leaves out the buttons
 * it would refuse, since a control that saves into a refusal is worse than no
 * control.
 */
export default function ClubManagers({
  team,
  viewerId,
  onLeft,
  onChanged,
}: {
  team: Team
  viewerId: string
  /** The viewer is no longer one of the club's managers. */
  onLeft: () => Promise<void>
  /** Who is in charge changed, which the top bar also shows. */
  onChanged: () => Promise<void>
}) {
  const [people, setPeople] = useState<ClubPeople | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [fresh, setFresh] = useState<CoManagerInvite | null>(null)

  const load = async () => {
    try {
      setPeople(await clubService.people(team.id))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    setPeople(null)
    setFresh(null)
    setError(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id])

  /** One action at a time, each with its own key so only its button says so. */
  const run = async (key: string, action: () => Promise<void>) => {
    if (busy) return
    setBusy(key)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : 'That could not be changed.')
    } finally {
      setBusy(null)
    }
  }

  const heading = (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300 mb-3 inline-flex items-center gap-2">
      <IconUsers size={15} /> Who runs the club
    </h2>
  )

  if (failed) {
    return (
      <div className="glass rounded-2xl p-5 border border-white/15">
        {heading}
        <p className="text-sm text-amber-300/90">Could not read who runs this club. Reload the page.</p>
      </div>
    )
  }

  if (!people) {
    return (
      <div className="glass rounded-2xl p-5 border border-white/15">
        {heading}
        <p className="text-sm opacity-60">Checking...</p>
      </div>
    )
  }

  const { managers, invites, youAreHead } = people
  const others = managers.filter((manager) => manager.id !== viewerId)

  return (
    <div className="glass rounded-2xl p-5 border border-white/15 space-y-4">
      {heading}

      <ul className="divide-y divide-white/10">
        {managers.map((manager) => {
          const isYou = manager.id === viewerId
          return (
            <li key={manager.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">
                    {manager.displayName || manager.email || 'Account no longer exists'}
                  </span>
                  {isYou && <span className="text-xs opacity-60">you</span>}
                  {manager.isHead && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-200">
                      Head manager
                    </span>
                  )}
                  {!manager.isActive && (
                    <span className="text-xs text-amber-300">account disabled</span>
                  )}
                </div>
                <div className="text-xs opacity-60 break-all">
                  {manager.displayName && manager.email ? `${manager.email} · ` : ''}
                  {manager.linkedAt
                    ? `since ${new Date(manager.linkedAt).toLocaleDateString()}`
                    : 'joined before this was recorded'}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {youAreHead && !isYou && (
                  <>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        const name = manager.displayName || manager.email || 'this manager'
                        if (
                          !confirm(
                            `Make ${name} the head manager of ${team.name}? You stay on as a manager, but only they will be able to invite and remove people.`,
                          )
                        ) {
                          return
                        }
                        run(`head:${manager.id}`, async () => {
                          await clubService.makeHead(team.id, manager.id)
                          await load()
                          await onChanged()
                        })
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition-colors disabled:opacity-50"
                    >
                      {busy === `head:${manager.id}` ? 'Working...' : 'Make head'}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        const name = manager.displayName || manager.email || 'this manager'
                        if (!confirm(`Remove ${name} from ${team.name}?`)) return
                        run(`remove:${manager.id}`, async () => {
                          await clubService.removeCoManager(team.id, manager.id)
                          await load()
                        })
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg glass hover:bg-red-500/10 text-red-300 transition-colors disabled:opacity-50"
                    >
                      {busy === `remove:${manager.id}` ? 'Working...' : 'Remove'}
                    </button>
                  </>
                )}

                {/* Leaving. The head of a club others still run hands it on
                    first — the server refuses otherwise — so the button is
                    replaced by the reason rather than offered and refused. */}
                {isYou && (!youAreHead || others.length === 0) && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      const question =
                        others.length === 0
                          ? `Stop running ${team.name}? You are its only manager, so nobody will be able to edit the club until the organiser invites someone.`
                          : `Stop running ${team.name}? It will disappear from your teams.`
                      if (!confirm(question)) return
                      run('leave', async () => {
                        await clubService.removeCoManager(team.id, viewerId)
                        await onLeft()
                      })
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg glass hover:bg-red-500/10 text-red-300 transition-colors disabled:opacity-50"
                  >
                    {busy === 'leave' ? 'Working...' : 'Leave this club'}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {youAreHead && others.length > 0 && (
        <p className="text-xs opacity-60">
          To leave the club yourself, make another manager the head first.
        </p>
      )}

      {!youAreHead && (
        <p className="text-xs opacity-60">
          The head manager invites and removes the people who run the club.
        </p>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}

      {youAreHead && (
        <div className="pt-4 border-t border-white/10 space-y-3">
          <div>
            <h3 className="text-sm font-medium">Invite someone to help run the club</h3>
            <p className="text-xs opacity-60 mt-0.5">
              They will be able to do everything you can here except invite or remove people.
              Send them the link yourself — nothing is emailed. With an address filled in, only
              that address can use it. A link works once and lasts a fortnight.
            </p>
          </div>

          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              run('invite', async () => {
                const invite = await clubService.inviteCoManager(
                  team.id,
                  email.trim() ? email.trim().toLowerCase() : undefined,
                )
                setFresh(invite)
                setEmail('')
                await load()
              })
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Their email (optional)"
              className="flex-1 min-w-[12rem] px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
            />
            <button
              type="submit"
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg glass hover:bg-white/10 transition-colors text-sm disabled:opacity-50"
            >
              <IconPlus size={14} />
              {busy === 'invite' ? 'Creating...' : 'Create invitation link'}
            </button>
          </form>

          {invites.length > 0 && (
            <ul className="space-y-2">
              {invites.map((invite) => (
                <InviteRow
                  key={invite.token}
                  invite={invite}
                  highlighted={fresh?.token === invite.token}
                  busy={busy === `withdraw:${invite.token}`}
                  disabled={busy !== null}
                  onWithdraw={() =>
                    run(`withdraw:${invite.token}`, async () => {
                      await clubService.withdrawCoManagerInvite(team.id, invite.token)
                      if (fresh?.token === invite.token) setFresh(null)
                      await load()
                    })
                  }
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function InviteRow({
  invite,
  highlighted,
  busy,
  disabled,
  onWithdraw,
}: {
  invite: CoManagerInvite
  highlighted: boolean
  busy: boolean
  disabled: boolean
  onWithdraw: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused; the link is on screen and selectable.
    }
  }

  return (
    <li
      className={`rounded-lg p-3 border text-sm ${
        highlighted ? 'border-blue-400/40 bg-blue-500/10' : 'border-white/10 bg-white/5'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <IconMail size={14} />
          {invite.email || 'Anyone with the link'}
        </span>
        <span className="text-xs opacity-60">
          until {new Date(invite.expiresAt).toLocaleDateString()}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg glass hover:bg-white/10 transition-colors"
          >
            {copied ? <IconCheck size={13} /> : <IconClipboard size={13} />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onWithdraw}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg glass hover:bg-red-500/10 text-red-300 transition-colors disabled:opacity-50"
          >
            <IconClose size={13} />
            {busy ? 'Withdrawing...' : 'Withdraw'}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400 break-all mt-1.5">{invite.link}</p>
    </li>
  )
}
