import { useState } from 'react'
import type { StaffMember, StaffRole, Team } from '../types'
import { STAFF_ROLES } from '../types'
import { staffService, uploadImage } from '../lib/data'
import { clubStaff, staffFullName, staffRoleLabel } from '../utils/staff'
import { cdnUrl } from '../utils/images'
import PhotoUploader from './PhotoUploader'
import { IconPencil, IconPlus, IconTrash, IconUser } from './icons'

/**
 * The people at a club who are not players.
 *
 * One implementation for the organiser's club screen and the manager's own
 * page, because two would be two lists that disagree about what a coach is the
 * first time either of them is changed. It draws the list and nothing around
 * it: each page keeps its own section chrome and heading.
 *
 * Every write goes straight to `staffService` — one person at a time, which is
 * what the API accepts — and `onChange` reloads whatever the page holds the
 * club in afterwards.
 */
export default function CoachingStaff({
  team,
  canEdit,
  onChange,
}: {
  team: Team
  canEdit: boolean
  onChange: () => Promise<void>
}) {
  const staff = clubStaff(team)
  const [draft, setDraft] = useState(BLANK)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const add = async () => {
    if (!draft.firstName.trim() && !draft.lastName.trim()) return
    setAdding(true)
    setError(null)
    try {
      await staffService.add(team.id, {
        role: draft.role,
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
      })
      setDraft(BLANK)
      await onChange()
    } catch (caught) {
      setError(messageOf(caught, 'That person could not be added.'))
    } finally {
      setAdding(false)
    }
  }

  /**
   * Taking somebody off the staff, which deletes the record rather than
   * archiving it. Nothing in the system points at a member of staff — no
   * teamsheet, no goal, no entry — so there is no history for this to leave
   * anonymous, which is exactly why a player's button does the opposite.
   */
  const remove = async (member: StaffMember) => {
    if (!confirm(`Remove ${staffFullName(member)} from the staff?`)) return
    setError(null)
    try {
      await staffService.remove(team.id, member.id)
      await onChange()
    } catch (caught) {
      setError(messageOf(caught, 'That person could not be removed.'))
    }
  }

  return (
    <div>
      {staff.length === 0 && (
        <p className="text-sm opacity-60 mb-3">
          {canEdit
            ? 'Nobody listed yet. A coach, an assistant or a physio — none of it is required.'
            : 'No coaching staff listed.'}
        </p>
      )}

      {staff.length > 0 && (
        <ul className="space-y-1 mb-3">
          {staff.map((member) =>
            editingId === member.id ? (
              <StaffEditor
                key={member.id}
                teamId={team.id}
                member={member}
                onReload={onChange}
                onDone={async () => {
                  setEditingId(null)
                  await onChange()
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <li
                key={member.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] group"
              >
                <StaffPhoto member={member} />
                <span className="flex-1 min-w-0 truncate">
                  {staffFullName(member)}
                  <span className="text-xs text-gray-400 ml-2">{staffRoleLabel(member.role)}</span>
                </span>
                {canEdit && (
                  <>
                    <button
                      onClick={() => setEditingId(member.id)}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-white/10"
                      title="Edit"
                    >
                      <IconPencil size={14} />
                    </button>
                    <button
                      onClick={() => remove(member)}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-500/20 text-red-300"
                      title="Remove from the staff"
                    >
                      <IconTrash size={14} />
                    </button>
                  </>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {canEdit && (
        <div className="pt-3 border-t border-white/10">
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr_1fr_auto]">
            <select
              value={draft.role}
              onChange={(event) => setDraft({ ...draft, role: event.target.value as StaffRole })}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
            >
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role} className="bg-gray-900">
                  {staffRoleLabel(role)}
                </option>
              ))}
            </select>
            <input
              value={draft.firstName}
              onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
              placeholder="First name"
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
            />
            <input
              value={draft.lastName}
              onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
              placeholder="Last name"
              onKeyDown={(event) => event.key === 'Enter' && add()}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
            />
            <button
              onClick={add}
              disabled={adding || (!draft.firstName.trim() && !draft.lastName.trim())}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 transition-colors text-sm inline-flex items-center justify-center gap-1.5"
            >
              <IconPlus size={14} /> Add
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            A photograph is added by opening the person and clicking their picture.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-300 mt-2">{error}</p>}
    </div>
  )
}

const BLANK: { role: StaffRole; firstName: string; lastName: string } = {
  role: 'coach',
  firstName: '',
  lastName: '',
}

function StaffPhoto({ member }: { member: StaffMember }) {
  if (!member.photo) {
    return (
      <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center shrink-0 opacity-50">
        <IconUser size={15} />
      </span>
    )
  }
  return (
    <img
      loading="lazy"
      decoding="async"
      src={cdnUrl(member.photo)}
      alt=""
      className="w-9 h-9 rounded-full object-cover shrink-0"
    />
  )
}

/**
 * One member of staff, open for editing.
 *
 * The photograph is saved on its own the moment it is chosen, the way a
 * player's is, and the name and role are saved by the button: an upload that
 * waited for Save would be a picture on screen that is not yet anywhere.
 */
function StaffEditor({
  teamId,
  member,
  onReload,
  onDone,
  onCancel,
}: {
  teamId: string
  member: StaffMember
  /** Refresh the club behind this row, leaving the row open. */
  onReload: () => Promise<void>
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const [firstName, setFirstName] = useState(member.firstName ?? '')
  const [lastName, setLastName] = useState(member.lastName ?? '')
  const [role, setRole] = useState<StaffRole>(member.role)
  // The photograph is saved as soon as it is chosen, so what the uploader
  // shows is kept here rather than read from the prop the reload has not
  // brought back yet.
  const [photo, setPhoto] = useState(member.photo)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!firstName.trim() && !lastName.trim()) {
      setError('A name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await staffService.update(teamId, member.id, {
        role,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      })
      await onDone()
    } catch (caught) {
      setError(messageOf(caught, 'That change could not be saved.'))
      setSaving(false)
    }
  }

  return (
    <li className="px-3 py-3 rounded-lg bg-white/[0.06] space-y-2">
      <div className="flex items-start gap-3">
        <PhotoUploader
          photo={photo}
          alt={staffFullName(member)}
          width={56}
          height={56}
          compressionType="profile"
          label="photo"
          onUpload={async (file) => {
            // The scope names the club and not the person: the API decides the
            // key, and what it has to check is who may edit this club.
            const url = await uploadImage(file, { kind: 'staff', id: teamId })
            await staffService.update(teamId, member.id, { photo: url })
            setPhoto(url)
            // The row stays open — a name being typed above it has not been
            // saved yet, and closing the editor would throw it away.
            await onReload()
          }}
        />
        <div className="grid gap-2 flex-1 sm:grid-cols-[10rem_1fr_1fr]">
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as StaffRole)}
            className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
          >
            {STAFF_ROLES.map((option) => (
              <option key={option} value={option} className="bg-gray-900">
                {staffRoleLabel(option)}
              </option>
            ))}
          </select>
          <input
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            placeholder="First name"
            className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
          />
          <input
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            placeholder="Last name"
            onKeyDown={(event) => event.key === 'Enter' && save()}
            className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-sm"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 transition-colors text-sm"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-sm"
        >
          Cancel
        </button>
        {error && <span className="text-sm text-red-300">{error}</span>}
      </div>
    </li>
  )
}

/** The API's own sentence where it sent one, and a plain one otherwise. */
function messageOf(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : ''
  return message && message.length < 200 ? message : fallback
}
