import React, { useState, useRef, useCallback } from 'react'

interface LogoUploaderProps {
  onLogoChange: (logoDataUrl: string) => void
  currentLogo?: string
  size?: number
}

export default function LogoUploader({ onLogoChange, currentLogo, size = 80 }: LogoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [previewLogo, setPreviewLogo] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback((file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        setPreviewLogo(result)
        onLogoChange(result)
      }
      reader.readAsDataURL(file)
    }
  }, [onLogoChange])

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

  const displayLogo = previewLogo || currentLogo

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
            alt="Tournament logo" 
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
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        className="hidden"
      />
      
      {displayLogo && (
        <div className="text-center">
          <button
            onClick={() => {
              setPreviewLogo(null)
              onLogoChange('')
            }}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Remove logo
          </button>
        </div>
      )}
      
      <div className="text-xs opacity-70 text-center">
        <p>Logo will appear as a circle</p>
        <p>Recommended: Square image (1:1 ratio)</p>
      </div>
    </div>
  )
}
