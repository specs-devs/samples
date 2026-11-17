# Agent Manager

## What it is
Agent Manager is a sample project that lets you drive AI coding agents running on your Mac from Specs. It pairs a
Lens with a local Node.js daemon (`Bridge/`) through a Snap Cloud (Supabase) backend (`supabase/`), so you can chat
with agents by text or voice, attach photos captured with hand gestures, and see each agent's status as an animated
robot avatar in the world. It is for developers who want a reference for a multi-part, realtime, AI-assisted Lens.

## What it does
1. On launch, a **Credentials needed** panel lists any missing setup (Snap Cloud project, Remote Service Gateway
   token), then the guide is shown.
2. You pair the Lens with the Bridge by entering the 6-digit code the Bridge prints (`node sync.js`).
3. Agents (Claude CLI, Codex CLI, OpenClaw gateway, or Cursor Cloud) appear as robot avatars and as buttons on the
   management panel, which has Agents and Settings tabs.
4. You pick a workspace and model in Settings, then send prompts from the input bar: typed, dictated with on-device
   ASR, or with a paired Bluetooth keyboard. Photos framed with a one- or two-hand gesture can be attached.
5. Messages travel over Supabase Realtime to the Bridge, which runs the agent CLI and streams replies back into a
   chat panel with markdown rendering and per-topic history.
6. When an agent wants to write files or run shell commands, a permission request appears in AR with Allow / Deny,
   and the decision is forwarded through the Bridge's MCP permission server.

## Highlights
- Pluggable agent backends behind one `AgentProvider` interface (Bridge via Supabase broadcast channels, Cursor
  Cloud via an edge function).
- Avatar status (idle, listening, thinking, working, awaiting permission, error, offline) drives robot shader
  animations and UI colouring, with selectable themes.
- Gemini via the Remote Service Gateway powers smart reply suggestions, topic renaming, summaries and plain-English
  permission explanations.
- Bridge liveness is tracked with presence and database heartbeats; on reconnect the Lens delta-syncs missed
  messages.
- `useMockData` on `AgentManagerController` runs the whole UI on bundled mock data, without Supabase or the Bridge.
- Hand-gesture capture (`CaptureGesture/`) crops the camera frame to the region framed by your hands.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/AgentManagerController.ts` | Entry point: wires Supabase, agent providers, UI, input, auth/pairing, polling and mock mode. |
| `Scripts/State/AgentStore.ts` | Central state for agents, topics, messages, tasks, model/workspace selection and themes. |
| `Scripts/UI/UIManager.ts` | Builds and coordinates the world view, input bar, management panel, notifications and hints. |
| `Scripts/Api/Supabase/Bridge/BridgeAgentProvider.ts` | Talks to the local Bridge daemon over Supabase broadcast channels. |
| `Scripts/Api/Supabase/SupabaseService.ts` | Supabase client wrapper for auth, realtime subscriptions and channels. |
| `Scripts/BridgeHeartbeatManager.ts` | Reports online / stale / offline Bridge state per agent. |
| `Scripts/UI/Agent/AgentWorldView.ts` | Places agent avatars (docked or free), their chat panels and selection. |
| `Scripts/Input/VoiceInputController.ts` | ASR voice-to-text input. |
| `Scripts/CaptureGesture/Scripts/Controllers/CaptureController.ts` | One- and two-hand image capture with live crop preview. |
| `Scripts/Services/PromptSuggestionService.ts` | Generates smart reply suggestions from the conversation. |

## Extra info
- **Requires:** HandHints3D, Icons, InteractionKit, Motion, RemoteServiceGateway, SnapDecorators, SupabaseClient,
  UIKit, Utilities. Specs only. Needs a Snap Cloud project (set on the `SnapCloudRequirements` object), a Google
  token on `RemoteServiceGatewayCredentials`, the Bridge running on a Mac with Node.js and at least one agent CLI,
  and Git LFS to clone. Voice input needs Experimental APIs enabled and Extended Permissions on the device, since the
  Lens uses camera and internet. Bluetooth keyboards are paired in the Specs Settings Lens, not in the Lens.
- **Get started:** run `supabase/setup.sh`, start the Bridge with `node sync.js`, open `AgentManager.esproj`
  (`Assets/Scene.scene`), assign your Supabase project, then push to Specs and pair. Set `useMockData` to explore
  the UI in Lens Studio without a backend.
- **More docs:** [../README.md](../README.md) for the full setup walkthrough; `Bridge/README.md` and
  `supabase/README.md` for the backend parts.
