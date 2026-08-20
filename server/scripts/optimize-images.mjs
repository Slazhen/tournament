#!/usr/bin/env node
/**
 * Shrinks the images already sitting in S3 and gives them cache headers.
 *
 * New uploads have been compressed to 400x400 for a while, but everything
 * uploaded before that is still the original file: one tournament page pulls ten
 * logos totalling about 6 MB, several of them 1024x1024 or larger PNGs shown at
 * 52 pixels. None of them carry a Cache-Control header either, so every visit
 * re-downloads the lot.
 *
 * This rewrites each object in place — same key, same format, so no URL stored
 * in DynamoDB has to change — at a sane size, and stamps on a long cache header.
 *
 *   node scripts/optimize-images.mjs            # report what would change
 *   node scripts/optimize-images.mjs --apply    # actually rewrite
 *
 * Needs sharp:  npm install --save-dev sharp
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'

const BUCKET = process.env.S3_BUCKET ?? 'football-tournaments-images'
const MAX_EDGE = Number(process.env.MAX_EDGE ?? 400)
const CACHE_CONTROL = 'public, max-age=31536000, immutable'
const APPLY = process.argv.includes('--apply')

const s3 = new S3Client({})

const CONTENT_TYPE_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

async function listAllObjects() {
  const objects = []
  let token
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }),
    )
    objects.push(...(page.Contents ?? []))
    token = page.NextContinuationToken
  } while (token)
  return objects
}

async function readObject(key) {
  const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  const chunks = []
  for await (const chunk of result.Body) chunks.push(chunk)
  return { body: Buffer.concat(chunks), cacheControl: result.CacheControl }
}

/** Re-encodes in the same format so the file extension stays truthful. */
async function shrink(buffer, extension) {
  const pipeline = sharp(buffer, { animated: extension === 'webp' }).resize({
    width: MAX_EDGE,
    height: MAX_EDGE,
    fit: 'inside',
    withoutEnlargement: true,
  })

  if (extension === 'png') return pipeline.png({ compressionLevel: 9, palette: true }).toBuffer()
  if (extension === 'webp') return pipeline.webp({ quality: 82 }).toBuffer()
  return pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
}

const objects = await listAllObjects()
let before = 0
let after = 0
let rewritten = 0
let headersOnly = 0

for (const object of objects) {
  const key = object.Key
  const extension = key.split('.').pop()?.toLowerCase() ?? ''
  const contentType = CONTENT_TYPE_BY_EXTENSION[extension]

  // SVGs are already small and vector; leave them alone apart from headers.
  if (!contentType) {
    if (extension === 'svg') headersOnly++
    continue
  }

  const { body, cacheControl } = await readObject(key)
  const metadata = await sharp(body).metadata()
  const oversized = (metadata.width ?? 0) > MAX_EDGE || (metadata.height ?? 0) > MAX_EDGE
  const needsHeader = cacheControl !== CACHE_CONTROL

  if (!oversized && !needsHeader) continue

  const optimized = oversized ? await shrink(body, extension) : body
  before += body.length
  after += optimized.length

  const saved = Math.round(((body.length - optimized.length) / body.length) * 100)
  console.log(
    `${oversized ? 'resize' : 'header'} ${key} ` +
      `${Math.round(body.length / 1024)}KB` +
      (oversized ? ` -> ${Math.round(optimized.length / 1024)}KB (-${saved}%)` : '') +
      `${metadata.width ? ` [${metadata.width}x${metadata.height}]` : ''}`,
  )

  if (APPLY) {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: optimized,
        ContentType: contentType,
        CacheControl: CACHE_CONTROL,
      }),
    )
  }
  rewritten++
}

console.log(
  `\n${APPLY ? 'Rewrote' : 'Would rewrite'} ${rewritten} image(s): ` +
    `${Math.round(before / 1024)}KB -> ${Math.round(after / 1024)}KB. ` +
    `${headersOnly} SVG(s) skipped.` +
    (APPLY ? '' : '\nRun again with --apply to make the changes.'),
)
