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
#
# The commit takes the whole working tree, so it takes whatever else is in it —
# an unfinished change from another session included. That has shipped work
# nobody meant to ship twice. So the tree is printed and confirmed before any of
# the slow steps run, and confirmed again against the same list at the commit:
#
#   DEPLOY_ALL=1 ./deploy.sh "..."      say yes in advance (for a non-interactive shell)
#   ONLY="src server" ./deploy.sh "..." commit only these paths

set -euo pipefail

cd "$(dirname "$0")"

message="${1:-}"
if [[ -z "$message" && "${SKIP_PUSH:-0}" != "1" ]]; then
  echo "Usage: ./deploy.sh \"commit message\"" >&2
  exit 1
fi

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

# Which paths the commit will take. Empty means the whole tree.
paths=()
if [[ -n "${ONLY:-}" ]]; then
  read -r -a paths <<< "$ONLY"
fi
[[ ${#paths[@]} -gt 0 ]] || paths=(.)

# An agent working in this folder over the remote-device bridge cannot delete
# files, so a git command interrupted there leaves an index.lock behind that
# nothing clears — and every later commit dies on it. Safe to remove only when
# no git process is actually holding it.
if [[ -e .git/index.lock ]]; then
  if pgrep -x git >/dev/null 2>&1; then
    echo "A git process is running and holds .git/index.lock. Stopping." >&2
    exit 1
  fi
  echo "Clearing a stale .git/index.lock — no git process is running."
  rm -f .git/index.lock
fi

# Read with the optional locks off throughout: a plain 'git status' writes the
# index, which is how the stale lock above gets left in the first place.
tree_state() { git --no-optional-locks status --short -- "${paths[@]}"; }

planned=""
if [[ "${SKIP_PUSH:-0}" != "1" ]]; then
  step "What this will commit"
  planned="$(tree_state)"

  if [[ -z "$planned" ]]; then
    echo "Nothing to commit."
  else
    echo "$planned"
    echo
    if [[ -t 0 ]]; then
      read -r -p "Commit all of this as \"$message\"? [y/N] " answer
      if [[ ! "$answer" =~ ^[Yy] ]]; then
        echo "Stopped. Nothing was built, deployed or committed."
        exit 1
      fi
    elif [[ "${DEPLOY_ALL:-0}" != "1" ]]; then
      cat >&2 <<'EOF'

This shell has no terminal to ask at, and the list above is everything the
commit would take. Read it. If all of it belongs in this deploy:

  DEPLOY_ALL=1 ./deploy.sh "your message"

If only part of it does, name the paths instead:

  ONLY="src/pages server/src" ./deploy.sh "your message"
EOF
      exit 2
    fi
  fi
fi

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

  step "Building the API"
  (cd server && sam build)

  # The tests import the source; Lambda imports the bundle. A bundle that will
  # not load is a total outage, and nothing above this line would notice.
  step "Checking the built function actually loads"
  (cd server && node scripts/smoke-init.mjs)

  step "Deploying the API"
  (cd server && sam deploy --no-confirm-changeset --no-fail-on-empty-changeset)
fi

if [[ "${SKIP_PUSH:-0}" != "1" ]]; then
  step "Committing and pushing"

  # The checks and the API deploy take minutes, and another session can write
  # into this folder while they run — which is exactly how unfinished work has
  # ridden along in somebody else's commit. What is committed has to be what was
  # agreed to at the top, or nothing is.
  if [[ "$(tree_state)" != "$planned" ]]; then
    echo "The working tree changed while this ran. Nothing has been committed." >&2
    echo "It now holds:" >&2
    tree_state >&2
    echo >&2
    echo "Look at that list, then run the deploy again — SKIP_API=1 if the API is already out." >&2
    exit 1
  fi

  git add -A -- "${paths[@]}"
  if git --no-optional-locks diff --cached --quiet; then
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
