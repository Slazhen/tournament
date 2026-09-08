import { LOGO_MARK_BODY } from '../utils/logoMark'

/**
 * The mark.
 *
 * A ball that has just been struck: real panels and seams rather than a
 * diagram, with the trail behind it. It carries the whole brand, so the ids
 * inside are prefixed — two of these on one page would otherwise fight over
 * the same gradient.
 */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  // The artwork is a string rather than JSX because the Instagram poster draws
  // the same mark onto a canvas, which takes an image and not an element. It is
  // a constant in this repository, not anything a user ever writes.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: LOGO_MARK_BODY }}
    />
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
