export interface AgentStatusBroadcast {
  [key: string]: unknown;
  agentId: string;
  externalId: string;
  provider: string;
  status: string;
  summary?: string;
  timestamp: number;
}

export interface AgentLaunchedBroadcast {
  [key: string]: unknown;
  agentId: string;
  externalId: string;
  provider: string;
  name: string;
  prompt: string;
  timestamp: number;
}

export interface BroadcastEnvelope {
  event: string;
  meta?: {
    id: string;
    replayed: boolean;
  };
  payload: Record<string, unknown>;
}

export type BroadcastEvent = "agent_status" | "agent_launched";

export function isAgentStatusBroadcast(
  payload: Record<string, unknown>,
): payload is AgentStatusBroadcast {
  return (
    typeof payload.agentId === "string" &&
    typeof payload.externalId === "string" &&
    typeof payload.provider === "string" &&
    typeof payload.status === "string"
  );
}

export function isAgentLaunchedBroadcast(
  payload: Record<string, unknown>,
): payload is AgentLaunchedBroadcast {
  return (
    typeof payload.agentId === "string" &&
    typeof payload.externalId === "string" &&
    typeof payload.provider === "string" &&
    typeof payload.name === "string"
  );
}
