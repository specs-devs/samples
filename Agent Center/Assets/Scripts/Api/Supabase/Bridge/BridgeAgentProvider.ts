import {
  AgentProvider,
  AgentInstance,
  AgentInstanceStatus,
  AgentConversationMessage,
  AgentImage,
  LaunchAgentParams,
} from "../../AgentProvider";
import {
  RealtimeChannel,
  REALTIME_SUBSCRIBE_STATES,
} from "SupabaseClient.lspkg/supabase-snapcloud";
import { SupabaseService } from "../SupabaseService";
import {
  BridgeAgent,
  BridgeConversation,
  BridgeImagePayload,
  BridgeMessage,
  BridgeActivityState,
  PermissionPayload,
  PairBridgeResponse,
  ArtifactsConfigResponse,
} from "./BridgeTypes";

import {
  setTimeout,
  clearTimeout,
} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";

const TAG = "[BridgeAgentProvider]";
const PAIR_FUNCTION_NAME = "pair_bridge";
const UNPAIR_FUNCTION_NAME = "unpair_bridge";
const STORAGE_KEY_AGENT_IDS = "bridge_paired_agent_ids";
const LEGACY_STORAGE_KEY_AGENT_ID = "bridge_paired_agent_id";
const HEARTBEAT_OFFLINE_THRESHOLD_MS = 180_000;
const BROADCAST_RESPONSE_TIMEOUT_MS = 10_000;
const BRIDGE_CHANNEL_RECONNECT_DELAY_MS = 1000;

interface BridgeLivenessCallbacks {
  onSignal: () => void;
  onConnectionStateChanged: (connected: boolean) => void;
  onExplicitOffline: () => void;
}

const ACTIVITY_TO_INSTANCE_STATUS: Record<
  BridgeActivityState,
  AgentInstanceStatus
> = {
  idle: AgentInstanceStatus.Finished,
  thinking: AgentInstanceStatus.Running,
  using_tool: AgentInstanceStatus.Running,
  responding: AgentInstanceStatus.Running,
  awaiting_permission: AgentInstanceStatus.AwaitingAction,
  stop_requested: AgentInstanceStatus.Stopped,
};

export interface PairedAgentEntry {
  id: string;
  agent_type: string;
}

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

function generateRequestId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function generateUUID(): string {
  const hex = "0123456789abcdef";
  const sections = [8, 4, 4, 4, 12];
  return sections
    .map((len) => {
      let s = "";
      for (let i = 0; i < len; i++) {
        s += hex.charAt(Math.floor(Math.random() * 16));
      }
      return s;
    })
    .join("-");
}

export class BridgeAgentProvider implements AgentProvider {
  public readonly providerId = "bridge";

  private supabase: SupabaseService;
  private bridgeChannels = new Map<string, RealtimeChannel>();
  private bridgeLivenessCallbacks = new Map<string, BridgeLivenessCallbacks>();
  private bridgeReconnectTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private conversationCreatedCallbacks = new Map<
    string,
    (conversation: BridgeConversation) => void
  >();
  private agentStatusChannels = new Map<string, RealtimeChannel>();
  private agentDeletionChannels = new Map<string, RealtimeChannel>();

  private messageCallbacks = new Map<
    string,
    (message: BridgeMessage) => void
  >();
  private statusCallbacks = new Map<
    string,
    (conversation: BridgeConversation) => void
  >();
  private agentInsertChannel: RealtimeChannel | null = null;

  private pendingHistoryRequests = new Map<
    string,
    PendingRequest<BridgeMessage[]>
  >();
  private pendingConversationsRequests = new Map<
    string,
    PendingRequest<BridgeConversation[]>
  >();
  private pendingConversationCreated = new Map<
    string,
    PendingRequest<BridgeConversation>
  >();
  private pendingStateRequests = new Map<
    string,
    PendingRequest<BridgeConversation>
  >();
  private pendingMessageAcks = new Map<string, PendingRequest<string>>();
  private pendingWorkspacesRequests = new Map<
    string,
    PendingRequest<{
      workspaces: Array<{
        path: string;
        name: string;
        gitBranch: string | null;
        lastUsed: string | null;
      }>;
      default_workspace: string | null;
    }>
  >();
  private pendingDiscoverRequests = new Map<
    string,
    PendingRequest<Array<{ path: string; name: string }>>
  >();
  private pendingAddWorkspaceRequests = new Map<
    string,
    PendingRequest<{ success: boolean; error?: string; path?: string; name?: string }>
  >();
  private pendingRemoveWorkspaceRequests = new Map<
    string,
    PendingRequest<{ success: boolean; error?: string }>
  >();
  private pendingModelsRequests = new Map<
    string,
    PendingRequest<string[]>
  >();
  private pendingArtifactsConfigRequests = new Map<
    string,
    PendingRequest<ArtifactsConfigResponse>
  >();

  private bufferedMessages = new Map<string, BridgeMessage[]>();
  private bufferedActivityStates = new Map<string, BridgeConversation>();
  private seenMessageIds = new Set<string>();
  private static readonly SEEN_MESSAGE_IDS_MAX = 200;
  private lastSeenSeq = new Map<string, number>();
  private pendingSinceRequests = new Map<
    string,
    PendingRequest<{ messages: BridgeMessage[]; seq: number }>
  >();
  private gapFetchInProgress = new Set<string>();
  private _pairedAgentsCache: PairedAgentEntry[] | null = null;

  constructor(supabase: SupabaseService) {
    this.supabase = supabase;
    this.migrateStorage();
  }

  private migrateStorage(): void {
    const store = global.persistentStorageSystem.store;
    const legacy = store.getString(LEGACY_STORAGE_KEY_AGENT_ID);
    if (legacy.length > 0) {
      const existing = this.getPairedAgents();
      if (!existing.some((e) => e.id === legacy)) {
        existing.push({ id: legacy, agent_type: "bridge" });
        this.savePairedEntries(existing);
      }
      store.putString(LEGACY_STORAGE_KEY_AGENT_ID, "");
      print(
        `${TAG} Migrated legacy bridge_paired_agent_id → bridge_paired_agent_ids`,
      );
    }
  }

  private savePairedEntries(entries: PairedAgentEntry[]): void {
    const store = global.persistentStorageSystem.store;
    store.putString(STORAGE_KEY_AGENT_IDS, JSON.stringify(entries));
    this._pairedAgentsCache = entries;
  }

