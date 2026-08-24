#!/bin/bash
set -euo pipefail

# Gym SaaS Starter — guided macOS setup and deployment.
# Safe to re-run: it checks completed steps and avoids force-pushing Git history.

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
GITHUB_REPO="jalalrahbani/gym-saas-starter"
GITHUB_REMOTE="https://github.com/${GITHUB_REPO}.git"

export NEXT_TELEMETRY_DISABLED=1

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

say() { printf "\n${BLUE}${BOLD}==>${NC} %s\n" "$1"; }
ok() { printf "${GREEN}✓${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}!${NC} %s\n" "$1"; }
fail() { printf "${RED}✗ %s${NC}\n" "$1" >&2; exit 1; }
pause() { printf "\nPress RETURN to continue..."; read -r _; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

open_url() {
  if command_exists open; then
    open "$1" >/dev/null 2>&1 || true
  fi
}

normalize_project_ref() {
  local raw="$1"
  if printf '%s' "$raw" | grep -q '/project/'; then
    printf '%s' "$raw" | sed -E 's#.*\/project\/([a-zA-Z0-9_-]+).*#\1#'
  elif printf '%s' "$raw" | grep -q '\.supabase\.co'; then
    printf '%s' "$raw" | sed -E 's#https?://([^.]+)\.supabase\.co.*#\1#'
  else
    printf '%s' "$raw" | tr -d '[:space:]'
  fi
}

vercel_env_set() {
  local key="$1"
  local value="$2"
  local env="$3"
  [ -n "$value" ] || return 0

  # Remove old value if this is a re-run. Failure simply means it did not exist.
  npx --yes vercel@latest env rm "$key" "$env" --yes >/dev/null 2>&1 || true
  printf '%s\n' "$value" | npx --yes vercel@latest env add "$key" "$env" >/dev/null
}

cd "$PROJECT_DIR"
clear || true
printf "${BOLD}Gym SaaS Starter — Mac Setup & Deployment${NC}\n"
printf "This script will prepare the project, push it to GitHub, connect Supabase, and deploy to Vercel.\n"
printf "It will pause only when a browser login or account value is required.\n"

if [ "$(uname -s)" != "Darwin" ]; then
  fail "This installer is intended for macOS."
fi

say "1/9 Checking developer tools"
if ! command_exists xcode-select || ! xcode-select -p >/dev/null 2>&1; then
  warn "Apple Command Line Tools are not installed. macOS will open the installer."
  xcode-select --install || true
  printf "Finish the Apple installer, then return here.\n"
  pause
  xcode-select -p >/dev/null 2>&1 || fail "Command Line Tools are still unavailable. Re-run this installer after installation finishes."
fi
ok "Apple Command Line Tools"

say "2/9 Checking Homebrew, Node.js, Git, and GitHub CLI"
if ! command_exists brew; then
  warn "Homebrew is missing. The official Homebrew installer will run now."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

command_exists brew || fail "Homebrew installation could not be detected."
ok "Homebrew"

if ! command_exists git; then
  brew install git
fi
ok "Git $(git --version | awk '{print $3}')"

NEED_NODE=0
if ! command_exists node; then
  NEED_NODE=1
else
  NODE_MAJOR="$(node -p 'parseInt(process.versions.node.split(".")[0],10)' 2>/dev/null || echo 0)"
  if [ "$NODE_MAJOR" -lt 20 ]; then NEED_NODE=1; fi
fi
if [ "$NEED_NODE" -eq 1 ]; then
  warn "Node.js 20+ is required. Installing current Homebrew Node.js."
  brew install node || brew upgrade node
fi
command_exists node || fail "Node.js installation failed."
NODE_MAJOR="$(node -p 'parseInt(process.versions.node.split(".")[0],10)')"
[ "$NODE_MAJOR" -ge 20 ] || fail "Node.js $(node -v) is too old. Version 20+ is required."
ok "Node.js $(node -v) / npm $(npm -v)"

if ! command_exists gh; then
  brew install gh
fi
ok "GitHub CLI $(gh --version | head -1 | awk '{print $3}')"

say "3/9 Signing in to GitHub"
if ! gh auth status -h github.com >/dev/null 2>&1; then
  printf "A browser sign-in will open. Sign in as ${BOLD}jalalrahbani${NC} and authorize GitHub CLI.\n"
  gh auth login --hostname github.com --git-protocol https --web
fi
gh auth setup-git >/dev/null 2>&1 || true
GH_USER="$(gh api user --jq .login 2>/dev/null || true)"
[ "$GH_USER" = "jalalrahbani" ] || warn "GitHub CLI is logged in as '${GH_USER:-unknown}', not jalalrahbani. The push may fail if that account lacks access."
ok "GitHub authenticated as ${GH_USER:-unknown}"

say "4/9 Installing application dependencies"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
ok "Application dependencies installed"

say "5/9 Creating and connecting the Supabase database"
printf "Supabase hosts the database, login system, and private member files.\n"
printf "If you already created a Supabase project for this app, you can use it.\n"
open_url "https://database.new"
printf "\nIn the browser:\n"
printf "  1. Sign in/create a Supabase account.\n"
printf "  2. Create a project named something like 'gym-saas-starter'.\n"
printf "  3. Save the database password somewhere safe.\n"
printf "  4. Wait until the project says it is ready.\n"
pause

printf "Paste the Supabase Project Ref, project URL, or dashboard URL: "
read -r SUPABASE_REF_INPUT
PROJECT_REF="$(normalize_project_ref "$SUPABASE_REF_INPUT")"
[ -n "$PROJECT_REF" ] || fail "No Supabase project reference was provided."
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

printf "Enter the Supabase database password you chose (hidden): "
read -r -s SUPABASE_DB_PASSWORD
printf "\n"
[ -n "$SUPABASE_DB_PASSWORD" ] || fail "Database password is required to apply migrations."

if [ ! -f supabase/config.toml ]; then
  npx --yes supabase@latest init
fi

printf "Supabase CLI will now open a browser login.\n"
npx --yes supabase@latest login
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" npx --yes supabase@latest link --project-ref "$PROJECT_REF"
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" npx --yes supabase@latest db push
ok "Database migrations applied to ${PROJECT_REF}"

printf "\nNow I need the two API keys used by the app.\n"
printf "I opened the project dashboard. Go to ${BOLD}Settings → API Keys${NC}.\n"
open_url "https://supabase.com/dashboard/project/${PROJECT_REF}/settings/api"
printf "Copy the ${BOLD}Publishable key${NC} (starts with sb_publishable_) and paste it here: "
read -r SUPABASE_PUBLISHABLE_KEY
[ -n "$SUPABASE_PUBLISHABLE_KEY" ] || fail "Publishable key is required."

printf "Copy the ${BOLD}Secret key${NC} (starts with sb_secret_) and paste it here (hidden): "
read -r -s SUPABASE_SECRET_KEY
printf "\n"
[ -n "$SUPABASE_SECRET_KEY" ] || fail "Secret key is required."

CARD_TOKEN_HMAC_SECRET="$(openssl rand -hex 32)"
CRON_SECRET="$(openssl rand -hex 32)"

cat > .env.local <<ENVEOF
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_PUBLISHABLE_KEY}
SUPABASE_SECRET_KEY=${SUPABASE_SECRET_KEY}
NEXT_PUBLIC_SITE_URL=http://localhost:3000
CARD_TOKEN_HMAC_SECRET=${CARD_TOKEN_HMAC_SECRET}
CRON_SECRET=${CRON_SECRET}
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_PRO=
ENVEOF
chmod 600 .env.local
ok "Local environment file created securely (.env.local is ignored by Git)"

