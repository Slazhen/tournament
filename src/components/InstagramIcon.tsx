import { useId } from 'react'

interface InstagramIconProps {
  size?: number
  className?: string
}

/**
 * Instagram's own mark: the rounded square, the lens and the flash, drawn as
 * outlines on the brand gradient.
 *
 * What stood here was an approximation — a filled square with a white disc in
 * it — which read as a generic camera badge next to a real Facebook logo.
 */
export default function InstagramIcon({ size = 16, className = '' }: InstagramIconProps) {
  // The gradient needs an id unique to this instance — two of these on one page
  // sharing one makes the second reuse the first one's definition — and a
  // stable one, so a re-render does not repaint the fill.
  const gradientId = `instagram-${useId()}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={gradientId} cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#FDF497" />
          <stop offset="5%" stopColor="#FDF497" />
          <stop offset="45%" stopColor="#FD5949" />
          <stop offset="60%" stopColor="#D6249F" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>

      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill={`url(#${gradientId})`} />
      <rect
        x="5.25"
        y="5.25"
        width="13.5"
        height="13.5"
        rx="4"
        fill="none"
        stroke="white"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="3.4" fill="none" stroke="white" strokeWidth="1.6" />
      <circle cx="17" cy="7" r="1.1" fill="white" />
    </svg>
  )
}
