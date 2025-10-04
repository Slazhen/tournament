import imageCompression from 'browser-image-compression'

export interface ImageCompressionOptions {
  maxSizeMB?: number
  maxWidthOrHeight?: number
  useWebWorker?: boolean
  quality?: number
}

export interface CompressionResult {
  originalFile: File
  compressedFile: File
  originalSize: number
  compressedSize: number
  compressionRatio: number
  qualityMaintained: boolean
}

/**
 * Compress and resize an image file
 * @param file - The image file to compress
 * @param options - Compression options
 * @returns Promise<CompressionResult> - The compression result with metadata
 */
export async function compressImage(
  file: File, 
  options: ImageCompressionOptions = {}
): Promise<CompressionResult> {
  const defaultOptions = {
    maxSizeMB: 0.5, // 500KB max file size
    maxWidthOrHeight: 800, // Max dimension 800px
    useWebWorker: true,
    quality: 0.8, // 80% quality
    ...options
  }

  try {
    console.log('Compressing image:', {
      originalName: file.name,
      originalSize: formatFileSize(file.size),
      originalType: file.type
    })

    const compressedFile = await imageCompression(file, defaultOptions)
    
    const originalSize = file.size
    const compressedSize = compressedFile.size
    const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100
    
    console.log('Image compression completed:', {
      originalSize: formatFileSize(originalSize),
      compressedSize: formatFileSize(compressedSize),
      compressionRatio: `${compressionRatio.toFixed(1)}%`,
      qualityMaintained: compressionRatio < 90 // Consider quality maintained if compression is less than 90%
    })

    return {
      originalFile: file,
      compressedFile,
      originalSize,
      compressedSize,
      compressionRatio,
      qualityMaintained: compressionRatio < 90
    }
  } catch (error) {
    console.error('Image compression failed:', error)
    throw new Error(`Failed to compress image: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Compress multiple images in parallel
 * @param files - Array of image files to compress
 * @param options - Compression options
 * @returns Promise<CompressionResult[]> - Array of compression results
 */
export async function compressImages(
  files: File[], 
  options: ImageCompressionOptions = {}
): Promise<CompressionResult[]> {
  console.log(`Starting compression of ${files.length} images...`)
  
  const results = await Promise.all(
    files.map(file => compressImage(file, options))
  )
  
  const totalOriginalSize = results.reduce((sum, result) => sum + result.originalSize, 0)
  const totalCompressedSize = results.reduce((sum, result) => sum + result.compressedSize, 0)
  const totalCompressionRatio = ((totalOriginalSize - totalCompressedSize) / totalOriginalSize) * 100
  
  console.log('Batch compression completed:', {
    totalImages: files.length,
    totalOriginalSize: formatFileSize(totalOriginalSize),
    totalCompressedSize: formatFileSize(totalCompressedSize),
    totalCompressionRatio: `${totalCompressionRatio.toFixed(1)}%`
  })
  
  return results
}

/**
 * Validate if a file is a supported image type
 * @param file - The file to validate
 * @returns boolean - True if the file is a supported image type
 */
export function isValidImageType(file: File): boolean {
  const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  return supportedTypes.includes(file.type.toLowerCase())
}

/**
 * Validate if a file is within acceptable size limits
 * @param file - The file to validate
 * @param maxSizeMB - Maximum size in MB (default: 10MB)
 * @returns boolean - True if the file is within size limits
 */
export function isValidImageSize(file: File, maxSizeMB: number = 10): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  return file.size <= maxSizeBytes
}

/**
 * Format file size in human-readable format
 * @param bytes - File size in bytes
 * @returns string - Formatted file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Get recommended compression options based on use case
 * @param useCase - The use case for the image
 * @returns ImageCompressionOptions - Recommended options
 */
export function getCompressionOptions(useCase: 'logo' | 'profile' | 'tournament' | 'team' | 'general'): ImageCompressionOptions {
  switch (useCase) {
    case 'logo':
      return {
        maxSizeMB: 0.2, // 200KB max for logos
        maxWidthOrHeight: 400, // 400px max dimension
        quality: 0.9 // Higher quality for logos
      }
    case 'profile':
      return {
        maxSizeMB: 0.3, // 300KB max for profile images
        maxWidthOrHeight: 500, // 500px max dimension
        quality: 0.85 // Good quality for profiles
      }
    case 'tournament':
      return {
        maxSizeMB: 0.5, // 500KB max for tournament images
        maxWidthOrHeight: 800, // 800px max dimension
        quality: 0.8 // Good quality for tournament banners
      }
    case 'team':
      return {
        maxSizeMB: 0.3, // 300KB max for team logos
        maxWidthOrHeight: 400, // 400px max dimension
        quality: 0.85 // Good quality for team logos
      }
    case 'general':
    default:
      return {
        maxSizeMB: 0.5, // 500KB max for general images
        maxWidthOrHeight: 800, // 800px max dimension
        quality: 0.8 // Standard quality
      }
  }
}

/**
 * Create a preview URL for an image file
 * @param file - The image file
 * @returns string - Preview URL
 */
export function createImagePreview(file: File): string {
  return URL.createObjectURL(file)
}

/**
 * Clean up preview URLs to prevent memory leaks
 * @param urls - Array of preview URLs to revoke
 */
export function cleanupImagePreviews(urls: string[]): void {
  urls.forEach(url => {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  })
}
