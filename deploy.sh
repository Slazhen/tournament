#!/usr/bin/env bash
#
# One command to check, commit and ship.
#
#   ./deploy.sh "what changed"
#
# Runs the checks first, then deploys the API, then pushes — Amplify picks the
# push up and builds the site. Any step that fails stops the rest, so a broken
# build never reaches the branch that is serving traffic.
#
# Skip parts when you know what you are doing:
#   SKIP_API=1 ./deploy.sh "frontend only"
#   SKIP_PUSH=1 ./deploy.sh "api only"

set -euo pipefail

cd "$(dirname "$0")"

message="${1:-}"
if [[ -z "$message" && "${SKIP_PUSH:-0}" != "1" ]]; then
  echo "Usage: ./deploy.sh \"commit message\"" >&2
  exit 1
fi

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

step "Type-checking the site"
npx tsc -p tsconfig.app.json --noEmit

step "Building the site"
npm run build

step "Checking the bundle carries no credentials"
if grep -rlE 'AKIA[A-Z0-9]{16}|accessKeyId' dist/assets >/dev/null 2>&1; then
  echo "A credential appears in the built bundle. Stopping." >&2
  exit 1
fi
echo "Clean."

if [[ "${SKIP_API:-0}" != "1" ]]; then
  step "Testing the API"
  (cd server && npm test)

  step "Deploying the API"
  (cd server && sam build && sam deploy --no-confirm-changeset --no-fail-on-empty-changeset)
fi

if [[ "${SKIP_PUSH:-0}" != "1" ]]; then
  step "Committing and pushing"
  git add -A
  if git diff --cached --quiet; then
    echo "Nothing to commit."
  else
    git commit -m "$message"
  fi
  git push
  echo
  echo "Pushed. Amplify is building the site now:"
  echo "https://us-east-1.console.aws.amazon.com/amplify/apps/d35z79op528mas"
fi

step "Done"
