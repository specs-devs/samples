export enum AgentStatus {
  Idle = "idle",
  Working = "working",
  Error = "error",
  Offline = "offline",
  Sleeping = "sleeping",
  Deactivated = "deactivated",
  Connecting = "connecting",
  AwaitingAction = "awaiting_action",
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  status: AgentStatus;
  currentTaskId: string | null;
  provider?: string;
}

export interface Task {
  id: string;
  agentId: string;
  prompt: string;
  status: "pending" | "running" | "completed" | "failed";
  result: string | null;
  createdAt: number;
}

export interface ChatTopic {
  id: string;
  agentId: string;
  title: string;
  createdAt: number;
  lastActivityAt: number;
  externalId?: string;
  metadata?: Record<string, string>;
}

export interface ChatMessage {
  id: string;
  externalId?: string;
  agentId: string;
  topicId: string;
  sender: "user" | "agent" | "system";
  content: string;
  timestamp: number;
  images?: Texture[];
}

export type AuthType = "apiKey" | "pairingCode";

export interface RepoEntry {
  name: string;
  path: string;
  gitBranch?: string | null;
  lastUsed?: string | null;
}
