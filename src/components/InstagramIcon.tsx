// import React from 'react'

interface InstagramIconProps {
  size?: number
  className?: string
}

export default function InstagramIcon({ size = 16, className = '' }: InstagramIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Instagram gradient background */}
      <defs>
        <linearGradient id="instagramGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#405DE6" />
          <stop offset="25%" stopColor="#5851DB" />
          <stop offset="50%" stopColor="#833AB4" />
          <stop offset="75%" stopColor="#C13584" />
          <stop offset="100%" stopColor="#E1306C" />
        </linearGradient>
      </defs>
      
      {/* Instagram rounded square background */}
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="4"
        ry="4"
        fill="url(#instagramGradient)"
      />
      
      {/* Instagram camera icon */}
      <circle cx="12" cy="12" r="4" fill="white" />
      <circle cx="12" cy="12" r="2.5" fill="url(#instagramGradient)" />
      
      {/* Camera top dot */}
      <circle cx="16" cy="8" r="1.5" fill="white" />
    </svg>
  )
}
