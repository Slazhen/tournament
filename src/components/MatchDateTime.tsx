import { combineLocal, localDatePart, localTimePart } from '../utils/datetime'

type MatchDateTimeProps = {
  /** The match's stored timestamp (UTC ISO), or undefined when unscheduled. */
  value?: string
  onChange: (iso: string | undefined) => void
  /** Compact rows in the fixtures table use 'sm'. */
  size?: 'sm' | 'md'
  disabled?: boolean
}

/**
 * Kick-off date and time for one match.
 *
 * Both fields are native inputs. The previous time control was a plain text box
 * that demanded exactly "HH:MM" — typing 1930 left an invalid value that was
 * silently discarded on blur, and the arrow keys did nothing. A native time
 * input handles the separator, the arrows, the locale's 12/24-hour display and
 * the phone keyboard, and it still hands back "HH:MM".
 *
 * The date and time are read and written in local time together, so changing one
 * never shifts the other across a day boundary.
 */
export default function MatchDateTime({
  value,
  onChange,
  size = 'md',
  disabled = false,
}: MatchDateTimeProps) {
  const date = localDatePart(value)
  const time = localTimePart(value)

  const field =
    `px-2 py-1.5 rounded-md bg-white/5 border border-white/20 text-white ` +
    `hover:border-white/40 focus:border-white/50 focus:outline-none disabled:opacity-40 ` +
    (size === 'sm' ? 'text-xs' : 'text-sm')

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={date}
        disabled={disabled}
        onChange={(event) => {
          const nextDate = event.target.value
          onChange(nextDate ? combineLocal(nextDate, time) : undefined)
        }}
        className={`${field} flex-1 min-w-[8.5rem]`}
        aria-label="Match date"
      />
      <input
        type="time"
        value={time}
        disabled={disabled || !date}
        onChange={(event) => {
          const nextTime = event.target.value
          if (!nextTime) return
          // Scheduling a time on a match with no date yet would be meaningless,
          // so the field stays disabled until a date is picked.
          onChange(combineLocal(date, nextTime))
        }}
        className={`${field} w-[6.5rem]`}
        aria-label="Kick-off time"
        title={date ? 'Kick-off time' : 'Pick a date first'}
      />
    </div>
  )
}
