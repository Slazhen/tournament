import type { SVGProps } from 'react'

/**
 * The icon set.
 *
 * The app was built out of emoji, which render as a different font on every
 * operating system, cannot take the colour of the text around them, and make a
 * product read like a chat message. These are drawn on the same grid as the
 * logo — 24 units, 1.8 stroke, round ends — and they inherit `currentColor`,
 * so an icon inside a red button comes out red.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  )
}

export function IconTrophy(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M17 5h2.5a2.5 2.5 0 0 1-2.5 4.5M7 5H4.5A2.5 2.5 0 0 0 7 9.5" />
      <path d="M12 14v3M8.5 20h7M9.5 20l.5-3h4l.5 3" />
    </Svg>
  )
}

/** The same ball as the logo, reduced to what survives at 20 pixels. */
export function IconBall(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.6l2.7 1.95-1.03 3.17h-3.34L9.3 9.55 12 7.6Z" />
      <path d="M12 3v4.6M19.6 9.3l-4.9 1.6M16.6 18.4l-2.9-4.2M7.4 18.4l2.9-4.2M4.4 9.3l4.9 1.6" />
    </Svg>
  )
}

export function IconTable(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M3 15h18M9 9.5V20" />
    </Svg>
  )
}

export function IconChart(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 20v-6M13 20V8M18 20v-9" />
    </Svg>
  )
}

export function IconCalendar(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Svg>
  )
}

export function IconLink(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 13.5a4 4 0 0 0 5.66 0l2.6-2.6a4 4 0 0 0-5.66-5.66l-1.1 1.1" />
      <path d="M14 10.5a4 4 0 0 0-5.66 0l-2.6 2.6a4 4 0 1 0 5.66 5.66l1.1-1.1" />
    </Svg>
  )
}

export function IconStadium(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 9h18v9H3z" />
      <path d="M3 9l3-4h12l3 4" />
      <path d="M7 18v-5h10v5M9.5 13v5M14.5 13v5M7 15.5h10" />
    </Svg>
  )
}

export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </Svg>
  )
}

export function IconGlobe(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" />
    </Svg>
  )
}

/** Sitting this round out. */
export function IconRest(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 20v-4h12v4" />
      <path d="M6 16V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10" />
      <path d="M4 16h16" />
    </Svg>
  )
}

/** A game the loser does not come back from. */
export function IconKnockout(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h4v12H4" />
      <path d="M8 12h4" />
      <path d="M14.5 9.5l5 5M19.5 9.5l-5 5" />
    </Svg>
  )
}

export function IconPin(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </Svg>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M10 4h4M9 7v12M15 7v12" />
      <path d="M6 7l1 13h10l1-13" />
    </Svg>
  )
}

export function IconBolt(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 3L5 13.5h6L10.5 21 19 10.5h-6L13 3Z" />
    </Svg>
  )
}

export function IconGear(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8l1.4 2.5 2.8-.5.5 2.8 2.5 1.4-1.6 2.4 1.6 2.4-2.5 1.4-.5 2.8-2.8-.5L12 21.2l-1.4-2.5-2.8.5-.5-2.8-2.5-1.4L6.4 12 4.8 9.6l2.5-1.4.5-2.8 2.8.5L12 2.8Z" />
    </Svg>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </Svg>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  )
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  )
}

export function IconUser(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </Svg>
  )
}

export function IconUsers(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19.5a6 6 0 0 1 12 0" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 6.3M17.5 14.2a6 6 0 0 1 3.5 5.3" />
    </Svg>
  )
}

export function IconClipboard(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="4.5" width="14" height="16" rx="2.5" />
      <path d="M9 4.5V3.6A1.6 1.6 0 0 1 10.6 2h2.8A1.6 1.6 0 0 1 15 3.6v.9" />
      <path d="M9 11h6M9 15h4" />
    </Svg>
  )
}

export function IconCamera(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 8.5h3.5L8 6h8l1.5 2.5H21v11H3v-11Z" />
      <circle cx="12" cy="13.5" r="3.4" />
    </Svg>
  )
}

export function IconWarning(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4l9 16H3l9-16Z" />
      <path d="M12 10v4.5M12 17.6v.1" />
    </Svg>
  )
}

export function IconKey(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M17.5 12v3.5M20 12v2.5" />
    </Svg>
  )
}

export function IconVideo(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="12" height="12" rx="2.5" />
      <path d="M15 10.5l6-3.5v10l-6-3.5" />
    </Svg>
  )
}

export function IconArrowLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Svg>
  )
}

export function IconArrowRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  )
}

export function IconPencil(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h4L20 8l-4-4L4 16v4Z" />
      <path d="M14 6l4 4" />
    </Svg>
  )
}

export function IconRepeat(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9a5 5 0 0 1 5-5h11M20 15a5 5 0 0 1-5 5H4" />
      <path d="M17 1l3 3-3 3M7 17l-3 3 3 3" />
    </Svg>
  )
}

export function IconMedal(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="15" r="5.5" />
      <path d="M8.5 10L6 3h12l-2.5 7" />
      <path d="M12 13v4.5" />
    </Svg>
  )
}

/** Groups: several tables running at once. */
export function IconGroups(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="2" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="2" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="2" />
    </Svg>
  )
}

/** A bracket: the shape every knockout draw makes. */
export function IconBracket(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 5h4v6H4M4 13h4v6H4" />
      <path d="M8 8h4v8H8" />
      <path d="M12 12h8" />
    </Svg>
  )
}

/** Rounds played one after another, nobody knocked out early. */
export function IconRounds(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6.5h16M4 12h16M4 17.5h10" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </Svg>
  )
}

export function IconTools(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 6.5a3.5 3.5 0 0 0 4.6 4.6L21 13l-8 8-2-2 8-8-1.9-1.9A3.5 3.5 0 0 0 14.5 6.5Z" />
      <path d="M8 3l3 3-2 2-3-3V3Z" />
      <path d="M6 8l-3 3 8 8" />
    </Svg>
  )
}

export function IconShield(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3l8 3v6c0 4.4-3.4 8-8 9.5C7.4 20 4 16.4 4 12V6l8-3Z" />
    </Svg>
  )
}

export function IconEye(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  )
}
