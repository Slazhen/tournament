#!/usr/bin/env node
/**
 * Shrinks the images already sitting in S3 and gives them cache headers.
 *
 * New uploads are compressed in the browser before they are sent, and they
 * arrive small: measured across one public organiser page, the twenty-five
 * images with a `logo-<timestamp>` key averaged 15 KB. The seven with a
 * `<32 hex>` key - uploaded by the browser-side app, before any of that existed
 * - averaged 177 KB and ran to 337 KB, and between them they were 77% of the
 * page. Nothing has ever gone back over them.
 *
 * This rewrites each object in place - same key, same format, so no URL stored
 * in DynamoDB has to change - at a sane size, and stamps on a long cache
 * header.
 *
 *   node scripts/optimize-images.mjs            # report what would change
 *   node scripts/optimize-images.mjs --apply    # actually rewrite
 *
 * Needs sharp:  npm install --save-dev sharp
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb'
import sharp from 'sharp'

const BUCKET = process.env.S3_BUCKET ?? 'football-tournaments-images'
const TABLE_PREFIX = process.env.TABLE_PREFIX ?? 'football-tournaments'
const REGION = process.env.AWS_REGION ?? 'us-east-1'
const BUCKET_URL_PREFIX = `https://${BUCKET}.s3.${REGION}.amazonaws.com/`

/**
 * A crest is drawn at 36-40 pixels and never larger than about 120, so 400 is
 * already generous. A photograph is a different thing under the same prefix.
 */
const CREST_MAX_EDGE = Number(process.env.CREST_MAX_EDGE ?? 400)

/**
 * Everything else. A club's team photo lives at `teams/<id>/…` beside the
 * crest and a player's at `teams/<id>/players/…`, and for the keys from the
 * browser-side era there is nothing in the path to tell any of them apart - so
 * running the whole bucket at the crest size would flatten every photograph in
 * it to the size of a badge. That is why this used to be 1200 for everything,
 * and why the crests it was protecting the photographs from never got smaller.
 */
const MAX_EDGE = Number(process.env.MAX_EDGE ?? 1200)

const CACHE_CONTROL = 'public, max-age=31536000, immutable'
const APPLY = process.argv.includes('--apply')

const s3 = new S3Client({})
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const CONTENT_TYPE_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/**
 * Which objects are crests, asked of the records rather than of the key.
 *
 * The database is the only thing that actually knows: a crest is whatever a
 * club, a competition or an organiser has in its `logo` field, whatever the key
 * looks like. Everything the scan does not name is treated as a photograph and
 * keeps the larger limit, so a field this misses costs a slow image and never a
 * ruined one.
 */
async function crestKeys() {
  const keys = new Set()
  for (const table of ['teams', 'tournaments', 'organizers']) {
    let start
    do {
      const page = await ddb.send(
        new ScanCommand({
          TableName: `${TABLE_PREFIX}-${table}`,
          ProjectionExpression: '#logo',
          ExpressionAttributeNames: { '#logo': 'logo' },
          ExclusiveStartKey: start,
        }),
      )
      for (const item of page.Items ?? []) {
        if (typeof item.logo === 'string' && item.logo.startsWith(BUCKET_URL_PREFIX)) {
          keys.add(item.logo.slice(BUCKET_URL_PREFIX.length))
        }
      }
      start = page.LastEvaluatedKey
    } while (start)
  }
  return keys
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
async function shrink(buffer, extension, maxEdge) {
  const pipeline = sharp(buffer, { animated: extension === 'webp' }).resize({
    width: maxEdge,
    height: maxEdge,
    fit: 'inside',
    withoutEnlargement: true,
  })

  if (extension === 'png') return pipeline.png({ compressionLevel: 9, palette: true }).toBuffer()
  if (extension === 'webp') return pipeline.webp({ quality: 82 }).toBuffer()
  return pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
}

const crests = await crestKeys()
const objects = await listAllObjects()
console.log(
  `${objects.length} object(s) in ${BUCKET}, ${crests.size} of them named as a logo by a record.\n`,
)

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

  const isCrest = crests.has(key)
  const maxEdge = isCrest ? CREST_MAX_EDGE : MAX_EDGE

  const { body, cacheControl } = await readObject(key)
  const metadata = await sharp(body).metadata()
  const oversized = (metadata.width ?? 0) > maxEdge || (metadata.height ?? 0) > maxEdge
  const needsHeader = cacheControl !== CACHE_CONTROL

  if (!oversized && !needsHeader) continue

  const optimized = oversized ? await shrink(body, extension, maxEdge) : body
  before += body.length
  after += optimized.length

  const saved = Math.round(((body.length - optimized.length) / body.length) * 100)
  console.log(
    `${oversized ? 'resize' : 'header'} ${isCrest ? '[crest]' : '[photo]'} ${key} ` +
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
