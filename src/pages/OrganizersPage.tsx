import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useAppStore } from '../store'
import { Link } from 'react-router-dom'
import { createOrganizerAccount } from '../lib/auth'
import { dynamoDB, TABLES } from '../lib/aws-config'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'

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
  const { createOrganizer } = useAppStore()
  const [organizers, setOrganizers] = useState<Organizer[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newOrganizer, setNewOrganizer] = useState({
    name: '',
    email: '',
    description: ''
  })

  useEffect(() => {
    loadOrganizers()
  }, [])

  const loadOrganizers = async () => {
    try {
      setLoading(true)
      const result = await dynamoDB.send(new ScanCommand({
        TableName: TABLES.ORGANIZERS
      }))
      setOrganizers(result.Items as Organizer[] || [])
    } catch (error) {
      console.error('Error loading organizers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateOrganizer = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      // Create organizer in the main system
      await createOrganizer(newOrganizer.name, newOrganizer.email)
      
      // Get the created organizer ID (we'll need to fetch it)
      const result = await dynamoDB.send(new ScanCommand({
        TableName: TABLES.ORGANIZERS,
        FilterExpression: 'name = :name AND email = :email',
        ExpressionAttributeValues: {
          ':name': newOrganizer.name,
          ':email': newOrganizer.email
        }
      }))
      
      const organizer = result.Items?.[0] as Organizer
      if (organizer) {
        // Create auth account for organizer
        await createOrganizerAccount(newOrganizer.name, organizer.id)
      }
      
      // Reset form and reload
      setNewOrganizer({ name: '', email: '', description: '' })
      setShowCreateForm(false)
      loadOrganizers()
    } catch (error) {
      console.error('Error creating organizer:', error)
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
            <h1 className="text-4xl font-bold text-white mb-2">Organizers Management</h1>
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
          <h2 className="text-2xl font-bold text-white mb-6">All Organizers</h2>
          
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
                    <div className="text-right">
                      <p className="text-sm text-gray-400">
                        Created: {new Date(organizer.createdAtISO).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-blue-400 mt-1">
                        Login: {organizer.name} / 123
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
