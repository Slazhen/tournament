import { useState } from 'react'

interface VisibilityToggleProps {
  isPublic: boolean
  onToggle: (isPublic: boolean) => void
  disabled?: boolean
  size?: 'small' | 'medium' | 'large'
}

export default function VisibilityToggle({ 
  isPublic, 
  onToggle, 
  disabled = false, 
  size = 'medium' 
}: VisibilityToggleProps) {
  const [isToggling, setIsToggling] = useState(false)

  const handleToggle = async () => {
    if (disabled || isToggling) return
    
    setIsToggling(true)
    try {
      await onToggle(!isPublic)
    } finally {
      setIsToggling(false)
    }
  }

  const sizeClasses = {
    small: 'w-12 h-6',
    medium: 'w-16 h-8',
    large: 'w-20 h-10'
  }

  const thumbSizeClasses = {
    small: 'w-5 h-5',
    medium: 'w-7 h-7',
    large: 'w-9 h-9'
  }

  const textSizeClasses = {
    small: 'text-xs',
    medium: 'text-sm',
    large: 'text-base'
  }

  return (
    <div className="flex items-center gap-3">
      {/* Toggle Switch */}
      <button
        onClick={handleToggle}
        disabled={disabled || isToggling}
        className={`
          relative inline-flex items-center rounded-full transition-all duration-200 ease-in-out
          ${sizeClasses[size]}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${isPublic 
            ? 'bg-green-500 hover:bg-green-600' 
            : 'bg-gray-600 hover:bg-gray-700'
          }
          ${isToggling ? 'opacity-70' : ''}
        `}
      >
        {/* Thumb */}
        <span
          className={`
            inline-block transform transition-transform duration-200 ease-in-out rounded-full bg-white shadow-lg
            ${thumbSizeClasses[size]}
            ${isPublic ? 'translate-x-full' : 'translate-x-0'}
            ${size === 'small' ? 'translate-x-0.5' : size === 'medium' ? 'translate-x-0.5' : 'translate-x-0.5'}
          `}
        />
        
        {/* Loading spinner */}
        {isToggling && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`animate-spin rounded-full border-2 border-white border-t-transparent ${size === 'small' ? 'w-3 h-3' : size === 'medium' ? 'w-4 h-4' : 'w-5 h-5'}`}></div>
          </div>
        )}
      </button>

      {/* Labels */}
      <div className="flex items-center gap-2">
        <span className={`${textSizeClasses[size]} ${isPublic ? 'text-green-400 font-medium' : 'text-gray-400'}`}>
          🌐 Public
        </span>
        <span className={`${textSizeClasses[size]} ${!isPublic ? 'text-gray-400 font-medium' : 'text-gray-500'}`}>
          🔒 Private
        </span>
      </div>

      {/* Status Text */}
      <div className={`${textSizeClasses[size]} text-gray-300`}>
        {isPublic ? (
          <span className="text-green-400">Visible to everyone</span>
        ) : (
          <span className="text-gray-400">Admin/Organizer only</span>
        )}
      </div>
    </div>
  )
}

// Compact version for smaller spaces
export function CompactVisibilityToggle({ 
  isPublic, 
  onToggle, 
  disabled = false 
}: Omit<VisibilityToggleProps, 'size'>) {
  const [isToggling, setIsToggling] = useState(false)

  const handleToggle = async () => {
    if (disabled || isToggling) return
    
    setIsToggling(true)
    try {
      await onToggle(!isPublic)
    } finally {
      setIsToggling(false)
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={disabled || isToggling}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-white/5'}
        ${isPublic 
          ? 'bg-green-500/20 border border-green-500/30 text-green-300' 
          : 'bg-gray-600/20 border border-gray-600/30 text-gray-400'
        }
        ${isToggling ? 'opacity-70' : ''}
      `}
    >
      <span className="text-sm">
        {isPublic ? '🌐' : '🔒'}
      </span>
      <span className="text-xs font-medium">
        {isPublic ? 'Public' : 'Private'}
      </span>
      {isToggling && (
        <div className="w-3 h-3 animate-spin rounded-full border border-current border-t-transparent"></div>
      )}
    </button>
  )
}
