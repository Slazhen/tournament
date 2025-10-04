import React, { useState } from 'react'
import { processAllImages, getProcessingPreview, ImageProcessingStats } from '../utils/imageProcessor'
import { formatFileSize } from '../utils/imageCompression'

interface ProcessingPreview {
  entityType: string
  count: number
  totalSize: number
}

export default function ImageProcessor() {
  const [isLoading, setIsLoading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [preview, setPreview] = useState<ProcessingPreview[]>([])
  const [stats, setStats] = useState<ImageProcessingStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [options, setOptions] = useState({
    skipOrganizers: false,
    skipTournaments: false,
    skipTeams: false,
    skipPlayers: true, // Skip players by default as they might not have a table
    dryRun: false
  })

  const handleGetPreview = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const previewData = await getProcessingPreview()
      setPreview(previewData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get preview')
    } finally {
      setIsLoading(false)
    }
  }

  const handleProcessImages = async () => {
    if (!confirm('This will process and compress all images in the database. Continue?')) {
      return
    }

    setIsProcessing(true)
    setError(null)
    
    try {
      const processingStats = await processAllImages(options)
      setStats(processingStats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process images')
    } finally {
      setIsProcessing(false)
    }
  }

  const totalImages = preview.reduce((sum, item) => sum + item.count, 0)

  return (
    <div className="glass rounded-2xl p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">🖼️ Image Processor</h2>
        <p className="text-gray-300">
          Optimize existing images in your database to reduce file sizes and improve site performance.
        </p>
      </div>

      {/* Preview Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Database Preview</h3>
          <button
            onClick={handleGetPreview}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white rounded-lg transition-colors"
          >
            {isLoading ? 'Loading...' : 'Get Preview'}
          </button>
        </div>

        {preview.length > 0 && (
          <div className="grid gap-4 md:grid-cols-3">
            {preview.map((item, index) => (
              <div key={index} className="glass rounded-lg p-4 border border-white/20">
                <h4 className="font-semibold text-white mb-2">{item.entityType}</h4>
                <p className="text-gray-300">Images: {item.count}</p>
                <p className="text-gray-300">Size: {formatFileSize(item.totalSize)}</p>
              </div>
            ))}
          </div>
        )}

        {totalImages > 0 && (
          <div className="mt-4 p-4 bg-blue-500/20 rounded-lg border border-blue-500/30">
            <p className="text-blue-300">
              <strong>Total:</strong> {totalImages} images found in database
            </p>
          </div>
        )}
      </div>

      {/* Options Section */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">Processing Options</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={!options.skipOrganizers}
                onChange={(e) => setOptions(prev => ({ ...prev, skipOrganizers: !e.target.checked }))}
                className="rounded border-gray-300"
              />
              <span className="text-white">Process Organizer Logos</span>
            </label>
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={!options.skipTournaments}
                onChange={(e) => setOptions(prev => ({ ...prev, skipTournaments: !e.target.checked }))}
                className="rounded border-gray-300"
              />
              <span className="text-white">Process Tournament Images</span>
            </label>
          </div>
          <div className="space-y-3">
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={!options.skipTeams}
                onChange={(e) => setOptions(prev => ({ ...prev, skipTeams: !e.target.checked }))}
                className="rounded border-gray-300"
              />
              <span className="text-white">Process Team Logos</span>
            </label>
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={!options.skipPlayers}
                onChange={(e) => setOptions(prev => ({ ...prev, skipPlayers: !e.target.checked }))}
                className="rounded border-gray-300"
              />
              <span className="text-white">Process Player Photos</span>
            </label>
          </div>
        </div>
      </div>

      {/* Process Button */}
      <div className="mb-6">
        <button
          onClick={handleProcessImages}
          disabled={isProcessing || totalImages === 0}
          className="w-full px-6 py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 text-white rounded-lg transition-colors font-semibold"
        >
          {isProcessing ? 'Processing Images...' : `Process ${totalImages} Images`}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg">
          <p className="text-red-300">Error: {error}</p>
        </div>
      )}

      {/* Results Display */}
      {stats && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Processing Results</h3>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="glass rounded-lg p-4 border border-white/20">
              <h4 className="font-semibold text-white mb-2">Total Images</h4>
              <p className="text-2xl text-blue-400">{stats.totalImages}</p>
            </div>
            
            <div className="glass rounded-lg p-4 border border-white/20">
              <h4 className="font-semibold text-white mb-2">Successfully Processed</h4>
              <p className="text-2xl text-green-400">{stats.processedImages}</p>
            </div>
            
            <div className="glass rounded-lg p-4 border border-white/20">
              <h4 className="font-semibold text-white mb-2">Failed</h4>
              <p className="text-2xl text-red-400">{stats.failedImages}</p>
            </div>
            
            <div className="glass rounded-lg p-4 border border-white/20">
              <h4 className="font-semibold text-white mb-2">Skipped</h4>
              <p className="text-2xl text-yellow-400">{stats.skippedImages}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="glass rounded-lg p-4 border border-white/20">
              <h4 className="font-semibold text-white mb-2">Original Size</h4>
              <p className="text-lg text-gray-300">{formatFileSize(stats.totalOriginalSize)}</p>
            </div>
            
            <div className="glass rounded-lg p-4 border border-white/20">
              <h4 className="font-semibold text-white mb-2">Compressed Size</h4>
              <p className="text-lg text-gray-300">{formatFileSize(stats.totalCompressedSize)}</p>
            </div>
            
            <div className="glass rounded-lg p-4 border border-white/20">
              <h4 className="font-semibold text-white mb-2">Total Savings</h4>
              <p className="text-lg text-green-400">{formatFileSize(stats.totalSavings)}</p>
              <p className="text-sm text-gray-400">
                ({((stats.totalSavings / stats.totalOriginalSize) * 100).toFixed(1)}% reduction)
              </p>
            </div>
          </div>

          <div className="glass rounded-lg p-4 border border-white/20">
            <h4 className="font-semibold text-white mb-2">Average Compression Ratio</h4>
            <p className="text-lg text-blue-400">{stats.averageCompressionRatio.toFixed(1)}%</p>
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="mt-6 p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
        <h4 className="font-semibold text-blue-300 mb-2">ℹ️ Important Information</h4>
        <ul className="text-sm text-gray-300 space-y-1">
          <li>• Images are compressed to optimize file size while maintaining quality</li>
          <li>• Original images are replaced with compressed versions</li>
          <li>• Processing may take several minutes depending on the number of images</li>
          <li>• Make sure to backup your data before processing</li>
          <li>• New image uploads are automatically compressed</li>
        </ul>
      </div>
    </div>
  )
}
