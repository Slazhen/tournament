import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import InstagramIcon from './InstagramIcon'

/**
 * The button that turns what is on screen into something postable.
 *
 * One button for three kinds of poster — a table, a round, a match — because
 * everything around the drawing is the same: press, wait, look at it, download
 * it or hand it to the phone's share sheet. Which poster it is, is the `draw`
 * it was given.
 *
 * The label says as little as fits on it and the tooltip says the rest: these
 * sit on pages visitors read, and a sentence in a button there is a sentence
 * competing with what the page is about.
 *
 * The poster is drawn only when the button is pressed. It costs the crests a
 * second fetch — the page has them, the canvas needs them again with CORS — and
 * a page that drew one for every round on load would pay for posts nobody asked
 * for.
 */
export default function PostButton({
  draw,
  filename,
  label = 'Post table',
  title = 'Generate an Instagram post',
}: {
  /**
   * Called on the press rather than handed a finished poster, so what is drawn
   * is what the page holds at that moment.
   */
  draw: () => Promise<Blob>
  filename: string
  label?: string
  /** What the tooltip says, since the label has room for two words. */
  title?: string
}) {
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The object URL is the browser holding a few hundred kilobytes for us; it is
  // released when the preview closes and when the page leaves.
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url) }, [image])

  const close = () => {
    setImage(null)
    setError(null)
  }

  useEffect(() => {
    if (!image && !error) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [image, error])

  const generate = async () => {
    setDrawing(true)
    setError(null)
    try {
      const blob = await draw()
      setImage({ blob, url: URL.createObjectURL(blob) })
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The post could not be generated.')
    } finally {
      setDrawing(false)
    }
  }

  // Sharing a file is the phone's own sheet, which is the only route from a web
  // page into Instagram — there is no posting API for it. On a desktop browser
  // the sheet does not exist and the download is the whole answer.
  const file = image ? new File([image.blob], filename, { type: 'image/png' }) : null
  const sharer = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }
  const canShare = Boolean(file && sharer.canShare?.({ files: [file] }))

  const share = async () => {
    if (!file) return
    try {
      await navigator.share({ files: [file], title: filename })
    } catch {
      // A cancelled sheet is not a failure, and a refused one leaves the
      // download sitting right beside this button.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={generate}
        disabled={drawing}
        title={title}
        aria-label={title}
        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs sm:text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-60"
      >
        <InstagramIcon size={15} />
        {drawing ? 'Drawing…' : label}
      </button>

      {/* Into the body, not where this button stands. Both tables sit inside a
          `.glass` card, and `backdrop-filter` on an ancestor makes it the
          containing block for a fixed child — the overlay would have covered
          the card rather than the page, and `overflow-hidden` on the same card
          would have cut a portrait preview off at its bottom edge. */}
      {(image || error) &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Instagram post"
            onClick={close}
          >
            <div
              className="glass rounded-2xl border border-white/20 p-4 max-w-sm w-full max-h-full overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
            >
              {error ? (
                <p className="text-sm text-red-300 mb-4">{error}</p>
              ) : (
                image && (
                  <img
                    src={image.url}
                    alt="The Instagram post"
                    className="w-full rounded-xl border border-white/10"
                  />
                )
              )}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="px-3 py-2 rounded-lg text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Close
                </button>
                {canShare && (
                  <button
                    type="button"
                    onClick={share}
                    className="px-3 py-2 rounded-lg text-sm glass hover:bg-white/10 text-white transition-colors"
                  >
                    Share
                  </button>
                )}
                {image && (
                  <a
                    href={image.url}
                    download={filename}
                    className="px-3 py-2 rounded-lg text-sm bg-white/90 hover:bg-white text-black font-medium transition-colors"
                  >
                    Download
                  </a>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
