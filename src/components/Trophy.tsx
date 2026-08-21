/**
 * The trophy.
 *
 * Drawn in the same language as the logo — the ball's pentagon on the bowl of
 * the cup — so a champion badge looks like it belongs to this product and not
 * to whichever emoji font the reader happens to have. Gold for the champion
 * banner, because a trophy that is not gold reads as something else.
 */
export default function Trophy({
  size = 32,
  tone = 'gold',
  className = '',
}: {
  size?: number
  tone?: 'gold' | 'brand'
  className?: string
}) {
  const id = tone === 'gold' ? 'mftCupGold' : 'mftCupBrand'
  const stops =
    tone === 'gold'
      ? ['#FDE68A', '#F59E0B', '#B45309']
      : ['#93C5FD', '#6366F1', '#7C3AED']

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
        <linearGradient id={id} x1="12" y1="4" x2="36" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor={stops[0]} />
          <stop offset="0.55" stopColor={stops[1]} />
          <stop offset="1" stopColor={stops[2]} />
        </linearGradient>
      </defs>

      {/* handles */}
      <path
        d="M13 9H8.5a2 2 0 0 0-2 2v2.5A7.5 7.5 0 0 0 14 21M35 9h4.5a2 2 0 0 1 2 2v2.5A7.5 7.5 0 0 1 34 21"
        stroke={`url(#${id})`}
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />

      {/* bowl */}
      <path d="M13 6h22v11c0 6.1-4.9 11-11 11S13 23.1 13 17V6Z" fill={`url(#${id})`} />

      {/* the ball's panel, the same shape as the mark */}
      <path
        d="M24 11.4 L28.18 14.44 L26.58 19.36 L21.42 19.36 L19.82 14.44 Z"
        fill="#0B1120"
        fillOpacity="0.35"
      />

      {/* stem and base */}
      <path
        d="M24 28v6M17 42h14l-1.5-6h-11L17 42Z"
        stroke={`url(#${id})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
