import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { MAX_UPLOAD_BYTES, S3_BUCKET, S3_PUBLIC_BASE_URL } from '../lib/env.js'
import { badRequest, forbidden } from '../lib/http.js'
import { assertCanAccessOrganizer, assertManagesTeam, isSuperAdmin } from '../lib/auth.js'
import { generateId } from '../lib/passwords.js'
import { teams, tournaments } from '../repos.js'
import type { Router } from '../lib/router.js'
import type { RequestContext } from '../context.js'

const s3 = new S3Client({})

/** Uploaded images are immutable: their key carries a random id. */
const IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

type Scope = { kind: 'team' | 'tournament' | 'player'; id: string }

/**
 * Confirms the caller owns the thing they are attaching an image to, and
 * returns the key prefix its images live under.
 *
 * The client never chooses the S3 key. It asks to upload "a logo for team X",
 * and the server decides where that goes — so a caller cannot overwrite another
 * organizer's images by crafting a path.
 */
async function resolveKeyPrefix(ctx: RequestContext, scope: Scope): Promise<string> {
  const user = await ctx.user()

  if (scope.kind === 'tournament') {
    const tournament = await tournaments.getOrThrow(scope.id)
    assertCanAccessOrganizer(user, tournament.organizerId)
    return `tournaments/${scope.id}`
  }

  const team = await teams.get(scope.id)
  if (!team) throw badRequest('Unknown team')
  // A club's own manager uploads its crest and its squad photos, so the test
  // here is "does this person run the club", not "does this person run the
  // competition it plays in".
  assertManagesTeam(user, team)
  return scope.kind === 'player' ? `teams/${scope.id}/players` : `teams/${scope.id}`
}


/**
 * The shapes of key this API mints, and nothing else.
 *
 * The delete route used to authorize on the first two segments of a key and
 * hand the whole string to S3, so a key that merely *started* with a club the
 * caller runs — "teams/<mine>/../../tournaments/<theirs>/x.png" — passed the
 * check with a path pointing somewhere else entirely. Matching the whole key
 * against the layout the upload route produces removes the question.
 *
 * Ids here are the application's own, which are hex; the character class is
 * wider than that on purpose, so that an id format changing later does not
 * quietly make every existing image undeletable.
 */
const KEY_SHAPE = /^(teams\/[A-Za-z0-9_-]+(?:\/players)?|tournaments\/[A-Za-z0-9_-]+)\/[A-Za-z0-9_-]+\.(jpg|png|webp|gif)$/

export function registerUploadRoutes(router: Router<RequestContext>): void {
  /**
   * Hands back a short-lived presigned POST the browser can upload one image
   * with. S3 itself enforces the content type and the size limit through the
   * signed policy, and the credentials behind it never leave Lambda.
   */
  router.post('/admin/uploads', async (ctx) => {
    const contentType = ctx.body.contentType
    const kind = ctx.body.kind
    const id = ctx.body.id

    if (typeof contentType !== 'string' || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw badRequest('contentType must be one of: ' + [...ALLOWED_CONTENT_TYPES].join(', '))
    }
    if (kind !== 'team' && kind !== 'tournament' && kind !== 'player') {
      throw badRequest('kind must be team, tournament or player')
    }
    if (typeof id !== 'string' || !id) throw badRequest('id is required')

    const prefix = await resolveKeyPrefix(ctx, { kind, id })
    const key = `${prefix}/${generateId()}.${EXTENSION_BY_TYPE[contentType]}`

    const presigned = await createPresignedPost(s3, {
      Bucket: S3_BUCKET,
      Key: key,
      Expires: 300,
      Fields: {
        'Content-Type': contentType,
        // The key contains a random id, so an image at a given URL never changes.
        // A year of browser caching is safe and stops every page view from
        // re-downloading logos that were already fetched.
        'Cache-Control': IMAGE_CACHE_CONTROL,
      },
      Conditions: [
        ['content-length-range', 1, MAX_UPLOAD_BYTES],
        ['eq', '$Content-Type', contentType],
        ['eq', '$Cache-Control', IMAGE_CACHE_CONTROL],
      ],
    })

    return {
      url: presigned.url,
      fields: presigned.fields,
      key,
      publicUrl: `${S3_PUBLIC_BASE_URL}/${key}`,
    }
  })

  router.post('/admin/uploads/delete', async (ctx) => {
    const user = await ctx.user()
    const url = ctx.body.url
    if (typeof url !== 'string' || !url.startsWith(`${S3_PUBLIC_BASE_URL}/`)) {
      throw badRequest('url must point at this application bucket')
    }

    const key = url.slice(S3_PUBLIC_BASE_URL.length + 1)
    // A traversal segment makes the first two parts of the key — the only parts
    // the check below looks at — say nothing about where the key actually
    // points. Nothing this API mints contains one.
    if (key.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
      throw badRequest('That is not an image this application stored')
    }
    // Keys from before this layout exist, and only the super admin may remove
    // one — there is no owner recorded in such a path to check against.
    if (!KEY_SHAPE.test(key) && !isSuperAdmin(user)) {
      throw forbidden('Cannot verify who owns this image')
    }
    const [scopeKind, scopeId] = key.split('/')

    if (scopeKind === 'tournaments' && scopeId) {
      const tournament = await tournaments.getOrThrow(scopeId)
      assertCanAccessOrganizer(user, tournament.organizerId)
    } else if (scopeKind === 'teams' && scopeId) {
      const team = await teams.get(scopeId)
      if (!team) throw badRequest('Unknown team')
      assertManagesTeam(user, team)
    } else if (!isSuperAdmin(user)) {
      // Legacy keys from before this layout exist; only the super admin may
      // remove one, because there is no owner recorded in the path.
      throw forbidden('Cannot verify who owns this image')
    }

    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }))
    return { ok: true }
  })
}
