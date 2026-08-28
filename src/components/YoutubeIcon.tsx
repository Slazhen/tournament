interface YoutubeIconProps {
  size?: number
  className?: string
}

/** YouTube's mark: the red rounded rectangle and the white play triangle. */
export default function YoutubeIcon({ size = 16, className = '' }: YoutubeIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#FF0000" />
      <path d="M10 8.75 L16 12 L10 15.25 Z" fill="white" />
    </svg>
  )
}
