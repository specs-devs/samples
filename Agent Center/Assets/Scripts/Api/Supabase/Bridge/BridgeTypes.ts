export type BridgeActivityState =
  | "idle"
  | "thinking"
  | "using_tool"
  | "responding"
  | "awaiting_permission"
  | "stop_requested";

export interface BridgeAgent {
  [key: string]: unknown;
  id: string;
  owner_id: string;
  status: "online" | "offline";
  last_seen_at: string | null;
  agent_type: string;
  name: string | null;
  created_at: string;
}

export interface PermissionPayload {
  tool: string;
  description: string;
  request_id?: string;
}

export interface BridgeConversation {
  [key: string]: unknown;
  id: string;
  title: string;
  created_at: string;
  activity_state: BridgeActivityState;
  permission_payload: PermissionPayload | null;
  workspace: string | null;
  seq?: number;
}

export interface BridgeImagePayload {
  data: string;
  dimension?: {
    width: number;
    height: number;
  };
}

export interface BridgeMessage {
  [key: string]: unknown;
  id: string;
  conversation_id: string;
  role: "user" | "agent";
  content: string;
  created_at: string;
  images?: BridgeImagePayload[];
  seq?: number;
}

export interface ArtifactPayload {
  conversation_id: string;
  type: "screenshot" | "image";
  label: string | null;
  images: BridgeImagePayload[];
}

export interface ArtifactsConfigResponse {
  request_id: string;
  artifacts_enabled: boolean;
}

export interface PairBridgeResponse {
  agent_id: string;
  paired: boolean;
  pairing_metadata?: Record<string, unknown>;
}
