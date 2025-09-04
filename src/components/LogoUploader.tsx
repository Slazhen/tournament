import React, { useState, useRef, useCallback } from 'react'

interface LogoUploaderProps {
  onLogoUpload: (file: File) => Promise<void>
  currentLogo?: string
  size?: number
}

export default function LogoUploader({ onLogoUpload, currentLogo, size = 80 }: LogoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback(async (file: File) => {
    if (file && file.type.startsWith('image/')) {
      setIsUploading(true)
      setUploadMessage('Uploading...')
      
      try {
        await onLogoUpload(file)
        setUploadMessage('Upload successful!')
        setTimeout(() => setUploadMessage(''), 3000)
      } catch (error) {
        console.error('Error uploading logo:', error)
        setUploadMessage('Upload failed')
        setTimeout(() => setUploadMessage(''), 3000)
      } finally {
        setIsUploading(false)
      }
    }
  }, [onLogoUpload])

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
      
      <div className="text-xs opacity-70 text-center">
        <p>Logo will appear as a circle</p>
        <p>Recommended: Square image (1:1 ratio)</p>
      </div>
    </div>
  )
}
