export enum AgentInstanceStatus {
  Creating = "CREATING",
  Running = "RUNNING",
  AwaitingAction = "AWAITING_ACTION",
  Finished = "FINISHED",
  Stopped = "STOPPED",
  Error = "ERROR",
  Expired = "EXPIRED",
}

export interface AgentInstance {
  id: string;
  name: string;
  status: AgentInstanceStatus;
  summary?: string;
  prUrl?: string;
  branchName?: string;
  url?: string;
  workspace?: string;
  createdAt: string;
}

export interface AgentConversationMessage {
  id: string;
  type: "user_message" | "assistant_message";
  text: string;
}

export interface AgentImage {
  data: string;
  dimension?: {
    width: number;
    height: number;
  };
}

export interface LaunchAgentParams {
  prompt: string;
  images?: AgentImage[];
  repository?: string;
  ref?: string;
  prUrl?: string;
  model?: string;
  autoCreatePr?: boolean;
  branchName?: string;
}

export interface AgentProvider {
  readonly providerId: string;
  launchAgent(params: LaunchAgentParams): Promise<AgentInstance>;
  stopAgent(instanceId: string): Promise<void>;
  deleteAgent(instanceId: string): Promise<void>;
  getAgentStatus(instanceId: string): Promise<AgentInstance>;
  sendFollowup(instanceId: string, prompt: string, images?: AgentImage[]): Promise<void>;
  getConversation(instanceId: string): Promise<AgentConversationMessage[]>;
  listAgentInstances(limit?: number): Promise<AgentInstance[]>;
  listModels(): Promise<string[]>;
  listRepositories(): Promise<
    Array<{ owner: string; name: string; repository: string }>
  >;
}

export class AgentProviderRegistry {
  private providers: Map<string, AgentProvider> = new Map();

  register(provider: AgentProvider): void {
    this.providers.set(provider.providerId, provider);
  }

  getProvider(providerId: string): AgentProvider | undefined {
    return this.providers.get(providerId);
  }

  getAllProviders(): AgentProvider[] {
    return Array.from(this.providers.values());
  }

  getProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }
}
