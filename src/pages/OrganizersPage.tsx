import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useAppStore } from '../store'
import { Link } from 'react-router-dom'
import { createOrganizerAccount, deleteOrganizerAccount, resetOrganizerPassword, syncOrganizerEmails } from '../lib/auth'
import { organizerService } from '../lib/aws-database'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoDB, TABLES } from '../lib/aws-config'

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
      if (!newOrganizer.password || newOrganizer.password.length < 6) {
        setCreateError('Password must be at least 6 characters long.')
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

  const handleDeleteOrganizer = async (organizerId: string, organizerEmail: string) => {
    if (!confirm(`Are you sure you want to delete organizer with email "${organizerEmail}"? This will also delete their authentication account and cannot be undone.`)) {
      return
    }

    try {
      // Delete from main system
      await deleteOrganizer(organizerId)
      
      // Delete authentication account
      await deleteOrganizerAccount(organizerEmail)
      
      // Reload organizers
      loadOrganizers()
    } catch (error) {
      console.error('Error deleting organizer:', error)
      alert('Failed to delete organizer. Please try again.')
    }
  }

  const handlePasswordReset = async (organizerEmail: string) => {
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters long.')
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
          <Link to="/admin" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all text-white">
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
              to="/admin"
              className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all border border-white/20 text-white"
            >
              Back to Admin
            </Link>
          </div>
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
                  placeholder="Enter initial password (min 6 characters)"
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
            <button
              onClick={async () => {
                if (confirm('This will sync all organizer emails with their auth accounts. Continue?')) {
                  try {
                    await syncOrganizerEmails()
                    alert('Organizer emails synced successfully!')
                    loadOrganizers() // Reload to show updated data
                  } catch (error) {
                    console.error('Error syncing emails:', error)
                    alert('Failed to sync emails. Please try again.')
                  }
                }
              }}
              className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 rounded-lg transition-all text-blue-400 text-sm"
              title="Sync organizer emails with auth accounts"
            >
              🔄 Sync Emails
            </button>
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
                          Login: {organizer.name} / [Custom Password]
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowPasswordReset(organizer.name)}
                          className="px-3 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-400/30 rounded-lg transition-all text-yellow-400 text-sm"
                          title="Reset Password"
                        >
                          🔑 Reset
                        </button>
                        <button
                          onClick={() => handleDeleteOrganizer(organizer.id, organizer.email)}
                          className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 rounded-lg transition-all text-red-400 text-sm"
                          title="Delete Organizer"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Password Reset Form */}
                  {showPasswordReset === organizer.name && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <div className="flex items-center gap-4">
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password (min 6 characters)"
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
