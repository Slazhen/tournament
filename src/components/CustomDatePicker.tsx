import { useState, useEffect } from 'react'

interface CustomDatePickerProps {
  value?: string // ISO date string (YYYY-MM-DD format) or empty string
  onChange: (date: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
}

export default function CustomDatePicker({ 
  value, 
  onChange, 
  className = '', 
  placeholder = 'Select Date',
  disabled = false 
}: CustomDatePickerProps) {
  const [inputValue, setInputValue] = useState('')

  // Convert ISO date string to YYYY-MM-DD format for input
  const formatDateForInput = (dateStr?: string): string => {
    if (!dateStr) return ''
    try {
      // If it's already in YYYY-MM-DD format, return as is
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr
      }
      // Otherwise, parse and format
      const date = new Date(dateStr)
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }
    } catch {
      // Invalid date
    }
    return ''
  }

  // Initialize input value
  useEffect(() => {
    setInputValue(formatDateForInput(value))
  }, [value])

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    
    // Only call onChange if the date is valid
    if (newValue && /^\d{4}-\d{2}-\d{2}$/.test(newValue)) {
      // Validate the date
      const date = new Date(newValue)
      if (!isNaN(date.getTime())) {
        // Ensure the date string matches what was entered (to avoid timezone issues)
        const [year, month, day] = newValue.split('-').map(Number)
        const localDate = new Date(year, month - 1, day)
        const localYear = localDate.getFullYear()
        const localMonth = String(localDate.getMonth() + 1).padStart(2, '0')
        const localDay = String(localDate.getDate()).padStart(2, '0')
        const formattedDate = `${localYear}-${localMonth}-${localDay}`
        
        // Only update if the date is valid and matches
        if (localDate.getFullYear() === year && 
            localDate.getMonth() === month - 1 && 
            localDate.getDate() === day) {
          onChange(formattedDate)
        }
      }
    } else if (!newValue) {
      // Empty value is allowed
      onChange('')
    }
  }

  // Handle blur to ensure valid date
  const handleBlur = () => {
    if (inputValue && !/^\d{4}-\d{2}-\d{2}$/.test(inputValue)) {
      // Invalid format, reset to current value
      setInputValue(formatDateForInput(value))
    }
  }

  return (
    <div className={`relative ${className}`}>
      <input
        type="date"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={placeholder}
        className={`
          w-full px-3 py-2 rounded-md border transition-all duration-200
          ${disabled 
            ? 'bg-gray-500/20 border-gray-500/30 text-gray-400 cursor-not-allowed' 
            : 'bg-transparent border-white/20 text-white hover:border-white/40 focus:border-white/40 focus:outline-none'
          }
          ${className}
        `}
      />
    </div>
  )
}