say "6/9 Verifying the application before upload"
npm run typecheck
npm run build
ok "TypeScript and production Next.js build passed"

say "7/9 Publishing the source code to GitHub"
if [ ! -d .git ]; then
  git init
fi

# Put the complete current snapshot on main for the initial repository publication.
git checkout -B main

CURRENT_REMOTE="$(git remote get-url origin 2>/dev/null || true)"
if [ -z "$CURRENT_REMOTE" ]; then
  git remote add origin "$GITHUB_REMOTE"
elif [ "$CURRENT_REMOTE" != "$GITHUB_REMOTE" ]; then
  warn "Changing origin from '$CURRENT_REMOTE' to '$GITHUB_REMOTE'."
  git remote set-url origin "$GITHUB_REMOTE"
fi

# Commit generated reproducibility files if npm/supabase init created them.
if [ -f package-lock.json ]; then git add -- package-lock.json; fi
if [ -f supabase/config.toml ]; then git add -- supabase/config.toml; fi
if ! git diff --cached --quiet; then
  git commit -m "Add reproducible local setup metadata"
fi

git push -u origin main
ok "Source pushed to https://github.com/${GITHUB_REPO}"

say "8/9 Connecting and deploying to Vercel"
printf "Vercel will open a browser login. Use the Vercel account you want to own this app.\n"
if ! npx --yes vercel@latest whoami >/dev/null 2>&1; then
  npx --yes vercel@latest login
