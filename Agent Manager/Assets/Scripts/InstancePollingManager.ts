import { ChatTopic } from "./Types";
import { AgentStore } from "./State/AgentStore";
import {
  AgentInstance,
  AgentInstanceStatus,
  AgentProviderRegistry,
} from "./Api/AgentProvider";
import {
  setTimeout,
} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";

const TAG = "[InstancePolling]";

function isTerminalStatus(status: string): boolean {
  return (
    status === AgentInstanceStatus.Finished ||
    status === AgentInstanceStatus.Stopped
  );
}

function buildInstanceMetadata(
  instance: AgentInstance,
): Record<string, string> {
  const meta: Record<string, string> = { status: instance.status };
  if (instance.summary) meta.summary = instance.summary;
  if (instance.prUrl) meta.prUrl = instance.prUrl;
  if (instance.branchName) meta.branchName = instance.branchName;
  return meta;
}

export interface PollingCallbacks {
  fetchConversation(
    agentId: string,
    externalId: string,
    providerId: string,
    skipIfFetched?: boolean,
  ): void;
  createTopicFromInstance(
    agentId: string,
    instance: AgentInstance,
  ): ChatTopic | null;
  updateAgentStatusFromTopics(agentId: string): void;
  onFetchedConversationDelete(externalId: string): void;
}

/**
 * Manages two polling loops for cloud provider (non-bridge) agents:
 * - Active polling: checks status of running/creating instances frequently.
 * - Discovery polling: scans for new instances with exponential back-off when idle.
 */
export class InstancePollingManager {
  private readonly POLL_ACTIVE_INTERVAL_MS = 3000;
  private readonly POLL_IDLE_INTERVAL_MS = 15000;
  private readonly DISCOVERY_POLL_INTERVAL_MS = 10000;
  private readonly DISCOVERY_MAX_INTERVAL_MS = 60000;

  private polling = false;
  private discoveryPolling = false;
  private discoveryCurrentInterval = 10000;
  private consecutiveEmptyPolls = 0;

  constructor(
    private readonly store: AgentStore,
    private readonly providerRegistry: AgentProviderRegistry,
    private readonly callbacks: PollingCallbacks,
    private readonly isDestroyed: () => boolean,
  ) {}

  startPollingActiveInstances(): void {
    if (this.polling) return;
    this.polling = true;
    setTimeout(() => this.pollActiveInstances(), this.POLL_ACTIVE_INTERVAL_MS);
  }

  private async pollActiveInstances(): Promise<void> {
    if (this.isDestroyed()) {
      this.polling = false;
      return;
    }
    let hasActive = false;

    for (const provider of this.providerRegistry.getAllProviders()) {
      if (provider.providerId === "bridge") continue;

      const agentId = `${provider.providerId}-agent`;
      const topics = this.store.getTopicsForAgent(agentId);

      const activeTopics = topics.filter((topic) => {
        const status = topic.metadata?.status;
        return (
          (status === AgentInstanceStatus.Creating ||
            status === AgentInstanceStatus.Running) &&
          topic.externalId
        );
      });

      if (activeTopics.length > 0) {
        hasActive = true;
        const results = await Promise.all(
          activeTopics.map(async (topic) => {
            try {
              return {
                topic,
                instance: await provider.getAgentStatus(topic.externalId!),
              };
            } catch (e) {
              print(`${TAG} Poll failed for ${topic.externalId}: ${e}`);
              return null;
            }
          }),
        );

        for (const result of results) {
          if (!result) continue;
          this.store.updateTopicMetadata(
            result.topic.id,
            buildInstanceMetadata(result.instance),
          );
          if (isTerminalStatus(result.instance.status)) {
            this.callbacks.fetchConversation(
              agentId,
              result.topic.externalId!,
              provider.providerId,
            );
          }
        }
      }

      this.callbacks.updateAgentStatusFromTopics(agentId);
    }

    if (this.isDestroyed()) {
      this.polling = false;
      return;
    }

    if (hasActive) {
      setTimeout(
        () => this.pollActiveInstances(),
        this.POLL_ACTIVE_INTERVAL_MS,
      );
    } else {
      setTimeout(() => this.pollActiveInstances(), this.POLL_IDLE_INTERVAL_MS);
    }
  }

  startPollingDiscovery(): void {
    if (this.discoveryPolling) return;
    this.discoveryPolling = true;
    setTimeout(
      () => this.pollForNewInstances(),
      this.DISCOVERY_POLL_INTERVAL_MS,
    );
  }

  private async pollForNewInstances(): Promise<void> {
    if (this.isDestroyed()) {
      this.discoveryPolling = false;
      return;
    }
    for (const provider of this.providerRegistry.getAllProviders()) {
      if (provider.providerId === "bridge") continue;

      const agentId = `${provider.providerId}-agent`;
      if (!this.store.getAgent(agentId)) continue;

      try {
        const instances = await provider.listAgentInstances(50);
        let changed = false;

        for (const instance of instances) {
          const existing = this.store.getTopicByExternalId(instance.id);

          if (!existing) {
            const topic = this.callbacks.createTopicFromInstance(
              agentId,
              instance,
            );
            if (!topic) continue;

            changed = true;
            if (isTerminalStatus(instance.status)) {
              this.callbacks.fetchConversation(
                agentId,
                instance.id,
                provider.providerId,
                true,
              );
            }
            continue;
          }

          const storedStatus = existing.metadata?.status;
          if (storedStatus === instance.status) continue;

          changed = true;
          this.store.updateTopicMetadata(
            existing.id,
            buildInstanceMetadata(instance),
          );

          if (isTerminalStatus(instance.status)) {
            this.callbacks.onFetchedConversationDelete(instance.id);
            this.callbacks.fetchConversation(
              agentId,
              instance.id,
              provider.providerId,
              true,
            );
          } else if (
            instance.status === AgentInstanceStatus.Creating ||
            instance.status === AgentInstanceStatus.Running
          ) {
            this.callbacks.onFetchedConversationDelete(instance.id);
            this.startPollingActiveInstances();
          }
        }

        if (changed) {
          this.callbacks.updateAgentStatusFromTopics(agentId);
          this.consecutiveEmptyPolls = 0;
          this.discoveryCurrentInterval = this.DISCOVERY_POLL_INTERVAL_MS;
          print(
            `${TAG} Discovery: instance changes detected for ${provider.providerId}`,
          );
        } else {
          this.consecutiveEmptyPolls++;
          this.discoveryCurrentInterval = this.DISCOVERY_POLL_INTERVAL_MS;
        }
      } catch (e) {
        print(`${TAG} Discovery poll failed for ${provider.providerId}: ${e}`);
      }
    }

    if (this.isDestroyed()) {
      this.discoveryPolling = false;
      return;
    }

    setTimeout(() => this.pollForNewInstances(), this.discoveryCurrentInterval);
  }

  destroy(): void {
    this.polling = false;
    this.discoveryPolling = false;
  }
}
