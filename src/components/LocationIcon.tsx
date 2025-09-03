import React from 'react'

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
      {/* Main pin shape with colorful segments */}
      <path
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
        fill="url(#colorGradient)"
      />
      
      {/* Center circle cutout */}
      <circle cx="12" cy="9" r="2" fill="black" />
      
      {/* Color segments using clipPath */}
      <defs>
        <clipPath id="pinClip">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
        </clipPath>
      </defs>
      
      {/* Blue segment (top-right) */}
      <path
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
        fill="#4285F4"
        clipPath="url(#pinClip)"
        opacity="0.8"
      />
      
      {/* Red segment (top-left) */}
      <path
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
        fill="#EA4335"
        clipPath="url(#pinClip)"
        opacity="0.8"
      />
      
      {/* Yellow segment (bottom-left) */}
      <path
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
        fill="#FBBC05"
        clipPath="url(#pinClip)"
        opacity="0.8"
      />
      
      {/* Green segment (bottom-right) */}
      <path
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
        fill="#34A853"
        clipPath="url(#pinClip)"
        opacity="0.8"
      />
      
      {/* Horizontal bars extending from sides */}
      {/* Left red bar */}
      <rect x="0" y="6" width="5" height="2" fill="#EA4335" />
      {/* Left purple bar */}
      <rect x="0" y="9" width="5" height="1" fill="#9C27B0" />
      {/* Right green bar */}
      <rect x="19" y="8" width="5" height="2" fill="#34A853" />
    </svg>
  )
}
