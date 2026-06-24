#!/usr/bin/env bash
set -euo pipefail

# ── Supabase Setup Script ──────────────────────────────────
# Walks you through creating (or linking) a Snap Cloud Supabase
# project, pushing the schema, setting secrets, deploying edge
# functions, and writing the Bridge .env — all in one go.
#
# Prerequisites:
#   - supabase CLI installed:  brew install supabase/tap/supabase
#   - Snap Cloud access (alpha): https://developers.snap.com/spectacles/about-spectacles-features/snap-cloud/getting-started
#
# Snap Cloud dashboard: https://cloud.snap.com

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="snap"
DASHBOARD_URL="https://cloud.snap.com"

# ── Helpers ─────────────────────────────────────────────────
info()  { printf "\033[1;34m→\033[0m %s\n" "$*"; }
ok()    { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
err()   { printf "\033[1;31m✗\033[0m %s\n" "$*" >&2; }
ask()   { printf "\033[1;33m?\033[0m %s " "$1"; read -r "$2"; }

# ── Preflight: CLI installed ────────────────────────────────
if ! command -v supabase &>/dev/null; then
  err "supabase CLI not found. Install it with:"
  echo ""
  echo "    brew install supabase/tap/supabase"
  echo ""
  exit 1
fi
ok "supabase CLI found ($(supabase --version 2>/dev/null || echo 'unknown version'))"

# ── Preflight: logged in to Snap Cloud ──────────────────────
# Agent Manager uses Snap Cloud (Supabase hosted by Snap), which lives
# under the CLI's "snap" profile — a plain `supabase login` is NOT enough.
info "Checking Snap Cloud login (profile: $PROFILE) ..."
if ! supabase projects list --profile "$PROFILE" --output json &>/dev/null; then
  err "Not logged in to Snap Cloud."
  echo ""
  echo "  Run this first, then re-run setup.sh:"
  echo ""
  echo "    supabase login --profile snap"
  echo ""
  echo "  (The --profile snap part matters: it signs you in to Snap Cloud"
  echo "   at $DASHBOARD_URL instead of public supabase.com.)"
  exit 1
fi
ok "Logged in to Snap Cloud"

# ── 1. Choose or create a project ───────────────────────────
echo ""
info "Your Snap Cloud projects:"
supabase projects list --profile "$PROFILE" 2>/dev/null || true
echo ""

ask "Create a NEW Snap Cloud project for Agent Manager? (Y/n):" CREATE_NEW
CREATE_NEW="${CREATE_NEW:-Y}"

PROJECT_REF=""
if [[ "$CREATE_NEW" =~ ^[Yy]$ ]]; then
  ask "Project name (default: AgentManager):" PROJECT_NAME
  PROJECT_NAME="${PROJECT_NAME:-AgentManager}"

  ORG_ID="$(supabase orgs list --profile "$PROFILE" 2>/dev/null \
    | sed $'s/\x1b\\[[0-9;?]*[a-zA-Z]//g' \
    | awk -F'|' 'NF>=2 {id=$1; gsub(/[[:space:]]/,"",id); if (id != "" && id != "ID" && id !~ /^-+$/) {print id; exit}}')"

  DB_PASSWORD="$(openssl rand -base64 24)"

  info "Creating project \"$PROJECT_NAME\" ..."
  if supabase projects create "$PROJECT_NAME" \
      --profile "$PROFILE" \
      ${ORG_ID:+--org-id "$ORG_ID"} \
      --db-password "$DB_PASSWORD"; then
    # Resolve the ref of the project we just created
    PROJECT_REF="$(supabase projects list --profile "$PROFILE" --output json 2>/dev/null \
      | python3 -c "import json,sys; ps=[p for p in json.load(sys.stdin) if p['name']=='$PROJECT_NAME']; ps.sort(key=lambda p: p['created_at']); print(ps[-1]['ref'] if ps else '')")"
    if [ -n "$PROJECT_REF" ]; then
      ok "Project created (ID: $PROJECT_REF)"
      echo "  Database password (save it somewhere safe): $DB_PASSWORD"
    else
      err "Project created but could not resolve its ID automatically."
    fi
  else
    err "Automatic project creation failed."
  fi

  if [ -z "$PROJECT_REF" ]; then
    echo ""
    echo "  Create one manually instead:"
    echo "    1. Open $DASHBOARD_URL and sign in"
    echo "    2. Click \"New project\", pick any name (e.g. AgentManager)"
    echo "    3. Once created, copy the Project ID from Settings > General"
    echo "       (Or: in Lens Studio, Window > Supabase > Create Project)"
    echo ""
  fi
fi

if [ -z "$PROJECT_REF" ]; then
  echo "  Find your Project ID at $DASHBOARD_URL under Settings > General,"
  echo "  or in the projects list printed above (REFERENCE ID column)."
  echo ""
  ask "Project ID (e.g. abcdefghijklmnop):" PROJECT_REF
fi

if [ -z "$PROJECT_REF" ]; then
  err "Project ID is required."
  exit 1
fi

# ── 2. Link project ─────────────────────────────────────────
info "Linking project $PROJECT_REF ..."
echo "  (If asked to confirm anything below, answering Y is safe.)"
supabase link --project-ref "$PROJECT_REF" --profile "$PROFILE" --dns-resolver https
ok "Project linked"

# ── 3. Push schema ──────────────────────────────────────────
info "Pushing database schema (answer Y when prompted) ..."
supabase db push --profile "$PROFILE" --dns-resolver https
ok "Schema applied"

# ── 4. Set secrets ──────────────────────────────────────────
info "Setting up edge function secrets"
echo ""
echo "  KEY_ENC_KEY    — 32-byte AES key for encrypting stored Cursor API keys."
echo "  WEBHOOK_SECRET — HMAC secret for validating Cursor webhook callbacks."
echo ""

ask "Generate new secrets automatically? (Y/n):" GEN_SECRETS
GEN_SECRETS="${GEN_SECRETS:-Y}"

if [[ "$GEN_SECRETS" =~ ^[Yy]$ ]]; then
  KEY_ENC_KEY=$(openssl rand -base64 32)
  WEBHOOK_SECRET=$(openssl rand -hex 32)
  ok "Generated KEY_ENC_KEY and WEBHOOK_SECRET"
else
  ask "KEY_ENC_KEY (base64):" KEY_ENC_KEY
  ask "WEBHOOK_SECRET:" WEBHOOK_SECRET
  if [ -z "$KEY_ENC_KEY" ] || [ -z "$WEBHOOK_SECRET" ]; then
    err "Both secrets are required."
    exit 1
  fi
fi

info "Pushing secrets to Supabase ..."
supabase secrets set \
  KEY_ENC_KEY="$KEY_ENC_KEY" \
  WEBHOOK_SECRET="$WEBHOOK_SECRET" \
  --profile "$PROFILE"
ok "Secrets set"

# ── 5. Deploy edge functions ────────────────────────────────
info "Deploying edge functions ..."
supabase functions deploy --no-verify-jwt --profile "$PROFILE"
ok "Edge functions deployed"

# ── 6. Fetch project URL and anon key ───────────────────────
SUPABASE_URL="https://${PROJECT_REF}.snapcloud.dev"

info "Fetching anon key ..."
ANON_KEY="$(supabase projects api-keys --project-ref "$PROJECT_REF" --profile "$PROFILE" 2>/dev/null \
  | awk -F'|' '$1 ~ /^[[:space:]]*anon[[:space:]]*$/ {gsub(/[[:space:]]/,"",$2); print $2; exit}')"

if [ -n "$ANON_KEY" ]; then
  ok "Anon key fetched automatically"
else
  echo "  Could not fetch it automatically. Find it at $DASHBOARD_URL"
  echo "  under your project's Settings > API Keys (the \"anon\" key)."
  echo ""
  ask "Supabase anon key:" ANON_KEY
  if [ -z "$ANON_KEY" ]; then
    err "Anon key is required for Bridge/.env"
    exit 1
  fi
fi

# ── 7. Write Bridge .env ────────────────────────────────────
BRIDGE_ENV="$SCRIPT_DIR/../Bridge/.env"
info "Configuring Bridge/.env"

WRITE_ENV="Y"
if [ -f "$BRIDGE_ENV" ]; then
  ask "Bridge/.env already exists. Overwrite Supabase values? (y/N):" OVERWRITE
  OVERWRITE="${OVERWRITE:-N}"
  if [[ ! "$OVERWRITE" =~ ^[Yy]$ ]]; then
    info "Skipping Bridge/.env"
    WRITE_ENV="N"
  fi
fi

if [[ "$WRITE_ENV" =~ ^[Yy]$ ]]; then
  cat > "$BRIDGE_ENV" <<EOF
SUPABASE_URL=$SUPABASE_URL
SUPABASE_ANON_KEY=$ANON_KEY
EOF
  ok "Wrote Bridge/.env (URL + anon key — no manual copying needed)"
fi

# ── Done ────────────────────────────────────────────────────
echo ""
ok "Supabase setup complete!"
echo ""
echo "  Project URL:  $SUPABASE_URL"
echo "  Project ID:   $PROJECT_REF"
echo "  Dashboard:    $DASHBOARD_URL"
echo ""
echo "  Next steps:"
echo ""
echo "    1. Start the Bridge (Bridge/.env is already configured):"
echo "       cd ../Bridge && npm install && node sync.js"
echo ""
echo "    2. In Lens Studio: Window > Supabase > sign in > select your"
echo "       project > Import Credentials. This creates a SupabaseProject"
echo "       asset in the Asset Browser."
echo ""
echo "    3. Drag that SupabaseProject asset onto the SnapCloudRequirements"
echo "       object in the Scene Hierarchy (Supabase Project input)."
echo ""
if [[ "${GEN_SECRETS:-}" =~ ^[Yy]$ ]]; then
  echo "  Generated secrets (save these somewhere safe):"
  echo "    KEY_ENC_KEY:    $KEY_ENC_KEY"
  echo "    WEBHOOK_SECRET: $WEBHOOK_SECRET"
  echo ""
fi