  private ensureBridgeChannel(agentId: string): RealtimeChannel {
    const existing = this.bridgeChannels.get(agentId);
    if (existing) {
      print(`${TAG} ensureBridgeChannel: reusing existing channel for ${agentId}`);
      return existing;
    }

    print(`${TAG} ensureBridgeChannel: creating new channel for ${agentId}`);
    const withLiveSignal = (
      callback: (payload: Record<string, unknown>) => void,
    ) => {
      return (payload: Record<string, unknown>) => {
        this.notifyBridgeSignal(agentId);
        callback(payload);
      };
    };

    let channelRef: RealtimeChannel | null = null;
    const channel = this.supabase.createBroadcastChannel(
      `bridge:${agentId}`,
      [
        {
          event: "agent_message",
          callback: withLiveSignal((payload: Record<string, unknown>) => {
            this.handleAgentMessage(payload);
            // Ack delivery so bridge can clear its pending-delivery tracking
            const messageId = payload.message_id as string | undefined;
            if (messageId) {
              void this.sendOnBridgeChannel(agentId, "agent_message_ack", {
                message_id: messageId,
              });
            }
          }),
        },
        {
          event: "activity_state",
          callback: withLiveSignal((payload: Record<string, unknown>) => {
            this.handleActivityState(payload);
          }),
        },
        {
          event: "user_message_ack",
          callback: withLiveSignal((payload: Record<string, unknown>) => {
            this.handleUserMessageAck(payload);
          }),
        },
        {
          event: "history_response",
          callback: withLiveSignal((payload: Record<string, unknown>) => {
            this.handleHistoryResponse(payload);
          }),
        },
        {
          event: "conversations_response",
          callback: withLiveSignal((payload: Record<string, unknown>) => {
            this.handleConversationsResponse(payload);
          }),
        },
        {
          event: "conversation_created",
          callback: withLiveSignal((payload: Record<string, unknown>) => {
            this.handleConversationCreated(agentId, payload);
          }),
        },
        {
          event: "state_response",
          callback: withLiveSignal((payload: Record<string, unknown>) => {
            this.handleStateResponse(payload);
          }),
        },
        {
          event: "workspaces_response",
          callback: withLiveSignal((payload: Record<string, unknown>) => {
            this.handleWorkspacesResponse(payload);
          }),
        },
        {
          event: "discover_workspaces_response",
          callback: withLiveSignal((payload: Record<string, unknown>) => {
            this.handleDiscoverWorkspacesResponse(payload);
          }),
        },
        {
          event: "add_workspace_response",
          callback: withLiveSignal((payload: Record<string, unknown>) => {
            this.handleAddWorkspaceResponse(payload);
          }),
        },
        {
          event: "remove_workspace_response",
          callback: withLiveSignal((payload: Record<string, unknown>) => {
            this.handleRemoveWorkspaceResponse(payload);
          }),
        },
        {
          event: "models_response",
          callback: withLiveSignal((payload: Record<string, unknown>) => {
            this.handleModelsResponse(payload);
          }),
        },
        {
          event: "artifact",
          callback: withLiveSignal((payload: Record<string, unknown>) => {
            this.handleArtifact(payload);
          }),
        },
        {
          event: "artifacts_config_response",
          callback: withLiveSignal((payload: Record<string, unknown>) => {
            this.handleArtifactsConfigResponse(payload);
          }),
        },
        {
          event: "since_response",
          callback: withLiveSignal((payload: Record<string, unknown>) => {
            this.handleSinceResponse(payload);
          }),
        },
        {
          event: "bridge_presence",
          callback: withLiveSignal(() => {
            void this.sendOnBridgeChannel(agentId, "client_presence", {});
          }),
        },
        {
          event: "bridge_offline",
          callback: () => {
            this.notifyBridgeExplicitOffline(agentId);
          },
        },
      ],
      {
        onStatusChanged: (status: REALTIME_SUBSCRIBE_STATES) => {
          if (!channelRef || this.bridgeChannels.get(agentId) !== channelRef) {
            return;
          }

          if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            this.clearBridgeReconnect(agentId);
            this.notifyBridgeChannelState(agentId, true);
            return;
          }

          if (
            status === REALTIME_SUBSCRIBE_STATES.CLOSED ||
            status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR
          ) {
            this.notifyBridgeChannelState(agentId, false);
            this.scheduleBridgeReconnect(agentId, channelRef);
          }
        },
      },
    );
    channelRef = channel;

