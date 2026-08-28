import { useCallback, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import {
  compressImage,
  formatFileSize,
  getCompressionOptions,
  isValidImageSize,
  isValidImageType,
} from '../utils/imageCompression'
import { IconCamera } from './icons'

/**
 * A photograph that can be replaced by clicking it.
 *
 * The team photo used to sit beside a second, empty `LogoUploader` — a dashed
 * circle captioned "Logo" — because that component draws its own placeholder
 * and was handed no current image. It read as a missing logo rather than as
 * the way to change the photo standing next to it.
 *
 * A photo is not a crest: it is landscape, it is not a circle, and there is
 * only ever one of it, so replacing it is the whole interaction.
 */
export default function PhotoUploader({
  photo,
  onUpload,
  alt,
  width = 176,
  height = 100,
  compressionType = 'team',
  label = 'photo',
}: {
  photo?: string
  onUpload: (file: File) => Promise<void>
  alt: string
  width?: number
  height?: number
  compressionType?: 'logo' | 'profile' | 'tournament' | 'team' | 'general'
  /** What this picture is called in the messages: "photo", "team photo". */
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const accept = useCallback(
    async (file: File) => {
      if (!isValidImageType(file)) {
        setError('That is not an image file — JPEG, PNG or WebP.')
        return
      }
      if (!isValidImageSize(file, 10)) {
        setError('That image is over 10 MB. Pick a smaller one.')
        return
      }

      setBusy(true)
      setError(null)
      setMessage(null)
      try {
        const compressed = await compressImage(file, getCompressionOptions(compressionType))
        await onUpload(compressed.compressedFile)
        setMessage(
          `Saved — ${formatFileSize(compressed.originalSize)} down to ${formatFileSize(
            compressed.compressedSize,
          )}.`,
        )
        setTimeout(() => setMessage(null), 5000)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : `That ${label} could not be saved.`)
      } finally {
        setBusy(false)
      }
    },
    [compressionType, label, onUpload],
  )

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void accept(file)
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={busy}
        title={photo ? `Click to replace the ${label}` : `Click to add a ${label}`}
        style={{ width, height }}
        className={`group relative rounded-lg overflow-hidden transition-colors ${
          photo ? 'border border-white/15' : 'border-2 border-dashed border-white/25'
        } ${dragging ? 'border-blue-400 bg-blue-500/10' : 'hover:border-white/40'} ${
          busy ? 'opacity-60 pointer-events-none' : ''
        }`}
      >
        {photo ? (
          <>
            <img
              loading="lazy"
              decoding="async"
              src={photo}
              alt={alt}
              className="w-full h-full object-cover"
            />
            <span className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-xs font-medium">
              <IconCamera size={14} /> Change
            </span>
          </>
        ) : (
          <span className="w-full h-full flex flex-col items-center justify-center gap-1 text-xs text-gray-300">
            <IconCamera size={16} />
            Add a {label}
          </span>
        )}

        {busy && (
          <span className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs">
            Saving…
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Cleared so that picking the same file twice still fires a change.
          event.target.value = ''
          if (file) void accept(file)
        }}
      />

      {error && <p className="text-xs text-red-300" style={{ maxWidth: width }}>{error}</p>}
      {message && !error && (
        <p className="text-xs text-gray-400" style={{ maxWidth: width }}>
          {message}
        </p>
      )}
    </div>
  )
}
