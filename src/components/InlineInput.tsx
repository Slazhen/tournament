import { useEffect, useRef, useState } from 'react'
import type { InputHTMLAttributes } from 'react'

type InlineInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string | number | undefined
  /** Called once, when the user finishes editing — not on every keystroke. */
  onCommit: (value: string) => void
}

/**
 * A field that edits locally and saves when the user is done.
 *
 * The admin pages used to call the API from onChange, so a six-letter surname
 * meant six writes to the database, each one sending the whole record. Beyond
 * the cost, the requests raced: type a first name and a surname quickly and the
 * second save could land on data fetched before the first, silently undoing it.
 *
 * Here the keystrokes stay in local state and one save happens on blur (or Enter).
 * Escape abandons the edit. If the value changes underneath while the field is
 * not focused — another tab, a reload — the field follows it.
 */
export default function InlineInput({ value, onCommit, ...rest }: InlineInputProps) {
  const asText = value === undefined || value === null ? '' : String(value)
  const [draft, setDraft] = useState(asText)
  const isFocused = useRef(false)

  useEffect(() => {
    if (!isFocused.current) setDraft(asText)
  }, [asText])

  const commit = () => {
    if (draft !== asText) onCommit(draft)
  }

  return (
    <input
      {...rest}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => {
        isFocused.current = true
        rest.onFocus?.(event)
      }}
      onBlur={(event) => {
        isFocused.current = false
        commit()
        rest.onBlur?.(event)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          setDraft(asText)
          isFocused.current = false
          event.currentTarget.blur()
        }
        rest.onKeyDown?.(event)
      }}
    />
  )
}
