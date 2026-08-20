import { notFound } from './http.js'

export type Params = Record<string, string>

export type RouteHandler<Ctx> = (ctx: Ctx, params: Params) => Promise<unknown>

type Route<Ctx> = {
  method: string
  segments: string[]
  handler: RouteHandler<Ctx>
}

/**
 * A tiny path router. Patterns look like "/public/tournaments/:id"; a segment
 * starting with ':' captures that part of the path.
 *
 * Deliberately not a dependency: the whole routing table here is a few dozen
 * lines, and a router is the last place this project needs supply-chain risk.
 */
export class Router<Ctx> {
  private routes: Route<Ctx>[] = []

  add(method: string, pattern: string, handler: RouteHandler<Ctx>): this {
    this.routes.push({
      method: method.toUpperCase(),
      segments: splitPath(pattern),
      handler,
    })
    return this
  }

  get = (pattern: string, handler: RouteHandler<Ctx>) => this.add('GET', pattern, handler)
  post = (pattern: string, handler: RouteHandler<Ctx>) => this.add('POST', pattern, handler)
  patch = (pattern: string, handler: RouteHandler<Ctx>) => this.add('PATCH', pattern, handler)
  delete = (pattern: string, handler: RouteHandler<Ctx>) => this.add('DELETE', pattern, handler)

  match(method: string, path: string): { handler: RouteHandler<Ctx>; params: Params } {
    const parts = splitPath(path)
    const wanted = method.toUpperCase()

    for (const route of this.routes) {
      if (route.method !== wanted) continue
      if (route.segments.length !== parts.length) continue

      const params: Params = {}
      let matched = true
      for (let i = 0; i < route.segments.length; i++) {
        const segment = route.segments[i]!
        const part = parts[i]!
        if (segment.startsWith(':')) {
          params[segment.slice(1)] = decodeURIComponent(part)
        } else if (segment !== part) {
          matched = false
          break
        }
      }
      if (matched) return { handler: route.handler, params }
    }

    throw notFound(`No route for ${wanted} ${path}`)
  }
}

function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0)
}
