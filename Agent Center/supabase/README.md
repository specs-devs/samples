# Supabase Backend

Cloud backend for Agent Manager providing authentication, realtime messaging, and edge functions.

## Overview

Supabase acts as the relay between the Spectacles Lens and the local Bridge daemon. It handles:

- **Auth** — Snapchat identity-based authentication via Snap Cloud
- **Realtime Broadcast** — Per-agent channels (`bridge:<agent-id>`) for message and state relay
- **Edge Functions** — Serverless endpoints for pairing, heartbeat, and agent commands

## Setup

Run the interactive setup script:

```bash
cd supabase
./setup.sh
```

This links your Supabase project, pushes the database schema, sets secrets, and deploys edge functions.

### Manual Setup

```bash
supabase link --project-ref <project-id>
supabase db push
supabase secrets set CURSOR_WEBHOOK_TOKEN=...
supabase functions deploy
```

## Auth Flow

The Lens authenticates via Snapchat identity tokens injected by the Snap Cloud platform layer.

## Pairing Code Lifecycle

Bridges register a temporary 6-digit pairing code that the Lens user enters to claim the agent.

## Edge Functions

| Function | Called By | Purpose | Rate Limit |
|----------|-----------|---------|------------|
| `register_bridge` | Bridge | Generate 6-digit pairing code (5-min TTL) | 5/IP/60s |
| `poll_bridge` | Bridge | Check pairing status, provision device credentials | 30/agent/60s |
| `pair_bridge` | Lens | Claim agent with pairing code | 10/user/60s |
| `unpair_bridge` | Lens | Remove agent-user link | — |
| `bridge_heartbeat` | Lens | Update agent status and last-seen timestamp | — |
| `bridge_update_name` | Lens | Set display name (max 200 chars) | — |
| `key-store` | Lens | Store encrypted Cursor Cloud API key (AES-256-GCM) | — |
| `key-delete` | Lens | Delete API key and Cursor agent records | — |
| `agent-command` | Lens | Dispatch commands to Cursor Cloud agent | 30/user/60s |
| `cursor_webhook` | External | Receive Cursor Cloud status updates (HMAC-SHA256 verified) | — |

## Database Schema

Defined in `migrations/00000000000000_init.sql`.

### Tables

**`bridge_agents`** — Core table linking agents to users.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | Primary key, auto-generated |
| `owner_id` | uuid | FK to auth.users. NULL until paired |
| `pairing_code` | text | 6-digit code. NULL after pairing |
| `pairing_expires_at` | timestamptz | 5-minute TTL. NULL after pairing |
| `agent_type` | text | `claude`, `codex`, `openclaw`, or `cursor_cloud` |
| `status` | text | `online` or `offline` |
| `last_seen_at` | timestamptz | Updated by heartbeat |
| `name` | text | User-assigned display name |

Row Level Security: Users can only SELECT their own agents (`owner_id = auth.uid()`).

**`cursor_api_keys`** — Encrypted API keys for Cursor Cloud. Service-role access only.

**`cursor_agents`** — Cursor Cloud agent metadata. Service-role access only.

**`rate_limits`** — Sliding-window rate limiting with auto-cleanup.

## File Structure

```
supabase/
├── config.toml              # Project configuration
├── setup.sh                 # Interactive setup script
├── migrations/
│   └── 00000000000000_init.sql  # Schema: tables, RLS policies, rate limiting
└── functions/
    ├── register_bridge/     # Pairing code generation
    ├── pair_bridge/         # Code claim + user linking
    ├── poll_bridge/         # Bridge provisioning poll
    ├── unpair_bridge/       # Agent-user unlinking
    ├── bridge_heartbeat/    # Status + last-seen updates
    ├── bridge_update_name/  # Display name changes
    ├── key-store/           # Encrypted key storage
    ├── key-delete/          # Key + agent cleanup
    ├── agent-command/       # Cursor Cloud dispatch
    └── cursor_webhook/      # Cursor Cloud webhook handler
```
