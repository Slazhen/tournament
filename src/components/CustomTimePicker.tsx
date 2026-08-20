interface CustomTimePickerProps {
  /** Time as HH:MM, or an empty string. */
  value?: string
  onChange: (time: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
}

/**
 * A time field.
 *
 * This used to be a text box with maxLength=5 that only accepted a value already
 * shaped exactly "HH:MM": typing 1930 produced an invalid string that blur threw
 * away, the arrow keys were swallowed by a keydown filter, and nothing on screen
 * said what format was expected. A native time input handles the separator and
 * the arrows, brings up the right keyboard on a phone, shows the user's own
 * 12/24-hour preference, and still reports "HH:MM".
 */
export default function CustomTimePicker({
  value,
  onChange,
  className = '',
  disabled = false,
}: CustomTimePickerProps) {
  return (
    <input
      type="time"
      value={value && /^\d{2}:\d{2}$/.test(value) ? value : ''}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={`
        px-3 py-2 rounded-md border transition-all duration-200
        ${
          disabled
            ? 'bg-gray-500/20 border-gray-500/30 text-gray-400 cursor-not-allowed'
            : 'bg-white/5 border-white/20 text-white hover:border-white/40 focus:border-white/50 focus:outline-none'
        }
        ${className}
      `}
      aria-label="Time"
    />
  )
}
