#!/usr/bin/env bash
set -euo pipefail

# ── Supabase Setup Script ──────────────────────────────────
# Walks you through connecting to an existing Supabase project,
# pushing the schema, setting secrets, and deploying edge functions.
#
# Prerequisites:
#   - A Supabase project already created (supabase.com or Snap Cloud)
#   - supabase CLI installed (brew install supabase/tap/supabase)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="snap"

# ── Helpers ─────────────────────────────────────────────────
info()  { printf "\033[1;34m→\033[0m %s\n" "$*"; }
ok()    { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
err()   { printf "\033[1;31m✗\033[0m %s\n" "$*" >&2; }
ask()   { printf "\033[1;33m?\033[0m %s " "$1"; read -r "$2"; }

# ── Preflight ───────────────────────────────────────────────
if ! command -v supabase &>/dev/null; then
  err "supabase CLI not found. Install it with:"
  echo ""
  echo "    brew install supabase/tap/supabase"
  echo ""
  exit 1
fi
ok "supabase CLI found ($(supabase --version 2>/dev/null || echo 'unknown version'))"

# ── 1. Link project ────────────────────────────────────────
info "Link your Supabase project"
echo "  You can find your project ref in the Supabase dashboard under Settings > General."
echo ""
ask "Project ref (e.g. abcdefghijklmnop):" PROJECT_REF

if [ -z "$PROJECT_REF" ]; then
  err "Project ref is required."
  exit 1
fi

info "Linking project $PROJECT_REF ..."
supabase link --project-ref "$PROJECT_REF" --profile "$PROFILE" --dns-resolver https
ok "Project linked"

# ── 2. Push schema ──────────────────────────────────────────
info "Pushing database schema ..."
supabase db push --profile "$PROFILE" --dns-resolver https
ok "Schema applied"

# ── 3. Set secrets ──────────────────────────────────────────
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

# ── 4. Deploy edge functions ────────────────────────────────
info "Deploying edge functions ..."
supabase functions deploy --no-verify-jwt --profile "$PROFILE"
ok "Edge functions deployed"

# ── 5. Fetch project URL and anon key ──────────────────────
SUPABASE_URL="$(supabase inspect db info --profile "$PROFILE" 2>/dev/null | grep -oP 'https://[^\s]+' || true)"
if [ -z "$SUPABASE_URL" ]; then
  # Fallback: construct from project ref
  SUPABASE_URL="https://${PROJECT_REF}.snapcloud.dev"
fi

# ── 6. Write bridge .env ───────────────────────────────────
BRIDGE_ENV="$SCRIPT_DIR/../bridge/.env"
info "Configuring bridge/.env"

if [ -f "$BRIDGE_ENV" ]; then
  ask "bridge/.env already exists. Overwrite Supabase values? (y/N):" OVERWRITE
  OVERWRITE="${OVERWRITE:-N}"
  if [[ ! "$OVERWRITE" =~ ^[Yy]$ ]]; then
    info "Skipping bridge/.env"
  fi
fi

if [ ! -f "$BRIDGE_ENV" ] || [[ "${OVERWRITE:-}" =~ ^[Yy]$ ]]; then
  ask "Supabase anon key:" ANON_KEY
  if [ -z "$ANON_KEY" ]; then
    err "Anon key is required for bridge/.env"
    exit 1
  fi
  cat > "$BRIDGE_ENV" <<EOF
SUPABASE_URL=$SUPABASE_URL
SUPABASE_ANON_KEY=$ANON_KEY
EOF
  ok "Wrote bridge/.env"
fi

# ── Done ────────────────────────────────────────────────────
echo ""
ok "Supabase setup complete!"
echo ""
echo "  Project URL:  $SUPABASE_URL"
echo "  Profile:      $PROFILE"
echo ""
echo "  Next steps:"
echo ""
echo "    1. Install the bridge as a global command:"
echo "       cd bridge && npm install && npm link"
echo ""
echo "    2. Run it from anywhere:"
echo "       specs-agent-bridge"
echo ""
echo "    3. In Lens Studio, set the SupabaseProject asset with your project URL, anon key, and project ID."
echo ""
if [[ "${GEN_SECRETS:-}" =~ ^[Yy]$ ]]; then
  echo "  Generated secrets (save these somewhere safe):"
  echo "    KEY_ENC_KEY:    $KEY_ENC_KEY"
  echo "    WEBHOOK_SECRET: $WEBHOOK_SECRET"
  echo ""
fi
