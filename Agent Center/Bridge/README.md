# Spectacles Agent Bridge

A local daemon that connects AI coding agents (Claude CLI, Codex CLI, OpenClaw) to the Agent Manager Spectacles lens via Supabase real-time channels.

## Overview

The bridge runs on your Mac and acts as a coordinator between the Spectacles lens and local AI agent processes. When you send a message from the lens, the bridge receives it, routes it to the appropriate agent driver, and broadcasts the response back.

## Prerequisites

- Node.js 18+
- A Supabase instance set up via [`supabase/setup.sh`](../supabase/setup.sh)
- One or more of the supported agent CLIs installed:
  - `claude` (Claude CLI)
  - `codex` (Codex CLI)
  - OpenClaw gateway running locally

## Installation

```bash
cd bridge
npm install
```

To install as a global command:
```bash
npm link
```

This makes `specs-agent-bridge` available system-wide. You can then run it from anywhere instead of `node sync.js`.

## Configuration

Create a `.env` file in the `bridge/` directory:

```env
# Required
SUPABASE_URL=https://your-supabase-instance.snapcloud.dev
SUPABASE_ANON_KEY=your-supabase-anon-key

# Optional - Claude CLI
CLAUDE_SESSIONS_DIR=~/.bridge-claude-sessions  # default
CLAUDE_BIN=claude                               # default
CLAUDE_SKIP_PERMISSIONS=false                   # set true to skip MCP permission checks

# Optional - Codex CLI
CODEX_SESSIONS_DIR=~/.bridge-codex-sessions    # default
CODEX_BIN=codex                                # default
CODEX_SKIP_PERMISSIONS=false

# Optional - OpenClaw
OPENCLAW_URL=http://localhost:18789             # default
OPENCLAW_TOKEN=your-gateway-token              # or read from ~/.openclaw/openclaw.json
```

## Usage

**Interactive menu** (add agents, manage workspaces):
```bash
node sync.js
```

**Activate all saved agents directly:**
```bash
node sync.js activate-all
```

### Dashboard

The terminal dashboard (`dashboard.js`) shows live agent states and conversation activity alongside the bridge.

**Keyboard controls:**

| Key | Action |
|-----|--------|
| ↑ / ↓ | Browse conversations within the selected agent |
| Tab | Switch between agents |
| Enter | Open conversation in a new terminal window |
| q | Quit |

Each agent is color-coded and displays state icons (idle, thinking, responding, awaiting permission, offline), message counts, and elapsed time per conversation. Pressing Enter on a conversation launches it in the native CLI (e.g., `claude --resume <id>` via AppleScript on macOS).

## Adding an Agent

1. Run `node sync.js` and select **"Add new agent"**
2. Choose your driver: OpenClaw, Claude CLI, or Codex CLI
3. A pairing code is displayed — enter it in the lens UI
4. Configure workspaces when prompted
5. The agent is saved to `.bridge_agents.json` and starts immediately

Agent credentials are stored locally in `.bridge_agents.json`.

## Drivers

### Claude CLI (`drivers/claude-cli.js`)
Spawns `claude` CLI processes per conversation. Sessions are stored in `~/.bridge-claude-sessions/`. Supports image uploads and MCP-based permission handling.

### Codex CLI (`drivers/codex-cli.js`)
Spawns `codex` CLI processes per conversation. Session metadata is stored in `~/.bridge-codex-sessions/`, including the Codex-reported session ID used for explicit resumes. Supports image uploads via `--image` flag.

### OpenClaw (`drivers/openclaw.js`)
Routes messages to a locally running OpenClaw gateway via its chat completions HTTP endpoint. Includes health checks and automatic retry logic.

## Permission Flow

By default, agents use an MCP permission server so sensitive file/shell operations require your approval in the lens UI.

Set `CLAUDE_SKIP_PERMISSIONS=true` or `CODEX_SKIP_PERMISSIONS=true` to bypass this. Claude uses `--dangerously-skip-permissions`; Codex uses `--dangerously-bypass-approvals-and-sandbox`.

## File Structure

```
bridge/
├── sync.js                    # Main entry point, Supabase integration, message routing
├── dashboard.js               # Real-time terminal dashboard
├── db.js                      # Local SQLite database (conversations & messages)
├── mcp-permission-server.js   # MCP server for permission handling
├── mcp-artifacts-server.js    # MCP server for screen sharing and visual artifacts
├── drivers/
│   ├── claude-cli.js          # Claude CLI driver
│   ├── codex-cli.js           # Codex CLI driver
│   └── openclaw.js            # OpenClaw HTTP driver
├── .env                       # Your environment config (not committed)
└── .bridge_agents.json        # Saved agent configurations (not committed)
```

### Data directories (created automatically)

| Path | Contents |
|------|----------|
| `~/.bridge-data/bridge.db` | SQLite DB with conversations and messages |
| `~/.bridge-data/permissions/` | Permission request/response files |
| `~/.bridge-claude-sessions/` | Claude CLI session files |
| `~/.bridge-codex-sessions/` | Codex CLI session files |

## Artifacts

When artifacts are enabled, agents can push screenshots, code previews, and window captures to the Lens.

## Message Routing

## Broadcast Events

The bridge communicates with the lens via Supabase broadcast channels on `bridge:<agent-id>`.

**Incoming from lens:**

| Event | Description |
|-------|-------------|
| `user_message` | New message from user |
| `stop_request` | Abort current task |
| `fetch_history` | Request conversation history |
| `fetch_conversations` | List all conversations |
| `delete_conversation` | Delete a conversation |
| `fetch_workspaces` | Get configured workspaces |
| `discover_workspaces` | Auto-discover workspace paths |
| `add_workspace` / `remove_workspace` | Manage workspaces |
| `permission_response` | User's allow/deny decision |

**Outgoing to lens:**

| Event | Description |
|-------|-------------|
| `agent_message` | Agent response text |
| `activity_state` | `idle`, `thinking`, `responding`, `awaiting_permission` |
| `bridge_presence` | Keepalive on the live bridge channel while idle |
| `conversation_created` | New conversation started |
| `user_message_ack` | Message received and stored |
| `history_response` | Conversation history |
| `conversations_response` | List of conversations |
