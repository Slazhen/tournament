import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { createContext } from './context.js'
import { Router } from './lib/router.js'
import { corsHeaders, HttpError, json, noContent, parseJsonBody } from './lib/http.js'
import { PUBLIC_CACHE_SECONDS } from './lib/env.js'
import { registerPublicRoutes } from './routes/public.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerAdminRoutes } from './routes/admin.js'
import { registerUploadRoutes } from './routes/uploads.js'
import type { RequestContext } from './context.js'

const router = new Router<RequestContext>()
registerPublicRoutes(router)
registerAuthRoutes(router)
registerAdminRoutes(router)
registerUploadRoutes(router)

export { router }

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method
  const path = event.rawPath
  const headers = normalizeHeaders(event.headers)
  const cors = corsHeaders(headers['origin'])

  if (method === 'OPTIONS') return noContent(cors)

  try {
    const { handler: route, params } = router.match(method, path)

    const ctx = createContext({
      method,
      path,
      query: (event.queryStringParameters ?? {}) as Record<string, string>,
      body: method === 'GET' ? {} : parseJsonBody(event.body, event.isBase64Encoded),
      headers,
      sourceIp: event.requestContext.http.sourceIp,
      userAgent: headers['user-agent'],
    })

    const result = await route(ctx, params)

    // Public reads may be held by the browser and any CDN for a short window.
    // Everything else stays no-store, which json() applies by default.
    const cacheHeaders =
      method === 'GET' && path.startsWith('/public/')
        ? { 'cache-control': `public, max-age=${PUBLIC_CACHE_SECONDS}` }
        : {}

    return json(200, result, { ...cors, ...cacheHeaders })
  } catch (error) {
    if (error instanceof HttpError) {
      return json(error.status, { error: error.message }, cors)
    }

    // Anything else is a bug. It goes to CloudWatch in full and to the caller
    // as nothing at all — an unexpected error must not describe the internals.
    console.error('Unhandled error', {
      method,
      path,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    })
    return json(500, { error: 'Internal server error' }, cors)
  }
}

function normalizeHeaders(headers: APIGatewayProxyEventV2['headers']): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value !== undefined) result[key.toLowerCase()] = value
  }
  return result
}
