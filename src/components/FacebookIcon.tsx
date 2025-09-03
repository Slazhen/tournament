import React from 'react'

interface FacebookIconProps {
  size?: number
  className?: string
}

export default function FacebookIcon({ size = 16, className = '' }: FacebookIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Facebook rounded square background */}
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="4"
        ry="4"
        fill="url(#facebookGradient)"
      />
      
      {/* Facebook 'f' letter */}
      <path
        d="M15.5 12h-2.94v8.5h-3.56V12H7.5V8.5h1.5V6.87c0-1.23.18-2.13.55-2.75.37-.61.97-1.1 1.83-1.46.85-.36 1.94-.54 3.27-.54.61 0 1.06.01 1.35.04v3.2h-.93c-.56 0-.96.12-1.21.35-.24.23-.36.58-.36 1.06V8.5h2.42L15.5 12z"
        fill="white"
      />
      
      <defs>
        <linearGradient id="facebookGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4267B2" />
          <stop offset="100%" stopColor="#365899" />
        </linearGradient>
      </defs>
    </svg>
  )
}
