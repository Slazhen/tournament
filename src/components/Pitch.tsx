/**
 * The background of the pages a visitor sees.
 *
 * A photograph would have been a megabyte of somebody else's stadium; these are
 * the markings of a pitch, drawn once and kept faint enough to stay behind the
 * text. It is a component of its own because the landing page and the page it
 * sends people to are one look, and a second copy of this SVG would have drifted
 * from the first within a month.
 */
export default function Pitch() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="absolute -top-40 -left-32 w-[36rem] h-[36rem] rounded-full bg-blue-600/10 blur-[120px]" />
      <div className="absolute top-1/3 -right-40 w-[32rem] h-[32rem] rounded-full bg-purple-600/10 blur-[120px]" />
      <div className="absolute bottom-0 left-1/4 w-[28rem] h-[28rem] rounded-full bg-emerald-500/[0.06] blur-[120px]" />

      <svg
        className="absolute inset-0 w-full h-full opacity-[0.07]"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        stroke="white"
        strokeWidth="2"
      >
        <rect x="60" y="40" width="1080" height="720" rx="4" />
        <line x1="600" y1="40" x2="600" y2="760" />
        <circle cx="600" cy="400" r="110" />
        <circle cx="600" cy="400" r="4" fill="white" stroke="none" />
        <rect x="60" y="220" width="160" height="360" />
        <rect x="60" y="320" width="60" height="160" />
        <rect x="980" y="220" width="160" height="360" />
        <rect x="1080" y="320" width="60" height="160" />
      </svg>
    </div>
  )
}
