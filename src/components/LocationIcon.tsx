// import React from 'react'

interface LocationIconProps {
  size?: number
  className?: string
}

export default function LocationIcon({ size = 16, className = '' }: LocationIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Google Maps pin icon */}
      <path
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
        fill="#4285F4"
      />
      <circle cx="12" cy="9" r="3" fill="white" />
    </svg>
  )
}
