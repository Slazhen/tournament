import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useAppStore } from '../store'
import { Link } from 'react-router-dom'
import {
  createOrganizerAccount,
  createSuperAdminAccount,
  resetOrganizerPassword,
  issueResetLink,
} from '../lib/auth'
import { organizerService } from '../lib/data'
import type { OrganizerImpact } from '../lib/data'
import {
  IconKey,
  IconLink,
  IconTrash,
} from '../components/icons'

interface Organizer {
  id: string
  name: string
  email: string
  createdAtISO: string
  logo?: string
  description?: string
}

export default function OrganizersPage() {
  const { isSuperAdmin } = useAuth()
  const { createOrganizer, deleteOrganizer } = useAppStore()
  const [organizers, setOrganizers] = useState<Organizer[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newOrganizer, setNewOrganizer] = useState({
    name: '',
    email: '',
    description: '',
    password: ''
  })
  const [createError, setCreateError] = useState('')
  const [showPasswordReset, setShowPasswordReset] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  /** A one-time link, per organizer email, ready to be passed on by hand. */
  const [resetLinks, setResetLinks] = useState<Record<string, string>>({})
  /** Whether that link also went out by email, which depends on SES being set up. */
  const [emailedLinks, setEmailedLinks] = useState<Record<string, boolean>>({})
  const [newAdmin, setNewAdmin] = useState({ email: '', displayName: '', password: '' })
  const [adminMessage, setAdminMessage] = useState<string | null>(null)
  /** The organizer whose deletion is being confirmed, and what it would cost. */
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [impact, setImpact] = useState<OrganizerImpact | null>(null)
  const [teamsTo, setTeamsTo] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    loadOrganizers()
  }, [])

  const loadOrganizers = async () => {
    try {
      setLoading(true)
      // Use service method which has pagination and caching
      const organizers = await organizerService.getAll()
      setOrganizers(organizers as Organizer[])
    } catch (error) {
      console.error('Error loading organizers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateOrganizer = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError('')
    
    try {
      // Check if organizer name already exists
      const existingOrganizer = organizers.find(org => 
        org.name.toLowerCase() === newOrganizer.name.toLowerCase()
      )
      
      if (existingOrganizer) {
        setCreateError('An organizer with this name already exists. Please choose a different name.')
        return
      }
      
      // Validate password
      if (!newOrganizer.password || newOrganizer.password.length < 7) {
        setCreateError('Password must be at least 7 characters long, with a digit in it.')
        return
      }
      
      // Create organizer in the main system
      await createOrganizer(newOrganizer.name, newOrganizer.email)
      
      // Get the created organizer by fetching fresh data
      // This is more efficient than scanning with filter
      const allOrganizers = await organizerService.getAll()
      const organizer = allOrganizers.find(org => 
        org.name === newOrganizer.name && org.email === newOrganizer.email
      ) as Organizer
      console.log('Found organizer:', organizer)
      if (organizer) {
        // Create auth account for organizer with custom password
        console.log('Creating auth account for:', newOrganizer.email, 'with ID:', organizer.id)
        await createOrganizerAccount(newOrganizer.email, organizer.id, newOrganizer.password)
        console.log('Auth account created successfully')
      } else {
        console.error('No organizer found after creation')
      }
      
      // Reset form and reload
      setNewOrganizer({ name: '', email: '', description: '', password: '' })
      setShowCreateForm(false)
      loadOrganizers()
    } catch (error) {
      console.error('Error creating organizer:', error)
      setCreateError('Failed to create organizer. Please try again.')
    }
  }

  /**
   * Opens the confirmation, having first asked the server what deleting this
   * organizer would take with it.
   *
   * "Are you sure?" was never enough here: the competitions go, the clubs have
   * to be given to somebody, and the count of each is the thing that decides
   * whether this is a tidy-up or a disaster.
   */
  const handleDeleteOrganizer = async (organizerId: string) => {
    setDeleteError(null)
    setImpact(null)
    setTeamsTo('')
    setPendingDelete(organizerId)

    try {
      const counted = await organizerService.impact(organizerId)
      // Opening a second confirmation while the first is in flight would
      // otherwise show one organizer's numbers under the other's name — and
      // the club count is what decides whether a destination is demanded.
      setPendingDelete((current) => {
        if (current === organizerId) setImpact(counted)
        return current
      })
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not read what this would delete')
    }
  }

  const closeDeletePanel = () => {
    setPendingDelete(null)
    setImpact(null)
    setTeamsTo('')
    setDeleteError(null)
  }

  const confirmDelete = async (organizerId: string) => {
    setDeleteError(null)
    setIsDeleting(true)

    try {
      // One request. The clubs move, the competitions and the logins go with
      // the organizer, and none of it is the browser's to sequence: the second
      // half of the old two-call version failed with "Account not found"
      // whenever there was no account to delete, and reported the whole thing
      // as a failure while the organizer had in fact gone.
      await deleteOrganizer(organizerId, teamsTo || undefined)
      closeDeletePanel()
      loadOrganizers()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete this organizer')
    } finally {
      setIsDeleting(false)
    }
  }

  /**
   * A link the organiser can use to choose their own password.
   *
   * Typing a password for somebody and reading it out means two people know it,
   * and the one who chose it is not the one who has to remember it.
   *
   * The link is emailed as well as shown. It used to be shown only — the button
   * asked the API not to send it — which left the super admin passing it on by
   * hand even once email worked, and made "the reset email never arrives" look
   * like a broken mail server rather than a request that was never made.
   */
  const handleResetLink = async (organizerEmail: string) => {
    try {
      const result = await issueResetLink(organizerEmail, true)
      setResetLinks((current) => ({ ...current, [organizerEmail]: result.link }))
      setEmailedLinks((current) => ({ ...current, [organizerEmail]: result.emailed }))
      try {
        await navigator.clipboard.writeText(result.link)
      } catch {
        // The link is on screen either way.
      }
    } catch (error) {
      console.error('Error issuing a reset link:', error)
      alert('Could not create a reset link. Is there an account for this email?')
    }
  }

  const handlePasswordReset = async (organizerEmail: string) => {
    if (!newPassword || newPassword.length < 7) {
      setPasswordError('Password must be at least 7 characters long, with a digit in it.')
      return
    }

    try {
      await resetOrganizerPassword(organizerEmail, newPassword)
      setShowPasswordReset(null)
      setNewPassword('')
      setPasswordError('')
      alert('Password reset successfully!')
    } catch (error) {
      console.error('Error resetting password:', error)
      setPasswordError('Failed to reset password. Please try again.')
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black flex items-center justify-center">
        <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold mb-4 text-white">Access Denied</h1>
          <p className="text-gray-400 mb-6">You need super admin privileges to access this page</p>
          <Link to="/dashboard" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all text-white">
            Back to Admin
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-black">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <h1 className="text-4xl font-bold text-white">Organizers Management</h1>
              <div className="px-4 py-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-400/30 rounded-full">
                <span className="text-yellow-400 font-semibold text-sm flex items-center gap-2">
                  <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                  SUPERADMIN
                </span>
              </div>
            </div>
            <p className="text-gray-400">Manage tournament organizers and their access</p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-6 py-3 rounded-lg glass hover:bg-green-500/20 transition-all border border-green-400/30 text-green-400"
            >
              + Create Organizer
            </button>
            <Link
              to="/dashboard"
              className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all border border-white/20 text-white"
            >
              Back to Admin
            </Link>
          </div>
        </div>

        {/* ---------- Super admins ---------- */}
        <div className="glass rounded-2xl p-6 mb-8 border border-yellow-400/20">
          <h2 className="text-xl font-bold text-white mb-2">Super admins</h2>
          <p className="text-sm text-gray-400 mb-5">
            This role has nobody above it to reset its password, so it should never be one account.
            A second one is the spare key.
          </p>

          <form
            onSubmit={async (event) => {
              event.preventDefault()
              setAdminMessage(null)
              try {
                await createSuperAdminAccount(
                  newAdmin.email.trim().toLowerCase(),
                  newAdmin.password,
                  newAdmin.displayName.trim() || undefined,
                )
                setAdminMessage(`${newAdmin.email.trim()} can now sign in as a super admin.`)
                setNewAdmin({ email: '', displayName: '', password: '' })
              } catch (error) {
                setAdminMessage(
                  error instanceof Error && error.message
                    ? error.message
                    : 'That account could not be created.',
                )
              }
            }}
            className="grid gap-3 sm:grid-cols-4 items-end"
          >
            <label className="text-sm sm:col-span-1">
              <span className="text-gray-300">Email</span>
              <input
                type="email"
                required
                value={newAdmin.email}
                onChange={(event) => setNewAdmin({ ...newAdmin, email: event.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-white"
                placeholder="you@example.com"
              />
            </label>
            <label className="text-sm sm:col-span-1">
              <span className="text-gray-300">Display name</span>
              <input
                type="text"
                value={newAdmin.displayName}
                onChange={(event) => setNewAdmin({ ...newAdmin, displayName: event.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-white"
                placeholder="Igor"
              />
            </label>
            <label className="text-sm sm:col-span-1">
              <span className="text-gray-300">Password</span>
              <input
                type="password"
                required
                value={newAdmin.password}
                onChange={(event) => setNewAdmin({ ...newAdmin, password: event.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-white/40 focus:outline-none text-white"
                placeholder="A real one"
              />
            </label>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-400/30 text-yellow-300 transition-all"
            >
              Add super admin
            </button>
          </form>

          {adminMessage && <p className="mt-3 text-sm text-gray-300">{adminMessage}</p>}
        </div>

        {/* Create Organizer Form */}
        {showCreateForm && (
          <div className="glass rounded-2xl p-8 mb-8 shadow-2xl border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-6">Create New Organizer</h2>
            <form onSubmit={handleCreateOrganizer} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={newOrganizer.name}
                    onChange={(e) => setNewOrganizer({ ...newOrganizer, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all text-white placeholder-gray-400"
                    placeholder="Enter organization name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newOrganizer.email}
                    onChange={(e) => setNewOrganizer({ ...newOrganizer, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all text-white placeholder-gray-400"
                    placeholder="Enter email address"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={newOrganizer.description}
                  onChange={(e) => setNewOrganizer({ ...newOrganizer, description: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all text-white placeholder-gray-400"
                  placeholder="Enter organization description"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Initial Password
                </label>
                <input
                  type="password"
                  value={newOrganizer.password}
                  onChange={(e) => setNewOrganizer({ ...newOrganizer, password: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all text-white placeholder-gray-400"
                  placeholder="Enter initial password (min 7 characters)"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">This will be the organizer's login password</p>
              </div>
              {createError && (
                <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-4">
                  <p className="text-red-400 text-sm">{createError}</p>
                </div>
              )}
              
              <div className="flex gap-4">
                <button
                  type="submit"
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-semibold rounded-xl transition-all duration-300"
                >
                  Create Organizer
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-6 py-3 rounded-xl glass hover:bg-white/10 transition-all border border-white/20 text-white"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Organizers List */}
        <div className="glass rounded-2xl p-8 shadow-2xl border border-white/20">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">All Organizers</h2>
          </div>
          
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-white">Loading organizers...</p>
            </div>
          ) : organizers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400">No organizers found</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {organizers.map((organizer) => (
                <div key={organizer.id} className="bg-white/5 rounded-xl p-6 border border-white/10 hover:bg-white/10 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {organizer.logo ? (
                        <img
              loading="lazy"
              decoding="async" 
                          src={organizer.logo} 
                          alt={`${organizer.name} logo`}
                          className="w-12 h-12 rounded-full object-cover border border-white/20"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-white/20 to-white/10 flex items-center justify-center border border-white/20">
                          <span className="text-lg font-bold text-white">
                            {organizer.name.charAt(0)}
                          </span>
                        </div>
                      )}
                      <div>
                        <h3 className="text-xl font-semibold text-white">{organizer.name}</h3>
                        <p className="text-gray-400">{organizer.email}</p>
                        {organizer.description && (
                          <p className="text-sm text-gray-500 mt-1">{organizer.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm text-gray-400">
                          Created: {new Date(organizer.createdAtISO).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-blue-400 mt-1">
                          Signs in with {organizer.email}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleResetLink(organizer.email)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 rounded-lg transition-all text-blue-300 text-sm"
                          title="Create a one-time link so they can choose their own password"
                        >
                          <IconLink size={14} /> Reset link
                        </button>
                        <button
                          onClick={() => setShowPasswordReset(organizer.email)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-400/30 rounded-lg transition-all text-yellow-400 text-sm"
                          title="Set a password directly"
                        >
                          <IconKey size={14} /> Set password
                        </button>
                        <button
                          onClick={() => handleDeleteOrganizer(organizer.id)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 rounded-lg transition-all text-red-400 text-sm"
                          title="Delete Organizer"
                        >
                          <IconTrash size={14} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* What deleting this organizer costs, before it is done. */}
                  {pendingDelete === organizer.id && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      {!impact && !deleteError ? (
                        <p className="text-sm text-gray-400">Working out what this would delete…</p>
                      ) : (
                        impact && (
                          <div className="space-y-3">
                            <p className="text-sm text-white">
                              Deleting {organizer.name} cannot be undone.
                            </p>
                            <ul className="text-sm text-gray-300 space-y-1">
                              <li>
                                {impact.tournaments.length === 0
                                  ? 'No competitions to delete.'
                                  : `${impact.tournaments.length} ${impact.tournaments.length === 1 ? 'competition is' : 'competitions are'} deleted with it: ${impact.tournaments.map((t) => t.name).join(', ')}.`}
                              </li>
                              <li>
                                {impact.accounts.length === 0
                                  ? 'No login is attached to it.'
                                  : `${impact.accounts.length === 1 ? 'This login stops working' : 'These logins stop working'}: ${impact.accounts.join(', ')}.`}
                              </li>
                              <li>
                                {impact.teams.length === 0
                                  ? 'No clubs to move.'
                                  : `${impact.teams.length} ${impact.teams.length === 1 ? 'club moves' : 'clubs move'} to another organizer: ${impact.teams.map((t) => t.name).join(', ')}.`}
                              </li>
                            </ul>

                            {impact.teams.length > 0 && (
                              <div>
                                <label className="block text-sm text-gray-300 mb-2">
                                  Move the clubs to
                                </label>
                                <select
                                  value={teamsTo}
                                  onChange={(e) => setTeamsTo(e.target.value)}
                                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-blue-400/50 focus:outline-none text-white"
                                >
                                  <option value="">Choose an organizer…</option>
                                  {organizers
                                    .filter((candidate) => candidate.id !== organizer.id)
                                    .map((candidate) => (
                                      <option key={candidate.id} value={candidate.id}>
                                        {candidate.name}
                                      </option>
                                    ))}
                                </select>
                                {organizers.length === 1 && (
                                  <p className="text-sm text-amber-300/90 mt-2">
                                    There is nobody else to give them to. Create another organizer
                                    first, or move the clubs by hand.
                                  </p>
                                )}
                              </div>
                            )}

                            <div className="flex gap-2">
                              <button
                                onClick={() => confirmDelete(organizer.id)}
                                disabled={isDeleting || (impact.teams.length > 0 && !teamsTo)}
                                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed border border-red-400/30 rounded-lg transition-all text-red-300 text-sm"
                              >
                                {isDeleting ? 'Deleting…' : 'Delete organizer'}
                              </button>
                            </div>
                          </div>
                        )
                      )}

                      {deleteError && <p className="text-red-400 text-sm mt-3">{deleteError}</p>}

                      {/* Outside the panel above, so there is still a way out
                          when reading the impact is what failed. */}
                      <button
                        onClick={closeDeletePanel}
                        className="mt-3 px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 border border-gray-400/30 rounded-lg transition-all text-gray-300 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* The link, once it exists: copied already, shown so it can be re-copied. */}
                  {resetLinks[organizer.email] && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <p className="text-sm text-gray-300 mb-2">
                        {emailedLinks[organizer.email]
                          ? `Sent to ${organizer.email}, and copied to your clipboard. It works once and expires in an hour.`
                          : 'One-time link, copied to your clipboard. Email is not sending, so pass it on yourself. It works once and expires in an hour.'}
                      </p>
                      <code className="block text-xs bg-black/40 border border-white/10 rounded-lg p-3 break-all text-blue-200">
                        {resetLinks[organizer.email]}
                      </code>
                    </div>
                  )}

                  {/* Password Reset Form */}
                  {showPasswordReset === organizer.email && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <div className="flex items-center gap-4">
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password (min 7 characters)"
                          className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/20 focus:border-yellow-400/50 focus:outline-none focus:ring-2 focus:ring-yellow-400/20 transition-all text-white placeholder-gray-400"
                        />
                        <button
                          onClick={() => handlePasswordReset(organizer.email)}
                          className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-400/30 rounded-lg transition-all text-green-400 text-sm"
                        >
                          Update
                        </button>
                        <button
                          onClick={() => {
                            setShowPasswordReset(null)
                            setNewPassword('')
                            setPasswordError('')
                          }}
                          className="px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 border border-gray-400/30 rounded-lg transition-all text-gray-400 text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                      {passwordError && (
                        <p className="text-red-400 text-sm mt-2">{passwordError}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