fi

# Creates/links the project. The first URL value is temporary so the server can build.
npx --yes vercel@latest link --yes

for TARGET in production preview; do
  vercel_env_set NEXT_PUBLIC_SUPABASE_URL "$SUPABASE_URL" "$TARGET"
  vercel_env_set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$SUPABASE_PUBLISHABLE_KEY" "$TARGET"
  vercel_env_set SUPABASE_SECRET_KEY "$SUPABASE_SECRET_KEY" "$TARGET"
  vercel_env_set CARD_TOKEN_HMAC_SECRET "$CARD_TOKEN_HMAC_SECRET" "$TARGET"
  vercel_env_set CRON_SECRET "$CRON_SECRET" "$TARGET"
  vercel_env_set NEXT_PUBLIC_SITE_URL "https://placeholder.invalid" "$TARGET"
done

printf "\nRunning the first production deployment now.\n"
npx --yes vercel@latest deploy --prod --yes

printf "\n${BOLD}Look just above for the final https://...vercel.app production URL.${NC}\n"
printf "Paste that exact production URL here (for example https://my-project.vercel.app): "
read -r SITE_URL
SITE_URL="${SITE_URL%/}"
case "$SITE_URL" in
  https://*) ;;
  *) fail "The production URL must begin with https://" ;;
esac

for TARGET in production preview; do
  vercel_env_set NEXT_PUBLIC_SITE_URL "$SITE_URL" "$TARGET"
done

# Update local env too.
python3 - "$SITE_URL" <<'PY'
from pathlib import Path
import sys
p=Path('.env.local')
site=sys.argv[1]
lines=p.read_text().splitlines()
out=[]
found=False
for line in lines:
    if line.startswith('NEXT_PUBLIC_SITE_URL='):
        out.append('NEXT_PUBLIC_SITE_URL='+site)
        found=True
    else:
        out.append(line)
if not found:
    out.append('NEXT_PUBLIC_SITE_URL='+site)
p.write_text('\n'.join(out)+'\n')
PY

printf "Redeploying with the final application URL...\n"
npx --yes vercel@latest deploy --prod --yes
ok "Vercel deployment completed"

say "9/9 Final Supabase Auth URL configuration"
printf "Supabase must allow the production app URL for signup confirmation and password-reset redirects.\n"
open_url "https://supabase.com/dashboard/project/${PROJECT_REF}/auth/url-configuration"
printf "\nIn the browser, set:\n"
printf "  Site URL:                 ${BOLD}%s${NC}\n" "$SITE_URL"
printf "  Additional Redirect URL: ${BOLD}%s/**${NC}\n" "$SITE_URL"
printf "  Additional Redirect URL: ${BOLD}http://localhost:3000/**${NC}\n"
printf "Save those changes.\n"
pause

printf "\n${GREEN}${BOLD}SETUP COMPLETE${NC}\n"
printf "GitHub:  https://github.com/${GITHUB_REPO}\n"
printf "Live app: %s\n" "$SITE_URL"
printf "\nNext: open the live app, create your first owner account, and complete gym onboarding.\n"
printf "Stripe billing is intentionally left OFF until the operational test is complete.\n"
open_url "$SITE_URL"

printf "\nYou can close this Terminal window.\n"
