import type { ReactNode } from 'react'
import { cdnUrl } from '../utils/images'

/**
 * A club's crest or a competition's logo, drawn whole.
 *
 * Every one of these used to be written by hand at the call site, and most of
 * them were a circle with `object-cover` inside it. That fills the box: a crest
 * that is not square loses everything outside its middle square first, and its
 * corners to the circle after that. Five of the twelve clubs in one season are
 * shaped between 400x285 and 213x400, which cost them up to half the badge, and
 * a badge is not round in the first place - the shape belongs to the artwork.
 *
 * So the tile holds the crest rather than cutting it to fit, and the crest sits
 * inside it whole. The size stays the caller's, as width and height classes,
 * because a crest in a table row and a crest in a header are not the same size;
 * everything else - the corner, the inset, the plate behind a badge that does
 * not fill its tile - is decided here, so that it can be changed in one place
 * rather than in forty.
 */

type CrestProps = {
  /** The stored key or URL. `cdnUrl` is applied here, so pass the record's own value. */
  logo?: string | null
  /** Named on the image, and the initial drawn where there is no crest. */
  name?: string
  /** Width and height, e.g. `w-10 h-10 sm:w-14 sm:h-14`. */
  className?: string
  /** What to draw where the club has uploaded nothing. An initial by default. */
  fallback?: ReactNode
  /** Off where the tile already sits on a plate of its own. */
  plate?: boolean
  /** On for a crest above the fold; everything else is fetched as it is reached. */
  eager?: boolean
}

export function Crest({
  logo,
  name,
  className = 'w-10 h-10',
  fallback,
  plate = true,
  eager = false,
}: CrestProps) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[22%] ${
        plate ? 'bg-white/[0.06] border border-white/10' : ''
      } ${className}`}
    >
      {logo ? (
        <img
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          src={cdnUrl(logo)}
          alt={name ? `${name} logo` : ''}
          // Inset as a share of the tile rather than a padding class: the tile
          // is square, so a percentage of its width is a percentage of its
          // height too, and one component then holds at every size a caller
          // asks for. Percentage padding would resolve against whatever the
          // tile sits in, which is a table cell as often as not.
          className="absolute inset-[8%] h-[84%] w-[84%] object-contain"
        />
      ) : (
        (fallback ?? (
          <span className="text-[0.8em] font-semibold text-white/70">
            {(name?.trim().charAt(0) || '?').toUpperCase()}
          </span>
        ))
      )}
    </span>
  )
}
