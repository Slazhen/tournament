import { useEffect, useRef, useState } from 'react'
import type { TextareaHTMLAttributes } from 'react'

type InlineTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
> & {
  value: string | undefined
  /** Called once, when the user finishes editing — not on every keystroke. */
  onCommit: (value: string) => void
}

/**
 * `InlineInput` for the fields that are paragraphs rather than lines.
 *
 * A match report typed into a plain controlled textarea saved on every
 * keystroke: a few hundred words was a few thousand writes of the same record,
 * and the requests raced each other. Escape is deliberately not bound here the
 * way it is on the single-line field — abandoning a paragraph by a stray key
 * costs more than retyping a name.
 */
export default function InlineTextarea({ value, onCommit, ...rest }: InlineTextareaProps) {
  const asText = value ?? ''
  const [draft, setDraft] = useState(asText)
  const isFocused = useRef(false)

  useEffect(() => {
    if (!isFocused.current) setDraft(asText)
  }, [asText])

  return (
    <textarea
      {...rest}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => {
        isFocused.current = true
        rest.onFocus?.(event)
      }}
      onBlur={(event) => {
        isFocused.current = false
        if (draft !== asText) onCommit(draft)
        rest.onBlur?.(event)
      }}
    />
  )
}
