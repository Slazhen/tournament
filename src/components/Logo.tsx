/**
 * The mark.
 *
 * The site had no logo — the header said "MFTournament" in the body font and
 * the tab showed the Vite default. What the product actually is, is a league
 * table: so the mark is one. Three rows, and the team on top is a football.
 *
 * It has to survive being 16 pixels wide in a browser tab, which rules out a
 * crest, a trophy or anything with a shine on it.
 */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="mft-tile" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#mft-tile)" />

      {/* First place: the ball is the position marker. */}
      <circle cx="14" cy="16" r="4.5" fill="#fff" />
      <path
        d="M14 13.3 L16.57 15.17 L15.59 18.18 L12.41 18.18 L11.43 15.17 Z"
        fill="#3B82F6"
        fillOpacity="0.9"
      />
      <rect x="22" y="13.6" width="16" height="4.8" rx="2.4" fill="#fff" />

      {/* The chasing pack, with fewer points. */}
      <circle cx="14" cy="27" r="2.2" fill="#fff" fillOpacity="0.55" />
      <rect x="22" y="24.8" width="12" height="4.4" rx="2.2" fill="#fff" fillOpacity="0.55" />

      <circle cx="14" cy="36.5" r="2.2" fill="#fff" fillOpacity="0.35" />
      <rect x="22" y="34.3" width="8" height="4.4" rx="2.2" fill="#fff" fillOpacity="0.35" />
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
