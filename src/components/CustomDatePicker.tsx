import { useState, useRef, useEffect } from 'react'

interface CustomDatePickerProps {
  value?: string // ISO date string or empty string
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
  const [isOpen, setIsOpen] = useState(false)
  const [displayDate, setDisplayDate] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Parse the ISO date string
  const parseDate = (dateStr?: string) => {
    if (!dateStr) return null
    try {
      return new Date(dateStr)
    } catch {
      return null
    }
  }

  // Format date for display
  const formatDisplayDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }


  // Initialize display date
  useEffect(() => {
    const date = parseDate(value)
    if (date && !isNaN(date.getTime())) {
      setDisplayDate(formatDisplayDate(date))
    } else {
      setDisplayDate('')
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

  // Get current date
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  // Generate calendar data
  const generateCalendar = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1)
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - firstDay.getDay()) // Start from Sunday

    const days = []
    const currentDate = new Date(startDate)

    // Generate 42 days (6 weeks)
    for (let i = 0; i < 42; i++) {
      days.push(new Date(currentDate))
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return days
  }

  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)

  // Month names
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  // Day names
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Handle date selection
  const handleDateSelect = (date: Date) => {
    const isoDate = date.toISOString().split('T')[0]
    onChange(isoDate)
    setDisplayDate(formatDisplayDate(date))
    setIsOpen(false)
  }

  // Navigate months
  const navigateMonth = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      if (selectedMonth === 0) {
        setSelectedYear(selectedYear - 1)
        setSelectedMonth(11)
      } else {
        setSelectedMonth(selectedMonth - 1)
      }
    } else {
      if (selectedMonth === 11) {
        setSelectedYear(selectedYear + 1)
        setSelectedMonth(0)
      } else {
        setSelectedMonth(selectedMonth + 1)
      }
    }
  }

  // Clear date
  const clearDate = () => {
    onChange('')
    setDisplayDate('')
    setIsOpen(false)
  }

  // Get current selected date for comparison
  const currentSelectedDate = parseDate(value)
  const calendarDays = generateCalendar(selectedYear, selectedMonth)

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
          <span className={displayDate ? 'text-white' : 'text-gray-400'}>
            {displayDate || placeholder}
          </span>
          <div className="flex items-center gap-2">
            {displayDate && !disabled && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  clearDate()
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

      {/* Calendar Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-white/20 rounded-lg shadow-xl z-50 p-4 min-w-[280px]">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-1 hover:bg-white/10 rounded transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            <div className="flex items-center gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-transparent text-white text-sm border-none outline-none"
              >
                {monthNames.map((month, index) => (
                  <option key={index} value={index} className="bg-gray-800">
                    {month}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-transparent text-white text-sm border-none outline-none"
              >
                {Array.from({ length: 10 }, (_, i) => currentYear - 2 + i).map(year => (
                  <option key={year} value={year} className="bg-gray-800">
                    {year}
                  </option>
                ))}
              </select>
            </div>
            
            <button
              onClick={() => navigateMonth('next')}
              className="p-1 hover:bg-white/10 rounded transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {dayNames.map(day => (
              <div key={day} className="text-center text-xs text-gray-400 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date, index) => {
              const isCurrentMonth = date.getMonth() === selectedMonth
              const isToday = date.toDateString() === now.toDateString()
              const isSelected = currentSelectedDate && date.toDateString() === currentSelectedDate.toDateString()
              
              return (
                <button
                  key={index}
                  onClick={() => handleDateSelect(date)}
                  className={`
                    w-8 h-8 text-xs rounded transition-colors
                    ${!isCurrentMonth 
                      ? 'text-gray-600 hover:bg-white/5' 
                      : isSelected
                        ? 'bg-blue-500 text-white'
                        : isToday
                          ? 'bg-blue-500/30 text-blue-300 hover:bg-blue-500/50'
                          : 'text-white hover:bg-white/10'
                    }
                  `}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>

          {/* Quick Actions */}
          <div className="flex justify-between mt-4 pt-3 border-t border-white/10">
            <button
              onClick={() => {
                const today = new Date()
                handleDateSelect(today)
              }}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => {
                const tomorrow = new Date()
                tomorrow.setDate(tomorrow.getDate() + 1)
                handleDateSelect(tomorrow)
              }}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Tomorrow
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
