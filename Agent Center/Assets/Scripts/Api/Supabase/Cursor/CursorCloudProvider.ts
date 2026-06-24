import {
  AgentProvider,
  AgentInstance,
  AgentConversationMessage,
  AgentImage,
  LaunchAgentParams,
} from "../../AgentProvider";
import { SupabaseService } from "../SupabaseService";

const TAG = "[CursorCloudProvider]";
const FUNCTION_NAME = "agent-command";

export class CursorCloudProvider implements AgentProvider {
  public readonly providerId = "cursor_cloud";

  private supabase: SupabaseService;

  constructor(supabase: SupabaseService) {
    this.supabase = supabase;
  }

  async launchAgent(params: LaunchAgentParams): Promise<AgentInstance> {
    const body: Record<string, unknown> = {
      prompt: params.prompt,
      repository: params.repository,
      ref: params.ref,
      prUrl: params.prUrl,
      model: params.model,
      autoCreatePr: params.autoCreatePr,
      branchName: params.branchName,
    };
    if (params.images && params.images.length > 0) {
      body.images = params.images;
    }
    const result = await this.invoke<AgentInstance>("launch", body);
    print(`${TAG} Launched agent ${result.id}: ${result.name}`);
    return result;
  }

  async stopAgent(instanceId: string): Promise<void> {
    await this.invoke("stop", { instanceId });
    print(`${TAG} Stopped agent ${instanceId}`);
  }

  async deleteAgent(instanceId: string): Promise<void> {
    await this.invoke("delete", { instanceId });
    print(`${TAG} Deleted agent ${instanceId}`);
  }

  async getAgentStatus(instanceId: string): Promise<AgentInstance> {
    return this.invoke<AgentInstance>("status", { instanceId });
  }

  async sendFollowup(
    instanceId: string,
    prompt: string,
    images?: AgentImage[],
  ): Promise<void> {
    const params: Record<string, unknown> = { instanceId, prompt };
    if (images && images.length > 0) {
      params.images = images;
    }
    await this.invoke("followup", params);
    print(`${TAG} Sent followup to ${instanceId}`);
  }

  async getConversation(
    instanceId: string,
  ): Promise<AgentConversationMessage[]> {
    return this.invoke<AgentConversationMessage[]>("conversation", {
      instanceId,
    });
  }

  async listAgentInstances(limit = 20): Promise<AgentInstance[]> {
    return this.invoke<AgentInstance[]>("list", { limit });
  }

  async listModels(): Promise<string[]> {
    return this.invoke<string[]>("models", {});
  }

  async listRepositories(): Promise<
    Array<{ owner: string; name: string; repository: string }>
  > {
    return this.invoke<
      Array<{ owner: string; name: string; repository: string }>
    >("repositories", {});
  }

  private async invoke<T>(
    action: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    return this.supabase.invokeFunction<T>(FUNCTION_NAME, {
      provider: this.providerId,
      action,
      params,
    });
  }
}
