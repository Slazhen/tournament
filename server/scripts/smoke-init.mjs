#!/usr/bin/env node
/**
 * Loads the built bundle before it is deployed.
 *
 * This exists because of a real outage: a dependency that was still CommonJS
 * called `require` for a Node built-in, esbuild left the call in an ES module
 * that has no `require`, and the function threw the instant Lambda loaded it.
 * Every route — public pages, login, everything — came back as API Gateway's
 * own "Internal Server Error", because our own handler never got to run. The
 * type checker and the unit tests were both perfectly happy: neither of them
 * ever imports the bundle.
 *
 * So this does the one thing they don't. It imports the artifact `sam build`
 * just produced, with placeholder configuration, and fails the deploy if the
 * import throws. It does not call the handler and it touches no AWS service —
 * a cold start is exactly what is being tested.
 */

import { pathToFileURL } from 'node:url'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'

const bundle = resolve(
  process.argv[2] ?? '.aws-sam/build/ApiFunction/handler.mjs',
)

// Real names are irrelevant here — nothing is called. What matters is that
// every variable the module asks for at import time is present, so that a
// missing one shows up as the loud failure it is rather than hiding behind a
// placeholder.
Object.assign(process.env, {
  TABLE_ORGANIZERS: 'smoke-organizers',
  TABLE_TEAMS: 'smoke-teams',
  TABLE_TOURNAMENTS: 'smoke-tournaments',
  TABLE_MATCHES: 'smoke-matches',
  TABLE_AUTH_USERS: 'smoke-auth-users',
  TABLE_AUTH_SESSIONS: 'smoke-auth-sessions',
  TABLE_PASSWORD_RESETS: 'smoke-password-resets',
  TABLE_AUDIT: 'smoke-audit',
  TABLE_INVITES: 'smoke-invites',
  TABLE_ENTRIES: 'smoke-entries',
  S3_BUCKET: 'smoke-images',
  AWS_REGION: process.env.AWS_REGION ?? 'us-east-1',
})

try {
  await access(bundle)
} catch {
  console.error(`No bundle at ${bundle}. Run "sam build" first.`)
  process.exit(1)
}

let module
try {
  module = await import(pathToFileURL(bundle).href)
} catch (error) {
  console.error('The built function fails to load. This would be a total outage.\n')
  console.error(error?.stack ?? error)
  process.exit(1)
}

if (typeof module.handler !== 'function') {
  console.error(`The bundle loaded but exports no handler. Exports: ${Object.keys(module).join(', ') || 'none'}`)
  process.exit(1)
}

console.log('The function loads and exports a handler.')
