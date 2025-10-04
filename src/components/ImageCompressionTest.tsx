import React, { useState } from 'react'
import { compressImage, formatFileSize, getCompressionOptions } from '../utils/imageCompression'

export default function ImageCompressionTest() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [compressionResult, setCompressionResult] = useState<any>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file)
      setCompressionResult(null)
      setError(null)
    } else {
      setError('Please select a valid image file')
    }
  }

  const handleCompress = async (compressionType: 'logo' | 'profile' | 'tournament' | 'team' | 'general') => {
    if (!selectedFile) return

    setIsProcessing(true)
    setError(null)

    try {
      const options = getCompressionOptions(compressionType)
      const result = await compressImage(selectedFile, options)
      setCompressionResult({ ...result, compressionType })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compression failed')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="glass rounded-2xl p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-white mb-6">🧪 Image Compression Test</h2>
      
      {/* File Selection */}
      <div className="mb-6">
        <label className="block text-white mb-2">Select an image to test compression:</label>
        <input
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-500 file:text-white hover:file:bg-blue-600"
        />
      </div>

      {/* File Info */}
      {selectedFile && (
        <div className="mb-6 p-4 bg-blue-500/20 rounded-lg border border-blue-500/30">
          <h3 className="font-semibold text-white mb-2">Selected File:</h3>
          <p className="text-gray-300">Name: {selectedFile.name}</p>
          <p className="text-gray-300">Size: {formatFileSize(selectedFile.size)}</p>
          <p className="text-gray-300">Type: {selectedFile.type}</p>
        </div>
      )}

      {/* Compression Buttons */}
      {selectedFile && (
        <div className="mb-6">
          <h3 className="text-white mb-3">Test different compression types:</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {(['logo', 'profile', 'tournament', 'team', 'general'] as const).map((type) => (
              <button
                key={type}
                onClick={() => handleCompress(type)}
                disabled={isProcessing}
                className="px-3 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 text-white rounded-lg transition-colors text-sm capitalize"
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Processing State */}
      {isProcessing && (
        <div className="mb-6 p-4 bg-yellow-500/20 rounded-lg border border-yellow-500/30">
          <p className="text-yellow-300">Compressing image... Please wait.</p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/20 rounded-lg border border-red-500/30">
          <p className="text-red-300">Error: {error}</p>
        </div>
      )}

      {/* Results */}
      {compressionResult && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Compression Results</h3>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div className="glass rounded-lg p-4 border border-white/20">
              <h4 className="font-semibold text-white mb-2">Original</h4>
              <p className="text-gray-300">Size: {formatFileSize(compressionResult.originalSize)}</p>
              <p className="text-gray-300">Type: {compressionResult.originalFile.type}</p>
            </div>
            
            <div className="glass rounded-lg p-4 border border-white/20">
              <h4 className="font-semibold text-white mb-2">Compressed ({compressionResult.compressionType})</h4>
              <p className="text-gray-300">Size: {formatFileSize(compressionResult.compressedSize)}</p>
              <p className="text-gray-300">Type: {compressionResult.compressedFile.type}</p>
            </div>
          </div>

          <div className="glass rounded-lg p-4 border border-white/20">
            <h4 className="font-semibold text-white mb-2">Compression Stats</h4>
            <p className="text-green-400">
              <strong>{compressionResult.compressionRatio.toFixed(1)}% reduction</strong>
            </p>
            <p className="text-blue-400">
              Saved: {formatFileSize(compressionResult.originalSize - compressionResult.compressedSize)}
            </p>
            <p className="text-gray-300">
              Quality maintained: {compressionResult.qualityMaintained ? '✅ Yes' : '⚠️ Significant compression'}
            </p>
          </div>

          {/* Image Preview */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="font-semibold text-white mb-2">Original</h4>
              <img
                src={URL.createObjectURL(compressionResult.originalFile)}
                alt="Original"
                className="w-full h-32 object-cover rounded-lg border border-white/20"
              />
            </div>
            <div>
              <h4 className="font-semibold text-white mb-2">Compressed</h4>
              <img
                src={URL.createObjectURL(compressionResult.compressedFile)}
                alt="Compressed"
                className="w-full h-32 object-cover rounded-lg border border-white/20"
              />
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 bg-green-500/10 rounded-lg border border-green-500/20">
        <h4 className="font-semibold text-green-300 mb-2">📋 How to use:</h4>
        <ol className="text-sm text-gray-300 space-y-1 list-decimal list-inside">
          <li>Select an image file from your device</li>
          <li>Choose a compression type to test different optimization settings</li>
          <li>Compare the original vs compressed results</li>
          <li>Check the compression ratio and file size savings</li>
        </ol>
      </div>
    </div>
  )
}
