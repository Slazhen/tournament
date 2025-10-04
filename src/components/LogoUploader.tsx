import React, { useState, useRef, useCallback } from 'react'
import { compressImage, isValidImageType, isValidImageSize, formatFileSize, getCompressionOptions } from '../utils/imageCompression'

interface LogoUploaderProps {
  onLogoUpload: (file: File) => Promise<void>
  currentLogo?: string
  size?: number
  compressionType?: 'logo' | 'profile' | 'tournament' | 'team' | 'general'
}

export default function LogoUploader({ onLogoUpload, currentLogo, size = 80, compressionType = 'logo' }: LogoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')
  const [compressionInfo, setCompressionInfo] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback(async (file: File) => {
    // Validate file type
    if (!isValidImageType(file)) {
      setUploadMessage('Please select a valid image file (JPEG, PNG, WebP)')
      setTimeout(() => setUploadMessage(''), 3000)
      return
    }

    // Validate file size (max 10MB before compression)
    if (!isValidImageSize(file, 10)) {
      setUploadMessage('Image too large. Please select an image smaller than 10MB.')
      setTimeout(() => setUploadMessage(''), 3000)
      return
    }

    setIsUploading(true)
    setUploadMessage('Compressing and uploading...')
    setCompressionInfo('')
    
    try {
      // Get compression options based on type
      const compressionOptions = getCompressionOptions(compressionType)
      
      // Compress the image
      const compressionResult = await compressImage(file, compressionOptions)
      
      // Show compression info
      const compressionInfoText = `${formatFileSize(compressionResult.originalSize)} → ${formatFileSize(compressionResult.compressedSize)} (${compressionResult.compressionRatio.toFixed(1)}% reduction)`
      setCompressionInfo(compressionInfoText)
      
      // Upload the compressed image
      await onLogoUpload(compressionResult.compressedFile)
      
      setUploadMessage('Upload successful!')
      setTimeout(() => {
        setUploadMessage('')
        setCompressionInfo('')
      }, 5000)
    } catch (error) {
      console.error('Error uploading logo:', error)
      setUploadMessage(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setCompressionInfo('')
      setTimeout(() => setUploadMessage(''), 3000)
    } finally {
      setIsUploading(false)
    }
  }, [onLogoUpload, compressionType])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }, [handleFileSelect])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileSelect(files[0])
    }
  }, [handleFileSelect])

  const handleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const displayLogo = currentLogo

  return (
    <div className="space-y-3">
      <div
        className={`
          relative rounded-full overflow-hidden cursor-pointer transition-all
          ${isDragging 
            ? 'border-blue-400 bg-blue-50/20' 
            : 'border-white/30 hover:border-white/50'
          }
          ${displayLogo ? 'border-solid border-white/20' : 'border-2 border-dashed'}
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}
        `}
        style={{ width: size, height: size }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        {displayLogo ? (
          <img 
            src={displayLogo} 
            alt="Logo" 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-2xl mb-2">📷</div>
              <div className="text-xs opacity-70">
                Click or drag to upload
              </div>
            </div>
          </div>
        )}
        
        {/* Overlay for drag state */}
        {isDragging && (
          <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
            <div className="text-white text-center">
              <div className="text-lg">Drop here</div>
            </div>
          </div>
        )}
        
        {/* Uploading overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-white text-center">
              <div className="text-lg">Uploading...</div>
            </div>
          </div>
        )}
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        className="hidden"
      />
      
      {uploadMessage && (
        <div className="text-center">
          <p className={`text-xs ${uploadMessage.includes('successful') ? 'text-green-400' : 'text-red-400'}`}>
            {uploadMessage}
          </p>
        </div>
      )}
      
      {compressionInfo && (
        <div className="text-center">
          <p className="text-xs text-blue-400">
            {compressionInfo}
          </p>
        </div>
      )}
      
      <div className="text-xs opacity-70 text-center">
        <p>Logo will appear as a circle</p>
        <p>Recommended: Square image (1:1 ratio)</p>
        <p className="text-green-400 mt-1">✓ Images are automatically optimized</p>
      </div>
    </div>
  )
}
