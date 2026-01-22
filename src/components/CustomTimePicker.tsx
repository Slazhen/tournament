import { useState, useEffect } from 'react'

interface CustomTimePickerProps {
  value?: string // Time string in HH:MM format (24-hour)
  onChange: (time: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
}

export default function CustomTimePicker({ 
  value, 
  onChange, 
  className = '', 
  placeholder = 'HH:MM',
  disabled = false 
}: CustomTimePickerProps) {
  const [inputValue, setInputValue] = useState('')

  // Validate and format time input (HH:MM format, 24-hour)
  const validateTime = (timeStr: string): string | null => {
    // Remove any non-digit characters except colon
    const cleaned = timeStr.replace(/[^\d:]/g, '')
    
    // Check format HH:MM
    if (!/^\d{1,2}:\d{0,2}$/.test(cleaned) && cleaned !== '') {
      return null
    }
    
    const parts = cleaned.split(':')
    if (parts.length !== 2) {
      return null
    }
    
    const hours = parseInt(parts[0], 10)
    const minutes = parseInt(parts[1] || '0', 10)
    
    // Validate hours (0-23) and minutes (0-59)
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null
    }
    
    // Format as HH:MM
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  // Initialize input value
  useEffect(() => {
    if (value && /^\d{2}:\d{2}$/.test(value)) {
      setInputValue(value)
    } else {
      setInputValue('')
    }
  }, [value])

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    
    // Validate and update if valid
    const validated = validateTime(newValue)
    if (validated) {
      onChange(validated)
    } else if (newValue === '') {
      // Allow empty value
      onChange('')
    }
  }

  // Handle blur - ensure valid format
  const handleBlur = () => {
    if (inputValue) {
      const validated = validateTime(inputValue)
      if (validated) {
        setInputValue(validated)
        onChange(validated)
      } else {
        // Invalid format, reset to current value or clear
        if (value) {
          setInputValue(value)
        } else {
          setInputValue('')
          onChange('')
        }
      }
    } else {
      onChange('')
    }
  }

  // Handle key press for better UX
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow numbers, colon, backspace, delete, arrow keys
    if (!/[0-9:]/.test(e.key) && 
        !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.key)) {
      e.preventDefault()
    }
  }

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyPress}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={5}
        pattern="[0-9]{2}:[0-9]{2}"
        className={`
          w-full px-3 py-2 rounded-md border transition-all duration-200
          ${disabled 
            ? 'bg-gray-500/20 border-gray-500/30 text-gray-400 cursor-not-allowed' 
            : 'bg-transparent border-white/20 text-white hover:border-white/40 focus:border-white/40 focus:outline-none'
          }
          ${className}
        `}
        style={{ fontFamily: 'monospace', minWidth: '80px' }}
      />
    </div>
  )
}
