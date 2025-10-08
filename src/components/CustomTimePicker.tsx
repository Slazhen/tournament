import { useState, useRef, useEffect } from 'react'

interface CustomTimePickerProps {
  value?: string // Time string in HH:MM format
  onChange: (time: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
}

export default function CustomTimePicker({ 
  value, 
  onChange, 
  className = '', 
  placeholder = 'Select Time',
  disabled = false 
}: CustomTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [displayTime, setDisplayTime] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Parse time string (HH:MM)
  const parseTime = (timeStr?: string) => {
    if (!timeStr) return { hours: 12, minutes: 0 }
    const [hours, minutes] = timeStr.split(':').map(Number)
    return { hours: hours || 12, minutes: minutes || 0 }
  }

  // Format time for display
  const formatDisplayTime = (hours: number, minutes: number) => {
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
    const displayMinutes = minutes.toString().padStart(2, '0')
    return `${displayHours}:${displayMinutes} ${period}`
  }

  // Format time for input (HH:MM)
  const formatInputTime = (hours: number, minutes: number) => {
    const displayMinutes = minutes.toString().padStart(2, '0')
    return `${hours.toString().padStart(2, '0')}:${displayMinutes}`
  }

  // Initialize display time
  useEffect(() => {
    const { hours, minutes } = parseTime(value)
    if (value) {
      setDisplayTime(formatDisplayTime(hours, minutes))
    } else {
      setDisplayTime('')
    }
  }, [value])

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Generate time options
  const generateTimeOptions = () => {
    const options = []
    
    // Generate hours (0-23)
    for (let hour = 0; hour < 24; hour++) {
      // Generate minutes (0, 15, 30, 45)
      for (let minute = 0; minute < 60; minute += 15) {
        const timeString = formatInputTime(hour, minute)
        const displayString = formatDisplayTime(hour, minute)
        options.push({
          value: timeString,
          display: displayString,
          hours: hour,
          minutes: minute
        })
      }
    }
    
    return options
  }

  const timeOptions = generateTimeOptions()

  // Handle time selection
  const handleTimeSelect = (timeString: string) => {
    onChange(timeString)
    const { hours, minutes } = parseTime(timeString)
    setDisplayTime(formatDisplayTime(hours, minutes))
    setIsOpen(false)
  }

  // Clear time
  const clearTime = () => {
    onChange('')
    setDisplayTime('')
    setIsOpen(false)
  }

  // Quick time selections
  const quickTimes = [
    { label: 'Morning', times: ['09:00', '10:00', '11:00', '12:00'] },
    { label: 'Afternoon', times: ['13:00', '14:00', '15:00', '16:00'] },
    { label: 'Evening', times: ['17:00', '18:00', '19:00', '20:00'] }
  ]

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input Display */}
      <div
        className={`
          px-3 py-2 rounded-md border transition-all duration-200 cursor-pointer
          ${disabled 
            ? 'bg-gray-500/20 border-gray-500/30 text-gray-400 cursor-not-allowed' 
            : 'bg-transparent border-white/20 text-white hover:border-white/40 focus-within:border-white/40'
          }
          ${isOpen ? 'border-white/40' : ''}
        `}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <span className={displayTime ? 'text-white' : 'text-gray-400'}>
            {displayTime || placeholder}
          </span>
          <div className="flex items-center gap-2">
            {displayTime && !disabled && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  clearTime()
                }}
                className="text-gray-400 hover:text-red-400 transition-colors"
              >
                ✕
              </button>
            )}
            <svg 
              className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Time Picker Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-white/20 rounded-lg shadow-xl z-50 p-4 min-w-[280px] max-h-80 overflow-y-auto">
          {/* Quick Time Selections */}
          <div className="mb-4">
            <div className="text-xs text-gray-400 mb-2">Quick Select</div>
            {quickTimes.map((group, groupIndex) => (
              <div key={groupIndex} className="mb-2">
                <div className="text-xs text-gray-300 mb-1">{group.label}</div>
                <div className="flex flex-wrap gap-1">
                  {group.times.map((time) => {
                    const { hours, minutes } = parseTime(time)
                    const displayString = formatDisplayTime(hours, minutes)
                    const isSelected = value === time
                    
                    return (
                      <button
                        key={time}
                        onClick={() => handleTimeSelect(time)}
                        className={`
                          px-2 py-1 text-xs rounded transition-colors
                          ${isSelected 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-white/10 text-white hover:bg-white/20'
                          }
                        `}
                      >
                        {displayString}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* All Time Options */}
          <div className="border-t border-white/10 pt-4">
            <div className="text-xs text-gray-400 mb-2">All Times</div>
            <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
              {timeOptions.map((option) => {
                const isSelected = value === option.value
                
                return (
                  <button
                    key={option.value}
                    onClick={() => handleTimeSelect(option.value)}
                    className={`
                      px-2 py-1 text-xs rounded transition-colors text-left
                      ${isSelected 
                        ? 'bg-blue-500 text-white' 
                        : 'text-white hover:bg-white/10'
                      }
                    `}
                  >
                    {option.display}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Custom Time Input */}
          <div className="border-t border-white/10 pt-4 mt-4">
            <div className="text-xs text-gray-400 mb-2">Custom Time</div>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                max="23"
                placeholder="HH"
                className="w-12 px-2 py-1 text-xs rounded bg-transparent border border-white/20 text-white text-center"
                onChange={(e) => {
                  const hours = parseInt(e.target.value) || 0
                  const minutes = parseTime(value).minutes
                  const timeString = formatInputTime(hours, minutes)
                  onChange(timeString)
                }}
              />
              <span className="text-white">:</span>
              <input
                type="number"
                min="0"
                max="59"
                step="15"
                placeholder="MM"
                className="w-12 px-2 py-1 text-xs rounded bg-transparent border border-white/20 text-white text-center"
                onChange={(e) => {
                  const minutes = parseInt(e.target.value) || 0
                  const hours = parseTime(value).hours
                  const timeString = formatInputTime(hours, minutes)
                  onChange(timeString)
                }}
              />
              <button
                onClick={() => setIsOpen(false)}
                className="px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
