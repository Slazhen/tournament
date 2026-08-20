# MFTournament API

The backend for MFTournament. Every DynamoDB and S3 operation the site performs
happens in this Lambda, under its own execution role.

## Why this exists

The site used to talk to DynamoDB and S3 straight from the browser, using AWS
access keys that Vite inlined into the public JavaScript bundle. Anyone who
opened the page source had them. The write key allowed read and write on every
table; the "read-only" key allowed `Scan` on `auth-users` and `auth-sessions`,
which meant password hashes, salts and live session tokens were public too.

Nothing in the browser bundle is a credential any more. The frontend knows one
thing about AWS: the URL of this API.

## Layout

```
src/handler.ts        Lambda entry point: routing, CORS, error handling
src/context.ts        What a route handler may know about a request
src/repos.ts          DynamoDB access for organizers, teams and tournaments
src/routes/public.ts  Unauthenticated reads (never private data, never auth tables)
src/routes/auth.ts    Login, session, logout, password change
src/routes/admin.ts   Authenticated writes and account management
src/routes/uploads.ts Presigned image uploads
src/lib/              Router, HTTP helpers, DynamoDB client, cache, passwords, sessions
template.yaml         SAM template: HTTP API, function, IAM policy
```

## Local checks

```bash
npm install
npm test          # unit and request-level tests
npm run typecheck
```

## Deploy

Needs the AWS SAM CLI and credentials that may create CloudFormation stacks,
Lambda functions, an HTTP API and an IAM role.

```bash
sam build
sam deploy --guided     # first time only; answer the prompts and save the config
sam deploy              # afterwards
```

The stack prints `ApiUrl` when it finishes. Put that value in the Amplify
environment variable `VITE_API_BASE_URL`, and delete every `VITE_AWS_*` variable
that is still configured there.

`AllowedOrigins` defaults to the production domain. Add a local origin while
developing:

```bash
sam deploy --parameter-overrides \
  AllowedOrigins=https://myfootballtournament.com,http://localhost:5173
```

## Accounts

Accounts cannot be created from a browser. Use the API as the super admin
(`POST /admin/accounts`), or set a password directly:

```bash
node scripts/set-password.mjs --user Slazhen --password 'choose a real one'
node scripts/set-password.mjs --email organizer@example.com --password '...'
```

The script rejects anything under 12 characters and revokes that account's
existing sessions.

## Cost

Public reads are cached in the function's memory for `SERVER_CACHE_SECONDS`
(60 by default) and carry a matching `Cache-Control` header. One DynamoDB read
now serves every visitor in that window; previously each browser — and each
crawler, which keeps no storage — re-read the tables for itself.