    this.bridgeChannels.set(agentId, channel);
    print(`${TAG} ensureBridgeChannel: channel created and stored for ${agentId}`);
    return channel;
  }

  private notifyBridgeSignal(agentId: string): void {
    const callbacks = this.bridgeLivenessCallbacks.get(agentId);
    if (callbacks) {
      callbacks.onSignal();
    }
  }

  private notifyBridgeChannelState(
    agentId: string,
    connected: boolean,
  ): void {
    const callbacks = this.bridgeLivenessCallbacks.get(agentId);
    if (callbacks) {
      callbacks.onConnectionStateChanged(connected);
    }
  }

  private notifyBridgeExplicitOffline(agentId: string): void {
    const callbacks = this.bridgeLivenessCallbacks.get(agentId);
    if (callbacks) {
      callbacks.onExplicitOffline();
    }
  }

  private clearBridgeReconnect(agentId: string): void {
    const timer = this.bridgeReconnectTimers.get(agentId);
    if (timer) {
      clearTimeout(timer);
    }
    this.bridgeReconnectTimers.delete(agentId);
  }

  private scheduleBridgeReconnect(
    agentId: string,
    expectedChannel?: RealtimeChannel,
  ): void {
    if (
      expectedChannel &&
      this.bridgeChannels.get(agentId) !== expectedChannel
    ) {
      return;
    }

    if (this.bridgeReconnectTimers.has(agentId)) return;

    this.bridgeReconnectTimers.set(
      agentId,
      setTimeout(() => {
        this.bridgeReconnectTimers.delete(agentId);
        if (
          expectedChannel &&
          this.bridgeChannels.get(agentId) !== expectedChannel
        ) {
          return;
        }
        this.refreshBridgeChannel(agentId);
      }, BRIDGE_CHANNEL_RECONNECT_DELAY_MS),
    );
  }

  private refreshBridgeChannel(agentId: string): void {
    const shouldRecreate = this.getPairedAgentIds().includes(agentId);
    this.unsubscribeBridgeChannel(agentId);
    if (shouldRecreate) {
      this.ensureBridgeChannel(agentId);
    }
  }

  private handleAgentMessage(payload: Record<string, unknown>): void {
    const conversationId = payload.conversation_id as string;
    const messageId = payload.message_id as string;
    const content = payload.content as string;

    print(`[DBG BridgeAgentProvider] handleAgentMessage: convId=${conversationId} msgId=${messageId ?? "none"} contentLen=${content?.length ?? 0} images=${(payload.images as unknown[] | undefined)?.length ?? 0} hasCallback=${this.messageCallbacks.has(conversationId)}`);
    if (!conversationId || !content) return;

    // Deduplicate replayed messages by message_id
    if (messageId && this.seenMessageIds.has(messageId)) {
      print(`[DBG BridgeAgentProvider] handleAgentMessage: dedup — skipping already-seen msgId=${messageId}`);
      return;
    }
    if (messageId) {
      this.seenMessageIds.add(messageId);
      if (this.seenMessageIds.size > BridgeAgentProvider.SEEN_MESSAGE_IDS_MAX) {
        const first = this.seenMessageIds.values().next().value;
        if (first !== undefined) this.seenMessageIds.delete(first);
      }
    }

    // Gap detection via sequence numbers
    const incomingSeq = payload.seq as number | undefined;
    if (typeof incomingSeq === "number") {
      const lastSeen = this.lastSeenSeq.get(conversationId) ?? 0;
      if (incomingSeq > lastSeen + 1 && lastSeen > 0) {
        print(`${TAG} Gap detected for ${conversationId}: expected seq ${lastSeen + 1}, got ${incomingSeq}`);
        this.triggerGapFetch(conversationId, lastSeen);
      }
      this.lastSeenSeq.set(conversationId, incomingSeq);
    }

    const rawImages = payload.images as BridgeImagePayload[] | undefined;

    const msg: BridgeMessage = {
      id: messageId ?? generateRequestId(),
      conversation_id: conversationId,
      role: "agent",
      content,
      created_at: new Date().toISOString(),
      images: rawImages,
      seq: incomingSeq,
    };

    const callback = this.messageCallbacks.get(conversationId);
    if (callback) {
      callback(msg);
    } else {
      let buffer = this.bufferedMessages.get(conversationId);
      if (!buffer) {
        buffer = [];
        this.bufferedMessages.set(conversationId, buffer);
      }
      buffer.push(msg);
    }
  }

  private handleArtifact(payload: Record<string, unknown>): void {
    const conversationId = payload.conversation_id as string;
    if (!conversationId) return;

    const rawImages = payload.images as BridgeImagePayload[] | undefined;
    const label = (payload.label as string) ?? null;
    const artifactType = (payload.type as string) ?? "image";

    print(`[DBG BridgeAgentProvider] handleArtifact: convId=${conversationId} type=${artifactType} images=${rawImages?.length ?? 0} hasCallback=${this.messageCallbacks.has(conversationId)}`);
    const content = label ?? `[${artifactType}]`;

    const msg: BridgeMessage = {
      id: generateRequestId(),
      conversation_id: conversationId,
      role: "agent",
      content,
      created_at: new Date().toISOString(),
      images: rawImages,
    };

    const callback = this.messageCallbacks.get(conversationId);
    if (callback) {
      callback(msg);
    } else {
      let buffer = this.bufferedMessages.get(conversationId);
      if (!buffer) {
        buffer = [];
        this.bufferedMessages.set(conversationId, buffer);
      }
      buffer.push(msg);
    }
  }

  private handleArtifactsConfigResponse(
    payload: Record<string, unknown>,
  ): void {
    const requestId = payload.request_id as string;
    if (!requestId) return;

    const pending = this.pendingArtifactsConfigRequests.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingArtifactsConfigRequests.delete(requestId);

    pending.resolve({
      request_id: requestId,
      artifacts_enabled: (payload.artifacts_enabled as boolean) ?? false,
    });
  }

  private triggerGapFetch(conversationId: string, sinceSeq: number): void {
    if (this.gapFetchInProgress.has(conversationId)) return;
    this.gapFetchInProgress.add(conversationId);

    // Find which agent owns this conversation by checking bridge channels
    let agentId: string | null = null;
    for (const id of this.bridgeChannels.keys()) {
      agentId = id;
      break;
    }
    if (!agentId) {
      this.gapFetchInProgress.delete(conversationId);
      return;
    }

    void this.fetchSince(agentId, conversationId, sinceSeq)
      .then((result) => {
        for (const msg of result.messages) {
          // Skip messages we've already seen
          if (msg.id && this.seenMessageIds.has(msg.id)) continue;
          if (msg.id) this.seenMessageIds.add(msg.id);

          const callback = this.messageCallbacks.get(conversationId);
          if (callback && msg.role === "agent") {
            callback(msg);
          }
        }
        if (typeof result.seq === "number") {
          this.lastSeenSeq.set(conversationId, result.seq);
        }
      })
      .catch((err: Error) => {
        print(`${TAG} fetchSince failed for ${conversationId}: ${err.message}`);
      })
      .finally(() => {
        this.gapFetchInProgress.delete(conversationId);
      });
  }

  private async fetchSince(
    agentId: string,
    conversationId: string,
    sinceSeq: number,
  ): Promise<{ messages: BridgeMessage[]; seq: number }> {
    this.ensureBridgeChannel(agentId);
    const requestId = generateRequestId();

    const promise = new Promise<{ messages: BridgeMessage[]; seq: number }>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingSinceRequests.delete(requestId);
          reject(new Error(`${TAG} fetch_since timed out for ${conversationId}`));
        }, BROADCAST_RESPONSE_TIMEOUT_MS);

        this.pendingSinceRequests.set(requestId, { resolve, reject, timer });
      },
    );

    if (
      !(await this.sendOnBridgeChannel(agentId, "fetch_since", {
        conversation_id: conversationId,
        since_seq: sinceSeq,
        request_id: requestId,
      }))
    ) {
      this.cancelPending(this.pendingSinceRequests, requestId);
      throw new Error(`${TAG} fetch_since broadcast failed`);
    }

    return promise;
  }

  private handleSinceResponse(payload: Record<string, unknown>): void {
    const requestId = payload.request_id as string;
    if (!requestId) return;

    const pending = this.pendingSinceRequests.get(requestId);
    if (!pending) return;

    this.pendingSinceRequests.delete(requestId);
    clearTimeout(pending.timer);

    const rawMessages = payload.messages as
      | Array<Record<string, unknown>>
      | undefined;
    const messages: BridgeMessage[] = (rawMessages ?? []).map((m) => ({
      id: (m.id as string) ?? "",
      conversation_id: (m.conversation_id as string) ?? "",
      role: (m.role as "user" | "agent") ?? "agent",
      content: (m.content as string) ?? "",
      created_at: (m.created_at as string) ?? "",
      images: m.images as BridgeImagePayload[] | undefined,
      seq: typeof m.seq === "number" ? (m.seq as number) : undefined,
    }));

    const seq = typeof payload.seq === "number" ? (payload.seq as number) : 0;
    pending.resolve({ messages, seq });
  }

  private handleActivityState(payload: Record<string, unknown>): void {
    const conversationId = payload.conversation_id as string;
    const state = payload.state as BridgeActivityState;

    print(`[DBG BridgeAgentProvider] handleActivityState: convId=${conversationId} state=${state} hasCallback=${this.statusCallbacks.has(conversationId)}`);
    if (!conversationId || !state) return;

    // Gap detection via sequence numbers
    const incomingSeq = payload.seq as number | undefined;
    if (typeof incomingSeq === "number") {
      const lastSeen = this.lastSeenSeq.get(conversationId) ?? 0;
      if (incomingSeq > lastSeen + 1 && lastSeen > 0) {
        print(`${TAG} Gap detected (activity_state) for ${conversationId}: expected seq ${lastSeen + 1}, got ${incomingSeq}`);
        this.triggerGapFetch(conversationId, lastSeen);
      }
      this.lastSeenSeq.set(conversationId, incomingSeq);
    }

    const conv: BridgeConversation = {
      id: conversationId,
      title: "",
      created_at: "",
      activity_state: state,
      permission_payload:
        (payload.permission_payload as BridgeConversation["permission_payload"]) ??
        null,
      workspace: null,
      seq: incomingSeq,
    };

    const callback = this.statusCallbacks.get(conversationId);
    if (callback) {
      callback(conv);
    } else {
      this.bufferedActivityStates.set(conversationId, conv);
    }
  }

  private handleUserMessageAck(payload: Record<string, unknown>): void {
    const requestId = payload.request_id as string;
    if (!requestId) return;

    // Backup path: if conversation_created was lost but user_message_ack
    // arrived, resolve the pending conversation creation from the ack.
    const conversationId = payload.conversation_id as string;
    const pendingCreation = this.pendingConversationCreated.get(requestId);
    if (pendingCreation && conversationId) {
      print(`${TAG} handleUserMessageAck: resolving pendingConversationCreated from ack for ${conversationId}`);
      this.pendingConversationCreated.delete(requestId);
      clearTimeout(pendingCreation.timer);
      pendingCreation.resolve({
        id: conversationId,
        title: "",
        created_at: new Date().toISOString(),
        activity_state: "thinking",
        permission_payload: null,
        workspace: null,
      });
    }

    const pending = this.pendingMessageAcks.get(requestId);
    print(`[DBG BridgeAgentProvider] handleUserMessageAck: requestId=${requestId} hasPending=${!!pending}`);
    if (!pending) return;

    this.pendingMessageAcks.delete(requestId);
    clearTimeout(pending.timer);

    const messageId = (payload.message_id as string) ?? "";
    pending.resolve(messageId);
  }

  private handleHistoryResponse(payload: Record<string, unknown>): void {
    const requestId = payload.request_id as string;
    if (!requestId) return;

    const pending = this.pendingHistoryRequests.get(requestId);
    if (!pending) return;

    this.pendingHistoryRequests.delete(requestId);
    clearTimeout(pending.timer);

    const rawMessages = payload.messages as
      | Array<Record<string, unknown>>
      | undefined;
    const messages: BridgeMessage[] = (rawMessages ?? []).map((m) => ({
      id: (m.id as string) ?? "",
      conversation_id: (m.conversation_id as string) ?? "",
      role: (m.role as "user" | "agent") ?? "agent",
      content: (m.content as string) ?? "",
      created_at: (m.created_at as string) ?? "",
      images: m.images as BridgeImagePayload[] | undefined,
    }));

    print(`[DBG BridgeAgentProvider] handleHistoryResponse: requestId=${requestId} messages=${messages.length}`);
    pending.resolve(messages);
  }

  private handleConversationCreated(
    channelAgentId: string,
    payload: Record<string, unknown>,
  ): void {
    const requestId = payload.request_id as string;
    const conversationId = payload.conversation_id as string;

    const conv: BridgeConversation = {
      id: conversationId ?? "",
      title: (payload.title as string) ?? "New Conversation",
      created_at: (payload.created_at as string) ?? "",
      activity_state: "idle",
      permission_payload: null,
      workspace: (payload.workspace as string | null) ?? null,
    };

    if (requestId) {
      const pending = this.pendingConversationCreated.get(requestId);
      if (pending) {
        this.pendingConversationCreated.delete(requestId);
        clearTimeout(pending.timer);
        pending.resolve(conv);
      }
    }

    const callback = this.conversationCreatedCallbacks.get(channelAgentId);
    if (callback) {
      callback(conv);
    }
  }

  private handleStateResponse(payload: Record<string, unknown>): void {
    const requestId = payload.request_id as string;
    if (!requestId) return;

    const pending = this.pendingStateRequests.get(requestId);
    if (!pending) return;

    this.pendingStateRequests.delete(requestId);
    clearTimeout(pending.timer);

    if (payload.not_found) {
      pending.reject(new Error("conversation_not_found"));
      return;
    }

    const conv: BridgeConversation = {
      id: (payload.conversation_id as string) ?? "",
      title: (payload.title as string) ?? "",
      created_at: (payload.created_at as string) ?? "",
      activity_state:
        (payload.activity_state as BridgeActivityState) ?? "idle",
      permission_payload:
        (payload.permission_payload as PermissionPayload | null) ?? null,
      workspace: (payload.workspace as string | null) ?? null,
    };

    print(`[DBG BridgeAgentProvider] handleStateResponse: requestId=${requestId} convId=${conv.id} state=${conv.activity_state}`);
    pending.resolve(conv);
  }

  private handleConversationsResponse(payload: Record<string, unknown>): void {
    const requestId = payload.request_id as string;
    print(`${TAG} handleConversationsResponse received, requestId=${requestId}, pendingCount=${this.pendingConversationsRequests.size}`);
    if (!requestId) {
      print(`${TAG} handleConversationsResponse: missing request_id in payload`);
      return;
    }

    const pending = this.pendingConversationsRequests.get(requestId);
    if (!pending) {
      print(`${TAG} handleConversationsResponse: no pending request for requestId=${requestId} (already timed out?)`);
      return;
    }

    this.pendingConversationsRequests.delete(requestId);
    clearTimeout(pending.timer);

    const rawConversations = payload.conversations as
      | Array<Record<string, unknown>>
      | undefined;
    const conversations: BridgeConversation[] = (rawConversations ?? []).map(
      (c) => {
        const conv: BridgeConversation = {
          id: (c.id as string) ?? "",
          title: (c.title as string) ?? "New Conversation",
          created_at: (c.created_at as string) ?? "",
          activity_state:
            (c.activity_state as BridgeActivityState) ?? "idle",
          permission_payload:
            (c.permission_payload as PermissionPayload | null) ?? null,
          workspace: (c.workspace as string | null) ?? null,
          seq: typeof c.seq === "number" ? (c.seq as number) : undefined,
        };
        // Store the seq for gap detection
        if (typeof conv.seq === "number") {
          this.lastSeenSeq.set(conv.id, conv.seq);
        }
        return conv;
      },
    );

    print(`${TAG} handleConversationsResponse: resolved with ${conversations.length} conversations`);
    pending.resolve(conversations);
  }

  private handleWorkspacesResponse(payload: Record<string, unknown>): void {
    const requestId = payload.request_id as string;
    if (!requestId) return;

    const pending = this.pendingWorkspacesRequests.get(requestId);
    if (!pending) return;

    this.pendingWorkspacesRequests.delete(requestId);
    clearTimeout(pending.timer);

    const rawWorkspaces = payload.workspaces as unknown;
    let workspaces: Array<{
      path: string;
      name: string;
      gitBranch: string | null;
      lastUsed: string | null;
    }>;

    if (Array.isArray(rawWorkspaces) && rawWorkspaces.length > 0) {
      if (typeof rawWorkspaces[0] === "string") {
        workspaces = (rawWorkspaces as string[]).map((p) => {
          const parts = p.replace(/\\/g, "/").split("/");
          return {
            path: p,
            name: parts[parts.length - 1] || p,
            gitBranch: null,
            lastUsed: null,
          };
        });
      } else {
        workspaces = (
          rawWorkspaces as Array<Record<string, unknown>>
        ).map((w) => ({
          path: (w.path as string) ?? "",
          name: (w.name as string) ?? "",
          gitBranch: (w.gitBranch as string | null) ?? null,
          lastUsed: (w.lastUsed as string | null) ?? null,
        }));
      }
    } else {
      workspaces = [];
    }

    const defaultWorkspace =
      (payload.default_workspace as string | null) ?? null;
    pending.resolve({ workspaces, default_workspace: defaultWorkspace });
  }

  private handleDiscoverWorkspacesResponse(
    payload: Record<string, unknown>,
  ): void {
    const requestId = payload.request_id as string;
    if (!requestId) return;

    const pending = this.pendingDiscoverRequests.get(requestId);
    if (!pending) return;

    this.pendingDiscoverRequests.delete(requestId);
    clearTimeout(pending.timer);

    const rawWorkspaces = payload.workspaces as
      | Array<Record<string, unknown>>
      | undefined;
    const workspaces = (rawWorkspaces ?? []).map((w) => ({
      path: (w.path as string) ?? "",
      name: (w.name as string) ?? "",
    }));
    pending.resolve(workspaces);
  }

  private handleAddWorkspaceResponse(
    payload: Record<string, unknown>,
  ): void {
    const requestId = payload.request_id as string;
    if (!requestId) return;

    const pending = this.pendingAddWorkspaceRequests.get(requestId);
    if (!pending) return;

    this.pendingAddWorkspaceRequests.delete(requestId);
    clearTimeout(pending.timer);

    pending.resolve({
      success: (payload.success as boolean) ?? false,
      error: payload.error as string | undefined,
      path: payload.path as string | undefined,
      name: payload.name as string | undefined,
    });
  }

  private handleRemoveWorkspaceResponse(
    payload: Record<string, unknown>,
  ): void {
    const requestId = payload.request_id as string;
    if (!requestId) return;

    const pending = this.pendingRemoveWorkspaceRequests.get(requestId);
    if (!pending) return;

    this.pendingRemoveWorkspaceRequests.delete(requestId);
    clearTimeout(pending.timer);

    pending.resolve({
      success: (payload.success as boolean) ?? false,
      error: payload.error as string | undefined,
    });
  }

  private handleModelsResponse(payload: Record<string, unknown>): void {
    const requestId = payload.request_id as string;
    if (!requestId) return;

    const pending = this.pendingModelsRequests.get(requestId);
    if (!pending) return;

    this.pendingModelsRequests.delete(requestId);
    clearTimeout(pending.timer);

    const rawModels = payload.models as unknown;
    const models: string[] = Array.isArray(rawModels)
      ? (rawModels as unknown[]).filter(
          (m): m is string => typeof m === "string",
        )
      : [];

    pending.resolve(models);
  }

  private async sendOnBridgeChannel(
    agentId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const channel = this.ensureBridgeChannel(agentId);
    print(`[DBG BridgeAgentProvider] sendOnBridgeChannel → agent=${agentId} event=${event}`);
    const sent = await this.supabase.sendBroadcast(channel, event, payload);
    print(`[DBG BridgeAgentProvider] sendOnBridgeChannel ← agent=${agentId} event=${event} sent=${sent}`);
    if (!sent) {
      this.scheduleBridgeReconnect(agentId, channel);
    }
    return sent;
  }

  private async sendOnBridgeChannelWithRetry(
    agentId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const attempts = 3;
    const delayMs = 500;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const sent = await this.sendOnBridgeChannel(agentId, event, payload);
      if (sent) return true;

      if (attempt < attempts - 1) {
        this.refreshBridgeChannel(agentId);
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return false;
  }

  private cancelPending<T>(
    map: Map<string, PendingRequest<T>>,
    requestId: string,
  ): void {
    const entry = map.get(requestId);
    if (entry) {
      clearTimeout(entry.timer);
      map.delete(requestId);
    }
  }

  drainBufferedMessages(conversationId: string): BridgeMessage[] {
    const messages = this.bufferedMessages.get(conversationId) ?? [];
    this.bufferedMessages.delete(conversationId);
    print(`[DBG BridgeAgentProvider] drainBufferedMessages: convId=${conversationId} count=${messages.length}`);
    return messages;
  }

  drainBufferedActivityState(
    conversationId: string,
  ): BridgeConversation | null {
    const state = this.bufferedActivityStates.get(conversationId) ?? null;
    this.bufferedActivityStates.delete(conversationId);
    print(`[DBG BridgeAgentProvider] drainBufferedActivityState: convId=${conversationId} state=${state?.activity_state ?? "none"}`);
    return state;
  }

  private getFirstPairedAgentId(): string | null {
    const ids = this.getPairedAgentIds();
    return ids.length > 0 ? ids[0] : null;
  }

  async pair(code: string): Promise<PairBridgeResponse> {
    const raw = await this.supabase.invokeFunction<Record<string, unknown>>(
      PAIR_FUNCTION_NAME,
      { pairing_code: code },
    );
    print(`${TAG} pair_bridge completed`);

    const agentId = (raw.agent_id ?? raw.agentId ?? "") as string;
    const paired = agentId.length > 0;

    if (paired) {
      const entries = this.getPairedAgents();
      if (!entries.some((e) => e.id === agentId)) {
        entries.push({ id: agentId, agent_type: "bridge" });
        this.savePairedEntries(entries);
      }
      this.ensureBridgeChannel(agentId);
      print(`${TAG} Paired with agent ${agentId}`);
    }

    const metadata = raw.pairing_metadata as
      | Record<string, unknown>
      | undefined;
    const result: PairBridgeResponse = { agent_id: agentId, paired };
    if (metadata) {
      result.pairing_metadata = metadata;
    }
    return result;
  }

  async unpairAgent(agentId: string): Promise<void> {
    await this.supabase.invokeFunction(UNPAIR_FUNCTION_NAME, {
      agent_id: agentId,
    });
    this.unsubscribeAgent(agentId);
    const entries = this.getPairedAgents().filter((e) => e.id !== agentId);
    this.savePairedEntries(entries);
    print(`${TAG} Unpaired agent ${agentId}`);
  }

  async unpairAll(): Promise<void> {
    await this.supabase.invokeFunction(UNPAIR_FUNCTION_NAME, {});
    this.unsubscribeAll();
    this.savePairedEntries([]);
    print(`${TAG} Unpaired all agents`);
  }

  async notifyAgentRemoved(agentId: string): Promise<void> {
    if (!await this.sendOnBridgeChannel(agentId, "agent_removed", {})) {
      print(`${TAG} agent_removed broadcast failed for ${agentId}`);
      return;
    }
    print(`${TAG} Sent agent_removed to bridge ${agentId}`);
  }

  isPaired(): boolean {
    return this.getPairedAgentIds().length > 0;
  }

  getPairedAgents(): PairedAgentEntry[] {
    if (this._pairedAgentsCache) return this._pairedAgentsCache;

    const store = global.persistentStorageSystem.store;
    const raw = store.getString(STORAGE_KEY_AGENT_IDS);
    if (raw.length === 0) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      if (parsed.length === 0) return [];

      if (typeof parsed[0] === "string") {
        const migrated = (parsed as string[]).map((id) => ({
          id,
          agent_type: "bridge",
        }));
        this.savePairedEntries(migrated);
        return migrated;
      }

      this._pairedAgentsCache = parsed as PairedAgentEntry[];
      return this._pairedAgentsCache;
    } catch {
      // corrupted data
    }
    return [];
  }

  getPairedAgentIds(): string[] {
    return this.getPairedAgents().map((e) => e.id);
  }

  async fetchAgent(agentId: string): Promise<BridgeAgent | null> {
    const rows = await this.supabase.query<BridgeAgent>("bridge_agents", {
      filter: { column: "id", op: "eq", value: agentId },
      limit: 1,
    });
    return rows.length > 0 ? rows[0] : null;
  }

  async fetchPairedAgents(): Promise<BridgeAgent[]> {
    const userId = this.supabase.getUserId();
    if (!userId) return [];

    const rows = await this.supabase.query<BridgeAgent>("bridge_agents", {
      filter: { column: "owner_id", op: "eq", value: userId },
      order: { column: "created_at", ascending: false },
    });

    const entries: PairedAgentEntry[] = rows.map((a) => ({
      id: a.id,
      agent_type: a.agent_type,
    }));
    this.savePairedEntries(entries);

    for (const entry of entries) {
      this.ensureBridgeChannel(entry.id);
    }

    if (rows.length > 0) {
      print(`${TAG} Fetched ${rows.length} paired agents from Supabase`);
    } else {
      print(`${TAG} No paired agents in Supabase — cleared local storage`);
    }

    return rows;
  }

  async getAgentOnlineStatus(
    agentId: string,
  ): Promise<"online" | "offline" | "not_found"> {
    if (!agentId) return "offline";

    const rows = await this.supabase.query<BridgeAgent>("bridge_agents", {
      filter: { column: "id", op: "eq", value: agentId },
      limit: 1,
    });

    if (rows.length === 0) return "not_found";

    const agent = rows[0];
    if (agent.status !== "online") return "offline";
    if (!agent.last_seen_at) return "offline";

    const lastSeen = new Date(agent.last_seen_at).getTime();
    const staleMs = Date.now() - lastSeen;
    if (staleMs > HEARTBEAT_OFFLINE_THRESHOLD_MS) {
      print(
        `${TAG} Agent heartbeat stale by ${Math.round(staleMs / 1000)}s — treating as offline`,
      );
      return "offline";
    }

    return "online";
  }

  async listAgentInstances(
    limit = 20,
    agentId?: string,
  ): Promise<AgentInstance[]> {
    if (!agentId) return [];

    this.ensureBridgeChannel(agentId);
    const requestId = generateRequestId();

    // Register the pending request without a timer — we start the timeout
    // only after the broadcast is actually sent, so channel-subscription time
    // on device doesn't eat into the response window.
    const conversationsPromise = new Promise<BridgeConversation[]>(
      (resolve, reject) => {
        this.pendingConversationsRequests.set(requestId, {
          resolve,
          reject,
          timer: null,
        });
      },
    );

    print(`${TAG} Sending fetch_conversations to agent ${agentId}, requestId=${requestId}`);
    const sent = await this.sendOnBridgeChannel(agentId, "fetch_conversations", {
      request_id: requestId,
    });

    if (!sent) {
      this.cancelPending(this.pendingConversationsRequests, requestId);
      throw new Error(`${TAG} fetch_conversations broadcast failed`);
    }

    print(`${TAG} fetch_conversations broadcast sent, waiting for response (timeout=${BROADCAST_RESPONSE_TIMEOUT_MS}ms)`);

    // Start the response timer now that the broadcast is on the wire.
    const pending = this.pendingConversationsRequests.get(requestId);
    if (pending) {
      pending.timer = setTimeout(() => {
        this.pendingConversationsRequests.delete(requestId);
        print(`${TAG} fetch_conversations timed out — no response from agent ${agentId} within ${BROADCAST_RESPONSE_TIMEOUT_MS}ms`);
        pending.reject(
          new Error(`${TAG} fetch_conversations timed out for ${agentId}`),
        );
      }, BROADCAST_RESPONSE_TIMEOUT_MS);
    }

    const conversations = await conversationsPromise;

    return conversations.slice(0, limit).map((row) => ({
      id: row.id,
      name: row.title,
      status:
        ACTIVITY_TO_INSTANCE_STATUS[row.activity_state] ??
        AgentInstanceStatus.Finished,
      workspace: row.workspace ?? undefined,
      createdAt: row.created_at,
    }));
  }

  async getAgentStatus(
    instanceId: string,
    bridgeAgentId?: string,
  ): Promise<AgentInstance> {
    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (!agentId) {
      throw new Error(`${TAG} No paired agent to query status`);
    }

    this.ensureBridgeChannel(agentId);
    const requestId = generateRequestId();

    const statePromise = new Promise<BridgeConversation>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingStateRequests.delete(requestId);
        reject(
          new Error(`${TAG} fetch_state timed out for ${instanceId}`),
        );
      }, BROADCAST_RESPONSE_TIMEOUT_MS);

      this.pendingStateRequests.set(requestId, { resolve, reject, timer });
    });

    if (!await this.sendOnBridgeChannel(agentId, "fetch_state", {
      conversation_id: instanceId,
      request_id: requestId,
    })) {
      this.cancelPending(this.pendingStateRequests, requestId);
      throw new Error(`${TAG} fetch_state broadcast failed`);
    }

    const conv = await statePromise;
    return {
      id: conv.id,
      name: conv.title,
      status:
        ACTIVITY_TO_INSTANCE_STATUS[conv.activity_state] ??
        AgentInstanceStatus.Finished,
      createdAt: conv.created_at,
    };
  }

  async getConversationState(
    conversationId: string,
    bridgeAgentId?: string,
  ): Promise<BridgeConversation | null> {
    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (!agentId) return null;

    this.ensureBridgeChannel(agentId);
    const requestId = generateRequestId();

    try {
      const statePromise = new Promise<BridgeConversation>(
        (resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingStateRequests.delete(requestId);
            reject(new Error(`${TAG} fetch_state timed out`));
          }, BROADCAST_RESPONSE_TIMEOUT_MS);

          this.pendingStateRequests.set(requestId, {
            resolve,
            reject,
            timer,
          });
        },
      );

      if (!await this.sendOnBridgeChannel(agentId, "fetch_state", {
        conversation_id: conversationId,
        request_id: requestId,
      })) {
        this.cancelPending(this.pendingStateRequests, requestId);
        throw new Error(`${TAG} fetch_state broadcast failed`);
      }

      return await statePromise;
    } catch {
      return null;
    }
  }

  async getConversation(
    instanceId: string,
    bridgeAgentId?: string,
  ): Promise<AgentConversationMessage[]> {
    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (!agentId) return [];

    this.ensureBridgeChannel(agentId);

    const requestId = generateRequestId();

    const messagesPromise = new Promise<BridgeMessage[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingHistoryRequests.delete(requestId);
        reject(new Error(`${TAG} fetch_history timed out for ${instanceId}`));
      }, BROADCAST_RESPONSE_TIMEOUT_MS);

      this.pendingHistoryRequests.set(requestId, { resolve, reject, timer });
    });

    if (!await this.sendOnBridgeChannel(agentId, "fetch_history", {
      conversation_id: instanceId,
      request_id: requestId,
    })) {
      this.cancelPending(this.pendingHistoryRequests, requestId);
      throw new Error(`${TAG} fetch_history broadcast failed`);
    }

    const messages = await messagesPromise;

    return messages.map((row) => ({
      id: row.id,
      type:
        row.role === "user"
          ? ("user_message" as const)
          : ("assistant_message" as const),
      text: row.content,
    }));
  }

  async createConversation(
    firstMessage: string,
    bridgeAgentId?: string,
    workspace?: string,
    images?: AgentImage[],
    model?: string,
  ): Promise<BridgeConversation> {
    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (!agentId) {
      throw new Error(`${TAG} No paired agent to create conversation`);
    }

    this.ensureBridgeChannel(agentId);
    const requestId = generateRequestId();
    const clientConversationId = generateUUID();

    const createdPromise = new Promise<BridgeConversation>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingConversationCreated.delete(requestId);
          reject(
            new Error(`${TAG} conversation creation timed out`),
          );
        }, BROADCAST_RESPONSE_TIMEOUT_MS);

        this.pendingConversationCreated.set(requestId, {
          resolve,
          reject,
          timer,
        });
      },
    );

    const title =
      firstMessage.length > 80
        ? firstMessage.substring(0, 80) + "..."
        : firstMessage;

    const messagePayload: Record<string, unknown> = {
      conversation_id: clientConversationId,
      content: firstMessage,
      user_id: this.supabase.getUserId(),
      title,
      request_id: requestId,
    };

    if (workspace) {
      messagePayload.workspace = workspace;
    }

    if (images && images.length > 0) {
      messagePayload.images = images;
    }

    if (model) {
      messagePayload.model = model;
    }

    print(`[DBG BridgeAgentProvider] createConversation → agent=${agentId} convId=${clientConversationId} requestId=${requestId} contentPreview="${firstMessage.substring(0, 60)}"`);
    if (!await this.sendOnBridgeChannel(agentId, "user_message", messagePayload)) {
      this.cancelPending(this.pendingConversationCreated, requestId);
      throw new Error(`${TAG} user_message broadcast failed`);
    }

    return await createdPromise;
  }

  async sendFollowup(
    instanceId: string,
    prompt: string,
    images?: AgentImage[],
    bridgeAgentId?: string,
    model?: string,
  ): Promise<void> {
    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (!agentId) {
      throw new Error(`${TAG} No paired agent to send followup`);
    }

    const requestId = generateRequestId();

    const ackPromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingMessageAcks.delete(requestId);
        reject(new Error("Bridge did not acknowledge message within timeout"));
      }, BROADCAST_RESPONSE_TIMEOUT_MS);

      this.pendingMessageAcks.set(requestId, { resolve, reject, timer });
    });

    const payload: Record<string, unknown> = {
      conversation_id: instanceId,
      content: prompt,
      user_id: this.supabase.getUserId(),
      request_id: requestId,
    };

    if (images && images.length > 0) {
      payload.images = images;
    }

    if (model) {
      payload.model = model;
    }

    print(`[DBG BridgeAgentProvider] sendFollowup → agent=${agentId} convId=${instanceId} requestId=${requestId} contentPreview="${prompt.substring(0, 60)}"`);
    if (!await this.sendOnBridgeChannel(agentId, "user_message", payload)) {
      this.cancelPending(this.pendingMessageAcks, requestId);
      throw new Error(`${TAG} user_message broadcast failed`);
    }

    await ackPromise;
    print(`${TAG} Sent message to conversation ${instanceId}`);
  }

  subscribeToMessages(
    conversationId: string,
    callback: (message: BridgeMessage) => void,
    bridgeAgentId?: string,
  ): void {
    this.messageCallbacks.set(conversationId, callback);

    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (agentId) {
      this.ensureBridgeChannel(agentId);
    }
  }

  subscribeToConversationStatus(
    conversationId: string,
    callback: (conversation: BridgeConversation) => void,
    bridgeAgentId?: string,
  ): void {
    this.statusCallbacks.set(conversationId, callback);

    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (agentId) {
      this.ensureBridgeChannel(agentId);
    }
  }

  unsubscribeConversation(conversationId: string): void {
    this.messageCallbacks.delete(conversationId);
    this.statusCallbacks.delete(conversationId);
  }

  async respondToPermission(
    conversationId: string,
    decision: "allow" | "allow_session" | "deny",
    bridgeAgentId?: string,
    requestId?: string,
  ): Promise<void> {
    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (!agentId) {
      throw new Error(`${TAG} No paired agent to send permission response`);
    }

    const payload: Record<string, unknown> = { conversation_id: conversationId, decision };
    if (requestId) payload.request_id = requestId;

    if (!await this.sendOnBridgeChannel(agentId, "permission_response", payload)) {
      throw new Error(`${TAG} permission_response broadcast failed`);
    }
    print(`${TAG} Sent permission response: ${decision} for ${conversationId}`);
  }

  async toggleArtifacts(
    agentId: string,
    enabled: boolean,
  ): Promise<ArtifactsConfigResponse> {
    this.ensureBridgeChannel(agentId);
    const requestId = generateRequestId();

    const promise = new Promise<ArtifactsConfigResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingArtifactsConfigRequests.delete(requestId);
        reject(new Error(`${TAG} toggleArtifacts timed out`));
      }, BROADCAST_RESPONSE_TIMEOUT_MS);

      this.pendingArtifactsConfigRequests.set(requestId, {
        resolve,
        reject,
        timer,
      });
    });

    if (!await this.sendOnBridgeChannel(agentId, "toggle_artifacts", {
      enabled,
      request_id: requestId,
    })) {
      this.cancelPending(this.pendingArtifactsConfigRequests, requestId);
      throw new Error(`${TAG} toggle_artifacts broadcast failed`);
    }

    return promise;
  }

  async fetchArtifactsConfig(
    agentId: string,
  ): Promise<ArtifactsConfigResponse> {
    this.ensureBridgeChannel(agentId);
    const requestId = generateRequestId();

    const promise = new Promise<ArtifactsConfigResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingArtifactsConfigRequests.delete(requestId);
        reject(new Error(`${TAG} fetchArtifactsConfig timed out`));
      }, BROADCAST_RESPONSE_TIMEOUT_MS);

      this.pendingArtifactsConfigRequests.set(requestId, {
        resolve,
        reject,
        timer,
      });
    });

    if (!await this.sendOnBridgeChannel(agentId, "fetch_artifacts_config", {
      request_id: requestId,
    })) {
      this.cancelPending(this.pendingArtifactsConfigRequests, requestId);
      throw new Error(`${TAG} fetch_artifacts_config broadcast failed`);
    }

    return promise;
  }

  subscribeToConversations(
    agentId: string,
    callback: (conversation: BridgeConversation) => void,
  ): void {
    this.conversationCreatedCallbacks.set(agentId, callback);
    this.ensureBridgeChannel(agentId);
  }

  subscribeToBridgeLiveness(
    agentId: string,
    callbacks: BridgeLivenessCallbacks,
  ): void {
    this.bridgeLivenessCallbacks.set(agentId, callbacks);
    this.ensureBridgeChannel(agentId);
  }

  subscribeToAgentStatus(
    agentId: string,
    callback: (
      status: "online" | "offline",
      name: string | null,
      lastSeenAt: string | null,
    ) => void,
  ): void {
    this.unsubscribeAgentStatusChannel(agentId);

    const channel = this.supabase.subscribeToUpdates<BridgeAgent>(
      `bridge-agent-status-${agentId}`,
      "bridge_agents",
      `id=eq.${agentId}`,
      (payload) => {
        callback(
          payload.new.status,
          payload.new.name,
          payload.new.last_seen_at,
        );
      },
    );
    this.agentStatusChannels.set(agentId, channel);
  }

  refreshBridgeChannels(): void {
    const agentIds = Array.from(
      new Set([
        ...this.getPairedAgentIds(),
        ...Array.from(this.bridgeChannels.keys()),
        ...Array.from(this.bridgeLivenessCallbacks.keys()),
      ]),
    );

    for (const agentId of agentIds) {
      this.refreshBridgeChannel(agentId);
    }
  }

  subscribeToAgentDeletion(agentId: string, callback: () => void): void {
    this.unsubscribeAgentDeletionChannel(agentId);

    const channel = this.supabase.subscribeToDeletes<BridgeAgent>(
      `bridge-agent-deletion-${agentId}`,
      "bridge_agents",
      `id=eq.${agentId}`,
      () => {
        callback();
      },
    );
    this.agentDeletionChannels.set(agentId, channel);
  }

  subscribeToNewAgents(callback: (agent: BridgeAgent) => void): void {
    this.unsubscribeNewAgents();

    const userId = this.supabase.getUserId();
    if (!userId) return;

    this.agentInsertChannel = this.supabase.subscribeToInserts<BridgeAgent>(
      "bridge-agent-inserts",
      "bridge_agents",
      `owner_id=eq.${userId}`,
      (payload) => {
        const agent = payload.new;
        const entries = this.getPairedAgents();
        if (!entries.some((e) => e.id === agent.id)) {
          entries.push({ id: agent.id, agent_type: agent.agent_type });
          this.savePairedEntries(entries);
          this.ensureBridgeChannel(agent.id);
        }
        callback(agent);
      },
    );
  }

  unsubscribeNewAgents(): void {
    if (this.agentInsertChannel) {
      this.supabase.removeTableChannel(this.agentInsertChannel);
      this.agentInsertChannel = null;
    }
  }

  removePairedId(agentId: string): void {
    const entries = this.getPairedAgents().filter((e) => e.id !== agentId);
    this.savePairedEntries(entries);
  }

  private unsubscribeAgentDeletionChannel(agentId: string): void {
    const channel = this.agentDeletionChannels.get(agentId);
    if (channel) {
      this.supabase.removeTableChannel(channel);
      this.agentDeletionChannels.delete(agentId);
    }
  }

  private unsubscribeAgentStatusChannel(agentId: string): void {
    const channel = this.agentStatusChannels.get(agentId);
    if (channel) {
      this.supabase.removeTableChannel(channel);
      this.agentStatusChannels.delete(agentId);
    }
  }

  private unsubscribeAgentConversations(agentId: string): void {
    this.conversationCreatedCallbacks.delete(agentId);
  }

  private unsubscribeBridgeChannel(agentId: string): void {
    this.clearBridgeReconnect(agentId);
    const channel = this.bridgeChannels.get(agentId);
    if (channel) {
      this.supabase.removeTableChannel(channel);
      this.bridgeChannels.delete(agentId);
    }
  }

  unsubscribeActiveConversation(): void {
    this.messageCallbacks.clear();
    this.statusCallbacks.clear();
  }

  clearBuffersForConversation(conversationId: string): void {
    this.bufferedMessages.delete(conversationId);
    this.bufferedActivityStates.delete(conversationId);
  }

  unsubscribeAgent(agentId: string): void {
    this.unsubscribeAgentConversations(agentId);
    this.unsubscribeAgentStatusChannel(agentId);
    this.unsubscribeAgentDeletionChannel(agentId);
    this.bridgeLivenessCallbacks.delete(agentId);
    this.unsubscribeBridgeChannel(agentId);
    // Clear any buffered data for this agent's conversations
    this.bufferedMessages.clear();
    this.bufferedActivityStates.clear();
  }

  unsubscribeAll(): void {
    this.unsubscribeActiveConversation();
    this.unsubscribeNewAgents();
    this.conversationCreatedCallbacks.clear();
    this.bridgeLivenessCallbacks.clear();
    this.bufferedMessages.clear();
    this.bufferedActivityStates.clear();
    for (const id of Array.from(this.bridgeReconnectTimers.keys())) {
      this.clearBridgeReconnect(id);
    }
    for (const id of Array.from(this.agentStatusChannels.keys())) {
      this.unsubscribeAgentStatusChannel(id);
    }
    for (const id of Array.from(this.agentDeletionChannels.keys())) {
      this.unsubscribeAgentDeletionChannel(id);
    }
    for (const id of Array.from(this.bridgeChannels.keys())) {
      this.unsubscribeBridgeChannel(id);
    }
  }

  async fetchRecentMessages(
    conversationId: string,
    limit: number,
    bridgeAgentId?: string,
  ): Promise<BridgeMessage[]> {
    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (!agentId) return [];

    this.ensureBridgeChannel(agentId);

    const requestId = generateRequestId();

    try {
      const messagesPromise = new Promise<BridgeMessage[]>(
        (resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingHistoryRequests.delete(requestId);
            reject(new Error(`${TAG} fetch_history timed out`));
          }, BROADCAST_RESPONSE_TIMEOUT_MS);

          this.pendingHistoryRequests.set(requestId, {
            resolve,
            reject,
            timer,
          });
        },
      );

      if (!await this.sendOnBridgeChannel(agentId, "fetch_history", {
        conversation_id: conversationId,
        request_id: requestId,
        limit,
      })) {
        this.cancelPending(this.pendingHistoryRequests, requestId);
        throw new Error(`${TAG} fetch_history broadcast failed`);
      }

      return await messagesPromise;
    } catch (err) {
      print(`${TAG} fetchRecentMessages failed: ${err}`);
      return [];
    }
  }

  async launchAgent(_params: LaunchAgentParams): Promise<AgentInstance> {
    throw new Error(
      `${TAG} launchAgent not supported — agent runs on local device`,
    );
  }

  async stopAgent(
    instanceId: string,
    bridgeAgentId?: string,
  ): Promise<void> {
    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (agentId) {
      if (!await this.sendOnBridgeChannelWithRetry(agentId, "stop_request", {
        conversation_id: instanceId,
      })) {
        throw new Error(`${TAG} stop_request broadcast failed after retries`);
      }
    }
    print(`${TAG} Requested stop for conversation ${instanceId}`);
  }

  async deleteAgent(
    instanceId: string,
    bridgeAgentId?: string,
  ): Promise<void> {
    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (agentId) {
      if (!await this.sendOnBridgeChannelWithRetry(
        agentId,
        "delete_conversation",
        { conversation_id: instanceId },
      )) {
        throw new Error(`${TAG} delete_conversation broadcast failed after retries`);
      }
    }
    print(`${TAG} Deleted conversation ${instanceId}`);
  }

  async openInCli(
    conversationId: string,
    bridgeAgentId?: string,
  ): Promise<void> {
    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (!agentId) {
      throw new Error(`${TAG} No paired agent to open in CLI`);
    }

    await this.sendOnBridgeChannel(agentId, "open_in_cli", {
      conversation_id: conversationId,
    });
    print(`${TAG} Sent open_in_cli for conversation ${conversationId}`);
  }

  async listModels(bridgeAgentId?: string): Promise<string[]> {
    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (!agentId) return [];

    this.ensureBridgeChannel(agentId);

    const requestId = generateRequestId();

    try {
      const modelsPromise = new Promise<string[]>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingModelsRequests.delete(requestId);
          reject(
            new Error(
              `${TAG} fetch_models timed out for agent ${agentId}`,
            ),
          );
        }, BROADCAST_RESPONSE_TIMEOUT_MS);

        this.pendingModelsRequests.set(requestId, {
          resolve,
          reject,
          timer,
        });
      });

      if (!await this.sendOnBridgeChannel(agentId, "fetch_models", {
        request_id: requestId,
      })) {
        this.cancelPending(this.pendingModelsRequests, requestId);
        throw new Error(`${TAG} fetch_models broadcast failed`);
      }

      return await modelsPromise;
    } catch (err) {
      print(`${TAG} listModels failed: ${err}`);
      return [];
    }
  }

  async listRepositories(
    bridgeAgentId?: string,
  ): Promise<
    Array<{
      owner: string;
      name: string;
      repository: string;
      gitBranch?: string | null;
      lastUsed?: string | null;
    }>
  > {
    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (!agentId) return [];

    this.ensureBridgeChannel(agentId);

    const requestId = generateRequestId();

    const responsePromise = new Promise<{
      workspaces: Array<{
        path: string;
        name: string;
        gitBranch: string | null;
        lastUsed: string | null;
      }>;
      default_workspace: string | null;
    }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingWorkspacesRequests.delete(requestId);
        reject(
          new Error(
            `${TAG} fetch_workspaces timed out for agent ${agentId}`,
          ),
        );
      }, BROADCAST_RESPONSE_TIMEOUT_MS);

      this.pendingWorkspacesRequests.set(requestId, {
        resolve,
        reject,
        timer,
      });
    });

    if (!await this.sendOnBridgeChannel(agentId, "fetch_workspaces", {
      request_id: requestId,
    })) {
      this.cancelPending(this.pendingWorkspacesRequests, requestId);
      throw new Error(`${TAG} fetch_workspaces broadcast failed`);
    }

    const { workspaces } = await responsePromise;

    return workspaces.map((w) => ({
      owner: "",
      name: w.name,
      repository: w.path,
      gitBranch: w.gitBranch,
      lastUsed: w.lastUsed,
    }));
  }

  async discoverWorkspaces(
    bridgeAgentId?: string,
  ): Promise<Array<{ path: string; name: string }>> {
    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (!agentId) return [];

    this.ensureBridgeChannel(agentId);

    const requestId = generateRequestId();

    const responsePromise = new Promise<
      Array<{ path: string; name: string }>
    >((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingDiscoverRequests.delete(requestId);
        reject(
          new Error(
            `${TAG} discover_workspaces timed out for agent ${agentId}`,
          ),
        );
      }, BROADCAST_RESPONSE_TIMEOUT_MS);

      this.pendingDiscoverRequests.set(requestId, {
        resolve,
        reject,
        timer,
      });
    });

    if (!await this.sendOnBridgeChannel(agentId, "discover_workspaces", {
      request_id: requestId,
    })) {
      this.cancelPending(this.pendingDiscoverRequests, requestId);
      throw new Error(`${TAG} discover_workspaces broadcast failed`);
    }

    return responsePromise;
  }

  async addWorkspace(
    workspacePath: string,
    bridgeAgentId?: string,
  ): Promise<{ success: boolean; error?: string; path?: string; name?: string }> {
    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (!agentId) {
      return { success: false, error: "No paired agent" };
    }

    this.ensureBridgeChannel(agentId);

    const requestId = generateRequestId();

    const responsePromise = new Promise<{
      success: boolean;
      error?: string;
      path?: string;
      name?: string;
    }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAddWorkspaceRequests.delete(requestId);
        reject(
          new Error(
            `${TAG} add_workspace timed out for agent ${agentId}`,
          ),
        );
      }, BROADCAST_RESPONSE_TIMEOUT_MS);

      this.pendingAddWorkspaceRequests.set(requestId, {
        resolve,
        reject,
        timer,
      });
    });

    if (!await this.sendOnBridgeChannel(agentId, "add_workspace", {
      request_id: requestId,
      path: workspacePath,
    })) {
      this.cancelPending(this.pendingAddWorkspaceRequests, requestId);
      return { success: false, error: "broadcast failed" };
    }

    return responsePromise;
  }

  async removeWorkspace(
    workspacePath: string,
    bridgeAgentId?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const agentId = bridgeAgentId ?? this.getFirstPairedAgentId();
    if (!agentId) {
      return { success: false, error: "No paired agent" };
    }

    this.ensureBridgeChannel(agentId);

    const requestId = generateRequestId();

    const responsePromise = new Promise<{
      success: boolean;
      error?: string;
    }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRemoveWorkspaceRequests.delete(requestId);
        reject(
          new Error(
            `${TAG} remove_workspace timed out for agent ${agentId}`,
          ),
        );
      }, BROADCAST_RESPONSE_TIMEOUT_MS);

      this.pendingRemoveWorkspaceRequests.set(requestId, {
        resolve,
        reject,
        timer,
      });
    });

    if (!await this.sendOnBridgeChannel(agentId, "remove_workspace", {
      request_id: requestId,
      path: workspacePath,
    })) {
      this.cancelPending(this.pendingRemoveWorkspaceRequests, requestId);
      return { success: false, error: "broadcast failed" };
    }

    return responsePromise;
  }
}
