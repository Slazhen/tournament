/**
 * The mark.
 *
 * A ball that has just been struck: real panels and seams rather than a
 * diagram, with the trail behind it. It carries the whole brand, so the ids
 * inside are prefixed — two of these on one page would otherwise fight over
 * the same gradient.
 */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
    <defs>
      <radialGradient id="mftSphere" cx="0.34" cy="0.28" r="0.85">
        <stop offset="0" stopColor="#FFFFFF"/>
        <stop offset="0.55" stopColor="#F1F5FF"/>
        <stop offset="1" stopColor="#B9C6E8"/>
      </radialGradient>
      <linearGradient id="mftPanel" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#2C3E70"/><stop offset="1" stopColor="#141C33"/>
      </linearGradient>
      <clipPath id="mftClip"><circle cx="24" cy="24" r="20"/></clipPath>
    </defs>
  
      <g stroke="#8B5CF6" strokeLinecap="round" fill="none">
      <path d="M1.5 16.5 H9" strokeWidth="2.6" opacity="0.75"/>
      <path d="M0 24 H7.5" strokeWidth="2.6" opacity="0.55"/>
      <path d="M2 31.5 H9" strokeWidth="2.6" opacity="0.35"/>
    </g>
  
    <g transform="translate(28.5 24) scale(0.855) translate(-24 -24)">
    <circle cx="24" cy="24" r="20" fill="url(#mftSphere)"/>
    <g clipPath="url(#mftClip)" fill="url(#mftPanel)"><path d="M24.00 18.20 L29.52 22.21 L27.41 28.69 L20.59 28.69 L18.48 22.21 Z"/><path d="M24.00 10.20 L17.53 5.50 L20.00 -2.10 L28.00 -2.10 L30.47 5.50 Z"/><path d="M37.12 19.74 L39.59 12.13 L47.59 12.13 L50.06 19.74 L43.59 24.43 Z"/><path d="M32.11 35.16 L40.11 35.16 L42.58 42.77 L36.11 47.47 L29.64 42.77 Z"/><path d="M15.89 35.16 L18.36 42.77 L11.89 47.47 L5.42 42.77 L7.89 35.16 Z"/><path d="M10.88 19.74 L4.41 24.43 L-2.06 19.74 L0.41 12.13 L8.41 12.13 Z"/></g>
    <g clipPath="url(#mftClip)" stroke="#141C33" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.85"><path d="M24.00 18.20 L24.00 9.52"/><path d="M29.52 22.21 L37.77 19.53"/><path d="M27.41 28.69 L32.51 35.71"/><path d="M20.59 28.69 L15.49 35.71"/><path d="M18.48 22.21 L10.23 19.53"/></g>
    <ellipse cx="17" cy="14.5" rx="7" ry="4.5" fill="#fff" opacity="0.45" transform="rotate(-28 17 14.5)"/>
    <circle cx="24" cy="24" r="19.4" fill="none" stroke="#0B1120" strokeOpacity="0.18" strokeWidth="1.2"/>
  </g>
  </svg>
  )
}

/** The mark with the name beside it, for headers. */
export default function Logo({
  size = 32,
  className = '',
  showName = true,
}: {
  size?: number
  className?: string
  showName?: boolean
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {showName && (
        <span className="font-semibold tracking-tight leading-none">
          <span className="text-white">MF</span>
          <span className="text-white/60">Tournament</span>
        </span>
      )}
    </span>
  )
}
