# Bridge Drivers

This document covers the CLI/agent connections the bridge currently supports, plus candidates worth adding in the future.

---

## Current Drivers

### Claude CLI (`drivers/claude-cli.js`)

Spawns the `claude` binary as a subprocess per conversation.

| Detail | Value |
|--------|-------|
| Binary | `claude` (override: `CLAUDE_BIN`) |
| Sessions | `~/.bridge-claude-sessions/` (override: `CLAUDE_SESSIONS_DIR`) |
| Auth | `claude auth status` — run `claude` and follow login prompts |
| Images | Writes temp PNG files, passes paths inline in the prompt |
| Permissions | MCP permission server by default; set `CLAUDE_SKIP_PERMISSIONS=true` to bypass |
| Timeout | 5 minutes |

**How it works:** Each conversation gets a `--session-id`. Follow-up messages use `--resume` to continue the same session. When MCP permissions are enabled, a temp JSON config is written pointing at `mcp-permission-server.js`, and the `--permission-prompt-tool` flag routes sensitive operations back to the lens for approval.

---

### Codex CLI (`drivers/codex-cli.js`)

Spawns the `codex` binary as a subprocess per conversation.

| Detail | Value |
|--------|-------|
| Binary | `codex` (override: `CODEX_BIN`) |
| Sessions | `~/.bridge-codex-sessions/<conversationId>/` plus a persisted Codex session ID file (override: `CODEX_SESSIONS_DIR`) |
| Auth | `codex login` |
| Images | `--image <path>` flag, one per image |
| Permissions | MCP permission server by default; set `CODEX_SKIP_PERMISSIONS=true` to bypass |
| Timeout | 5 minutes |

**How it works:** Unlike Claude CLI, Codex does not let the bridge provide its own session ID at launch time. New conversations run `codex exec`, the driver parses Codex's reported `session id`, and stores it under the per-conversation directory. Follow-ups use `codex exec resume <session-id>`, which avoids `--last` collisions across shared workspaces. Output is captured via `--output-last-message` to a temp file.

---

### OpenClaw (`drivers/openclaw.js`)

Routes messages to a locally running OpenClaw gateway over HTTP.

| Detail | Value |
|--------|-------|
| Endpoint | `http://localhost:18789/v1/chat/completions` (override: `OPENCLAW_URL`) |
| Auth | `~/.openclaw/openclaw.json` or `OPENCLAW_TOKEN` env var |
| Images | Not supported |
| Permissions | Not supported (no MCP integration) |
| Retries | Health check retries up to 5× with 5s delay |

**How it works:** Sends OpenAI-compatible `POST /v1/chat/completions` requests. The `user` field is set to `spectacles:<conversationId>` for session tracking on the gateway side. On setup, it auto-enables the `chatCompletions` endpoint in the OpenClaw config and restarts the gateway if needed. Supports abort via `AbortController`.

---

## Potential Future Drivers

### Gemini CLI
Google's counterpart to Claude CLI and Codex CLI. Would follow the same subprocess pattern as `claude-cli.js` — spawn per conversation, pass session ID, handle image uploads. Auth via `gcloud` / Google account.

### Aider
Open-source coding assistant that runs as a CLI (`aider`). Already designed for multi-turn conversations in a working directory, so session management would be straightforward. Supports many LLM backends, which could make it useful as a model-agnostic driver.

### Amazon Q CLI
AWS's coding agent (`q`). Subprocess-based like Claude/Codex. Would be valuable for users already in the AWS ecosystem. Auth via AWS credentials / SSO.

### Ollama (Local LLM)
Ollama exposes an OpenAI-compatible HTTP API at `http://localhost:11434`. A driver would look nearly identical to `openclaw.js` — POST to `/v1/chat/completions`, no external auth required. Useful for fully offline/private use cases.

### GitHub Copilot CLI / Copilot Chat API
GitHub exposes Copilot via an API for authorized partners. Would enable routing through Copilot's models. Auth via GitHub token. Most useful for teams already paying for Copilot Enterprise.

### Cursor / Continue.dev (VS Code extension backends)
Both expose local HTTP servers when running. Similar HTTP driver pattern to OpenClaw — useful for users who want their lens to share context with an already-open editor session.
