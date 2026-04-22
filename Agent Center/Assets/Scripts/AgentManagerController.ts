import { Agent, AgentStatus, ChatTopic } from "./Types";
import { AgentStore } from "./State/AgentStore";
import { VoiceInputController } from "./Input/VoiceInputController";
import { UIManager } from "./UI/UIManager";
import { seedMockData, getMockAgents } from "./MockAgentData";
import { SupabaseService } from "./Api/Supabase/SupabaseService";
import {
  AgentProvider,
  AgentProviderRegistry,
  AgentImage,
  AgentInstance,
  AgentInstanceStatus,
  AgentConversationMessage,
} from "./Api/AgentProvider";
import {
  encodeTextureAsImage,
  decodeBase64ToTexture,
} from "./Utils/TextureEncoding";
import { createAudioComponent } from "./UI/Shared/UIBuilders";
import {
  BridgeHeartbeatManager,
  BridgeConnectionState,
} from "./BridgeHeartbeatManager";
import { InstancePollingManager } from "./InstancePollingManager";
import { CursorCloudProvider } from "./Api/Supabase/Cursor/CursorCloudProvider";
import { BridgeAgentProvider } from "./Api/Supabase/Bridge/BridgeAgentProvider";
import {
  BridgeActivityState,
  BridgeConversation,
  BridgeImagePayload,
  BridgeMessage,
  PermissionPayload,
} from "./Api/Supabase/Bridge/BridgeTypes";
import { stripMarkdown } from "./Utils/MarkdownUtils";
import { SCREEN_SHARING_FEATURE_INDEX } from "./UI/Chat/ChatSettingsPanel";
import { PromptSuggestionService } from "./Services/PromptSuggestionService";
import { TopicRenamingService } from "./Services/TopicRenamingService";
import {
  AgentStatusBroadcast,
  AgentLaunchedBroadcast,
  BroadcastEnvelope,
  isAgentStatusBroadcast,
  isAgentLaunchedBroadcast,
} from "./Api/Supabase/SupabaseTypes";
import { setTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import { SnapCloudRequirements } from "./SnapCloudRequirements";

const EXPLOSION_PREFAB: ObjectPrefab = requireAsset(
  "../Prefabs/ExplosionShaderController.prefab",
) as ObjectPrefab;

const ROBOT_SPAWN_SFX: AudioTrackAsset = requireAsset(
  "../Audio/robotSpawn.wav",
) as AudioTrackAsset;

const BRIDGE_CONNECTED_SFX: AudioTrackAsset = requireAsset(
  "../Audio/bridgeConnected.wav",
) as AudioTrackAsset;

const BRIDGE_DISCONNECTED_SFX: AudioTrackAsset = requireAsset(
  "../Audio/bridgeDisconnected.wav",
) as AudioTrackAsset;

const BRIDGE_SFX_DEBOUNCE_MS = 5000;
const MAX_CACHED_CONVERSATIONS = 6;

const TAG = "[AgentManager]";

export const PROVIDER_IDS = {
  CURSOR_CLOUD: "cursor_cloud",
  BRIDGE: "bridge",
} as const;

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  [PROVIDER_IDS.CURSOR_CLOUD]: "Cursor Cloud",
  [PROVIDER_IDS.BRIDGE]: "Local Agent",
};

const BRIDGE_ACTIVITY_TO_METADATA: Record<BridgeActivityState, string> = {
  idle: AgentInstanceStatus.Finished,
  thinking: AgentInstanceStatus.Running,
  using_tool: AgentInstanceStatus.Running,
  responding: AgentInstanceStatus.Running,
  awaiting_permission: AgentInstanceStatus.AwaitingAction,
  stop_requested: AgentInstanceStatus.Stopped,
};

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

const INSTANCE_STATUS_TO_AGENT_STATUS: Record<
  AgentInstanceStatus,
  AgentStatus
> = {
  [AgentInstanceStatus.Creating]: AgentStatus.Working,
  [AgentInstanceStatus.Running]: AgentStatus.Working,
  [AgentInstanceStatus.AwaitingAction]: AgentStatus.AwaitingAction,
  [AgentInstanceStatus.Finished]: AgentStatus.Idle,
  [AgentInstanceStatus.Stopped]: AgentStatus.Offline,
  [AgentInstanceStatus.Error]: AgentStatus.Error,
  [AgentInstanceStatus.Expired]: AgentStatus.Offline,
};

@component
export class AgentManagerController extends BaseScriptComponent {
  private asrModule: AsrModule = require("LensStudio:AsrModule");

  @input
  @hint("Use mock agents instead of connecting to a real server")
  private useMockData: boolean = true;

  @input
  @hint("Enable debug logging to the console")
  private debugLogs: boolean = false;

  @input
  @hint("SnapCloudRequirements component holding the Supabase project")
  @allowUndefined
  private snapCloudRequirements: SnapCloudRequirements;

  private store: AgentStore;
  private uiManager: UIManager;

  private supabaseService: SupabaseService;
  private providerRegistry: AgentProviderRegistry;
  private bridgeProvider: BridgeAgentProvider;

  private pollingManager: InstancePollingManager;
  private hydratedConversations = new Set<string>();
  private conversationLoadPromises = new Map<string, Promise<void>>();
  private conversationHistoryLru: string[] = [];
  private bridgeConnectionMap = new Map<string, BridgeConnectionState>();
  private heartbeatManager: BridgeHeartbeatManager;
  private bridgeMessageQueue: Promise<void> = Promise.resolve();
  private activeConversationByAgent = new Map<string, string>();
  private destroyed = false;
  private isInitialSetupComplete = false;
  private conversationsLoadInProgress = new Set<string>();
  private bridgeConversationsLoadFailed = new Set<string>();
  private suggestionGeneration = 0;
  private audioComponent: AudioComponent;
  private lastBridgeSfxTime = 0;
  private lastPermissionTool: Map<string, string> = new Map();
  private lastPermissionRequestId: Map<string, string> = new Map();

  private log(msg: string): void {
    if (this.debugLogs) print(msg);
  }

  onDestroy(): void {
    this.destroyed = true;
    if (this.pollingManager) this.pollingManager.destroy();
    if (this.bridgeProvider) this.bridgeProvider.unsubscribeAll();
    this.hydratedConversations.clear();
    this.conversationLoadPromises.clear();
    this.conversationHistoryLru = [];
    this.bridgeConnectionMap.clear();
    if (this.heartbeatManager) this.heartbeatManager.destroy();
    this.lastPermissionTool.clear();
    this.lastPermissionRequestId.clear();
  }

  onAwake(): void {
    if (!this.snapCloudRequirements) {
      print(`${TAG} SnapCloudRequirements not assigned — Supabase will not initialize`);
    }

    this.store = new AgentStore();
    new VoiceInputController(this.asrModule);

    this.supabaseService = new SupabaseService();
    this.providerRegistry = new AgentProviderRegistry();

    this.providerRegistry.register(
      new CursorCloudProvider(this.supabaseService),
    );

    this.bridgeProvider = new BridgeAgentProvider(this.supabaseService);
    this.providerRegistry.register(this.bridgeProvider);

    this.heartbeatManager = new BridgeHeartbeatManager(
      this.bridgeConnectionMap,
      (agentId, state, previousState) => {
        this.applyBridgeConnectionState(
          agentId,
          this.bridgeAgentUuid(agentId),
          state,
          previousState,
        );
      },
      () => this.destroyed,
      () => !this.supabaseService.isConnected,
    );

    this.pollingManager = new InstancePollingManager(
      this.store,
      this.providerRegistry,
      {
        fetchConversation: (agentId, externalId, providerId, skipIfFetched) =>
          this.fetchConversation(
            agentId,
            externalId,
            providerId,
            skipIfFetched,
          ),
        createTopicFromInstance: (agentId, instance) =>
          this.createTopicFromInstance(agentId, instance),
        updateAgentStatusFromTopics: (agentId) =>
          this.updateAgentStatusFromTopics(agentId),
        onFetchedConversationDelete: (externalId) =>
          this.invalidateConversationHistory(externalId, false),
      },
      () => this.destroyed,
    );

    this.uiManager = new UIManager(
      this.store,
      this.getSceneObject(),
      EXPLOSION_PREFAB,
    );

    this.audioComponent = createAudioComponent(this.getSceneObject());

    this.wireInputBar();
    this.wireStopRequest();
    this.wireDisconnect();
    this.wireDelete();
    this.wireClearConversations();
    this.wirePermissionResponse();
    this.wireVoiceNoteGesture();
    this.wireSmartFeatures();

    this.wireDeleteAllData();

    if (!this.useMockData) {
      this.wireSupabaseBroadcasts();
      this.wireAuthPanel();
      this.wireProviderDisconnect();
      this.wireBridgeTopicSwitch();
      this.wireWorkspaceDiscovery();
      this.wireOpenInCli();
    }

    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private async onStart(): Promise<void> {
    if (this.useMockData) {
      seedMockData(this.store);
      this.log(`${TAG} Loaded ${getMockAgents().length} mock agents`);
      return;
    }

    this.setupProviderAgents();
    this.uiManager.showPanel();

    await this.initSupabase();

    const autoConnected = await this.tryAutoConnect();
    this.isInitialSetupComplete = true;
    this.uiManager.notifyInitialLoadComplete();

    // If a bridge reconnection fired while tryAutoConnect was in-flight (and was
    // skipped by the isInitialSetupComplete guard), handle it now so any missed
    // fetch_conversations gets re-issued on the stable channel.
    await this.handleBridgeReconnection();

    if (autoConnected) {
      this.loadProviderOptions();
      this.startPollingDiscovery();
    }

    this.removeStaleConnectingAgents();

    // Fire-and-forget: retry any pending remote deletions from previous sessions
    void this.retryPendingDeletions();
  }

  private setupProviderAgents(): void {
    const skipAutoAdd = new Set(["bridge", PROVIDER_IDS.CURSOR_CLOUD]);

    for (const provider of this.providerRegistry.getAllProviders()) {
      if (skipAutoAdd.has(provider.providerId)) continue;

      const agentId = `${provider.providerId}-agent`;
      this.store.addAgent({
        id: agentId,
        name:
          PROVIDER_DISPLAY_NAMES[provider.providerId] ?? provider.providerId,
        description: "Cloud-based coding agents",
        status: AgentStatus.Connecting,
        currentTaskId: null,
        provider: provider.providerId,
      });
    }

    for (const entry of this.bridgeProvider.getPairedAgents()) {
      if (entry.agent_type === "cursor_cloud") {
        const agentId = `${PROVIDER_IDS.CURSOR_CLOUD}-agent`;
        if (!this.store.getAgent(agentId)) {
          this.store.addAgent({
            id: agentId,
            name: PROVIDER_DISPLAY_NAMES[PROVIDER_IDS.CURSOR_CLOUD],
            description: "Cloud-based coding agents",
            status: AgentStatus.Connecting,
            currentTaskId: null,
            provider: PROVIDER_IDS.CURSOR_CLOUD,
          });
        }
      } else {
        const agentId = `bridge-agent-${entry.id}`;
        this.store.setConversationsLoading(agentId, true);
        this.store.addAgent({
          id: agentId,
          name: PROVIDER_DISPLAY_NAMES.bridge,
          description: "Local AI agent",
          status: AgentStatus.Connecting,
          currentTaskId: null,
          provider: "bridge",
        });
      }
    }
  }

  private bridgeAgentUuid(agentId: string): string {
    return agentId.replace(/^bridge-agent-/, "");
  }

  private touchConversationHistory(externalId: string): void {
    const existingIndex = this.conversationHistoryLru.indexOf(externalId);
    if (existingIndex !== -1) {
      this.conversationHistoryLru.splice(existingIndex, 1);
    }
    this.conversationHistoryLru.push(externalId);
  }

  private rememberConversationHistory(externalId: string): void {
    this.hydratedConversations.add(externalId);
    this.touchConversationHistory(externalId);
    this.pruneConversationHistoryCache();
  }

  private invalidateConversationHistory(
    externalId: string,
    clearMessages: boolean,
  ): void {
    this.hydratedConversations.delete(externalId);
    const index = this.conversationHistoryLru.indexOf(externalId);
    if (index !== -1) {
      this.conversationHistoryLru.splice(index, 1);
    }
    if (clearMessages) {
      const topic = this.store.getTopicByExternalId(externalId);
      if (topic) {
        this.store.clearMessagesForTopic(topic.id);
      }
    }
  }

  private getProtectedConversationIds(): Set<string> {
    const protectedIds = new Set<string>();

    for (const agent of this.store.getAgents()) {
      const activeTopic = this.store.getActiveTopic(agent.id);
      if (activeTopic?.externalId) {
        protectedIds.add(activeTopic.externalId);
      }
    }

    for (const externalId of this.conversationLoadPromises.keys()) {
      protectedIds.add(externalId);
    }

    return protectedIds;
  }

  private pruneConversationHistoryCache(): void {
    if (this.conversationHistoryLru.length <= MAX_CACHED_CONVERSATIONS) {
      return;
    }

    const protectedIds = this.getProtectedConversationIds();
    let index = 0;

    while (this.conversationHistoryLru.length > MAX_CACHED_CONVERSATIONS) {
      if (index >= this.conversationHistoryLru.length) {
        break;
      }

      const externalId = this.conversationHistoryLru[index];
      if (protectedIds.has(externalId)) {
        index++;
        continue;
      }

      const topic = this.store.getTopicByExternalId(externalId);
      if (topic) {
        this.store.clearMessagesForTopic(topic.id);
      }
      this.hydratedConversations.delete(externalId);
      this.conversationHistoryLru.splice(index, 1);
    }
  }

  private async ensureTopicConversationLoaded(
    agentId: string,
    topicId: string,
    forceRefresh: boolean = false,
  ): Promise<void> {
    const topic = this.store.getTopicById(topicId);
    if (!topic || topic.agentId !== agentId || !topic.externalId) return;

    const agent = this.store.getAgent(agentId);
    if (!agent?.provider) return;

    const externalId = topic.externalId;
    if (!forceRefresh && this.hydratedConversations.has(externalId)) {
      this.touchConversationHistory(externalId);
      return;
    }

    const pending = this.conversationLoadPromises.get(externalId);
    if (pending && !forceRefresh) {
      await pending;
      return;
    }

    const loadPromise = this.fetchConversation(
      agentId,
      externalId,
      agent.provider,
      forceRefresh,
    ).finally(() => {
      if (this.conversationLoadPromises.get(externalId) === loadPromise) {
        this.conversationLoadPromises.delete(externalId);
      }
    });

    this.conversationLoadPromises.set(externalId, loadPromise);
    await loadPromise;
  }

  private async activateTopicHistory(
    agentId: string,
    topicId: string,
  ): Promise<void> {
    const agent = this.store.getAgent(agentId);
    const topic = this.store.getTopicById(topicId);
    if (
      !agent?.provider ||
      !topic ||
      topic.agentId !== agentId ||
      !topic.externalId
    ) {
      return;
    }

    if (agent.provider === "bridge") {
      this.uiManager.agentWorldView.hidePermissionRequest();
      try {
        await this.ensureTopicConversationLoaded(agentId, topicId);
      } catch (e) {
        this.log(
          `${TAG} Failed to hydrate bridge topic ${topic.externalId}: ${e}`,
        );
      }
      this.subscribeBridgeRealtime(topic.externalId, agentId);
      await this.recoverTopicPermissionState(agentId, topic.externalId);
      this.refreshSelectedTopicIfActive(agentId, topicId);
      return;
    }

    try {
      await this.ensureTopicConversationLoaded(agentId, topicId);
    } catch (e) {
      this.log(`${TAG} Failed to hydrate topic ${topic.externalId}: ${e}`);
    }
    this.refreshSelectedTopicIfActive(agentId, topicId);
  }

  private refreshSelectedTopicIfActive(agentId: string, topicId: string): void {
    if (this.store.getSelectedAgentId() !== agentId) return;
    if (this.store.getActiveTopicId(agentId) !== topicId) return;
    this.uiManager.agentWorldView.refreshSelectedThread(agentId, topicId);
  }

  private removeStaleConnectingAgents(): void {
    for (const provider of this.providerRegistry.getAllProviders()) {
      if (provider.providerId === "bridge") continue;
      const agentId = `${provider.providerId}-agent`;
      const agent = this.store.getAgent(agentId);
      if (agent && agent.status === AgentStatus.Connecting) {
        this.store.removeAgent(agentId);
      }
    }
    for (const agent of this.store.getAgents()) {
      if (
        agent.provider === "bridge" &&
        agent.status === AgentStatus.Connecting
      ) {
        this.store.removeAgent(agent.id);
      }
    }
  }

  private wireAuthPanel(): void {
    this.uiManager.agentManagerPanel.onAuthenticated.add(
      async ({ provider, apiKey }) => {
        await this.authenticate(provider, apiKey);
      },
    );
  }

  private async authenticate(provider: string, apiKey: string): Promise<void> {
    if (provider === "bridge") {
      await this.authenticateBridge(apiKey);
      return;
    }

    try {
      await this.supabaseService.invokeFunction("key-store", {
        name: provider,
        api_key: apiKey,
      });
      this.log(`${TAG} API key stored for ${provider}`);
      this.uiManager.setStatus("Authenticated!");
      this.uiManager.notifyProviderConnected(provider, true);

      const providerImpl = this.providerRegistry.getProvider(provider);
      if (providerImpl) {
        this.registerProviderAgent(providerImpl);
      }
      const agentId = `${provider}-agent`;
      this.uiManager.clearAgentError(agentId);
      this.uiManager.switchToAgentsTab();
      await this.loadExistingInstances();
      this.loadProviderOptions();
    } catch (e) {
      this.log(`${TAG} Failed to store API key for ${provider}: ${e}`);
      this.uiManager.setStatus(`Authentication failed: ${e}`, true);
    }
  }

  private async authenticateBridge(pairingCode: string): Promise<void> {
    try {
      const result = await this.bridgeProvider.pair(pairingCode);
      if (!result.paired) {
        this.uiManager.setStatus("Invalid pairing code", true);
        return;
      }

      const bridgeUuid = result.agent_id;
      const agentId = `bridge-agent-${bridgeUuid}`;
      this.log(`${TAG} Paired with bridge agent ${bridgeUuid}`);
      this.uiManager.setStatus("Paired successfully!");

      const pairedAgent = await this.bridgeProvider.fetchAgent(bridgeUuid);
      const apiKey = result.pairing_metadata?.api_key as string | undefined;
      if (apiKey) {
        await this.storeCursorApiKey(apiKey, pairedAgent?.name ?? undefined);
        this.uiManager.clearAgentError(`${PROVIDER_IDS.CURSOR_CLOUD}-agent`);
        this.uiManager.switchToAgentsTab();
        return;
      }

      this.store.setConversationsLoading(agentId, true);
      this.registerBridgeAgent(
        bridgeUuid,
        pairedAgent?.name ?? undefined,
        pairedAgent?.status,
        pairedAgent?.last_seen_at,
      );
      this.uiManager.clearAgentError(agentId);
      this.uiManager.switchToAgentsTab();

      this.startPollingBridgeStatus(agentId, bridgeUuid);
      this.subscribeBridgeConversations(agentId, bridgeUuid);
      void this.loadBridgeConversations(agentId, bridgeUuid).then(() => {
        void this.recoverBridgeActiveTopic(agentId);
      });
      this.loadBridgeWorkspaces();
    } catch (e) {
      this.log(`${TAG} Bridge pairing failed: ${e}`);
      this.uiManager.setStatus(`Pairing failed: ${e}`, true);
    }
  }

  private async storeCursorApiKey(
    apiKey: string,
    customName?: string,
  ): Promise<void> {
    try {
      await this.supabaseService.invokeFunction("key-store", {
        name: PROVIDER_IDS.CURSOR_CLOUD,
        api_key: apiKey,
      });
      this.log(`${TAG} Cursor API key stored via bridge pairing`);

      const provider = this.providerRegistry.getProvider(
        PROVIDER_IDS.CURSOR_CLOUD,
      );
      if (provider) {
        this.registerProviderAgent(provider, customName);
        this.uiManager.notifyProviderConnected(PROVIDER_IDS.CURSOR_CLOUD, true);
      }
      await this.loadExistingInstances();
      this.loadProviderOptions();
    } catch (e) {
      this.log(`${TAG} Failed to store Cursor API key: ${e}`);
    }
  }

  private async loadBridgeConversations(
    agentId: string,
    bridgeUuid: string,
  ): Promise<void> {
    if (this.conversationsLoadInProgress.has(agentId)) {
      this.log(
        `${TAG} loadBridgeConversations: already in progress for ${agentId}, skipping`,
      );
      return;
    }
    this.conversationsLoadInProgress.add(agentId);
    this.store.setConversationsLoading(agentId, true);

    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 2000;
    let instances: AgentInstance[] = [];
    let loadSucceeded = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        instances = await this.bridgeProvider.listAgentInstances(
          50,
          bridgeUuid,
        );
        this.log(`${TAG} Loaded ${instances.length} bridge conversations`);
        loadSucceeded = true;
        break;
      } catch (e) {
        this.log(
          `${TAG} Failed to load bridge conversations (attempt ${attempt}/${MAX_ATTEMPTS}): ${e}`,
        );
        if (attempt < MAX_ATTEMPTS) {
          // Use shorter delay — the bridge_presence retry in onSignal will
          // also re-trigger this, so we don't need long waits here.
          this.log(
            `${TAG} Retrying bridge conversations in ${RETRY_DELAY_MS}ms`,
          );
          await new Promise<void>((resolve) =>
            setTimeout(resolve, RETRY_DELAY_MS),
          );
        }
      }
    }

    if (loadSucceeded) {
      this.bridgeConversationsLoadFailed.delete(agentId);
    } else {
      this.bridgeConversationsLoadFailed.add(agentId);
      this.log(
        `${TAG} All attempts to load bridge conversations failed for ${agentId} — will retry on next live signal`,
      );
    }

    try {
      for (const instance of instances) {
        this.createTopicFromInstance(agentId, instance);
      }

      this.updateAgentStatusFromTopics(agentId);
      this.store.restoreLastActiveTopic(agentId);
    } catch (e) {
      this.log(`${TAG} Failed to process bridge conversations: ${e}`);
    }

    if (this.store.getTopicsForAgent(agentId).length === 0) {
      this.store.addTopic(agentId, "New Chat");
    } else if (!this.store.getActiveTopicId(agentId)) {
      const topics = this.store.getTopicsForAgent(agentId);
      const mostRecent = [...topics].sort(
        (a, b) => b.createdAt - a.createdAt,
      )[0];
      this.store.selectTopic(agentId, mostRecent.id);
    }

    this.conversationsLoadInProgress.delete(agentId);
    this.store.setConversationsLoading(agentId, false);
  }

  private startPollingBridgeStatus(agentId: string, bridgeUuid: string): void {
    this.subscribeBridgeChannelLiveness(agentId, bridgeUuid);
    this.subscribeBridgeAgentStatus(agentId, bridgeUuid);
    this.subscribeBridgeAgentDeletion(agentId, bridgeUuid);
  }

  private subscribeBridgeChannelLiveness(
    agentId: string,
    bridgeUuid: string,
  ): void {
    this.bridgeProvider.subscribeToBridgeLiveness(bridgeUuid, {
      onSignal: () => {
        const previousState = this.bridgeConnectionMap.get(agentId);
        const connectionState =
          this.heartbeatManager.recordBridgeActivity(agentId);
        this.syncBridgeConnectionState(
          agentId,
          bridgeUuid,
          connectionState,
          previousState,
        );

        // If conversations never loaded or a previous load failed, retry now
        // that we have a live signal from the bridge.
        // Note: no isInitialSetupComplete guard here — conversationsLoadInProgress
        // already prevents duplicate loads, and we want to retry even mid-setup.
        if (
          !this.conversationsLoadInProgress.has(agentId) &&
          (this.bridgeConversationsLoadFailed.has(agentId) ||
            this.store.getTopicsForAgent(agentId).every((t) => !t.externalId))
        ) {
          this.log(
            `${TAG} Signal from ${agentId} — retrying conversations load (failed=${this.bridgeConversationsLoadFailed.has(agentId)})`,
          );
          void this.loadBridgeConversations(agentId, bridgeUuid);
        }
      },
      onConnectionStateChanged: (connected: boolean) => {
        this.log(
          `[DBG AgentManager] broadcast channel ${connected ? "connected" : "disconnected"} for ${agentId}`,
        );
        const previousState = this.bridgeConnectionMap.get(agentId);
        const connectionState = this.heartbeatManager.syncBroadcastChannel(
          agentId,
          connected,
        );
        this.syncBridgeConnectionState(
          agentId,
          bridgeUuid,
          connectionState,
          previousState,
        );
      },
      onExplicitOffline: () => {
        this.log(
          `[DBG AgentManager] bridge_offline received for ${agentId} — marking offline immediately`,
        );
        const previousState = this.bridgeConnectionMap.get(agentId);
        const connectionState =
          this.heartbeatManager.markBridgeOffline(agentId);
        this.syncBridgeConnectionState(
          agentId,
          bridgeUuid,
          connectionState,
          previousState,
        );
      },
    });
  }

  private subscribeBridgeAgentStatus(
    agentId: string,
    bridgeUuid: string,
  ): void {
    this.bridgeProvider.subscribeToAgentStatus(
      bridgeUuid,
      (status, name, lastSeenAt) => {
        this.log(
          `[DBG AgentManager] DB status update for ${agentId}: status=${status} lastSeenAt=${lastSeenAt ?? "null"}`,
        );
        if (name) {
          this.store.updateAgentName(agentId, name);
        }

        const previousState = this.bridgeConnectionMap.get(agentId);
        const connectionState = this.heartbeatManager.syncHeartbeat(
          agentId,
          status,
          lastSeenAt,
        );
        this.syncBridgeConnectionState(
          agentId,
          bridgeUuid,
          connectionState,
          previousState,
        );
      },
    );
  }

  private syncBridgeConnectionState(
    agentId: string,
    bridgeUuid: string,
    connectionState: BridgeConnectionState,
    previousState?: BridgeConnectionState,
  ): void {
    if (previousState === connectionState && previousState !== undefined) {
      return;
    }
    this.log(
      `[DBG AgentManager] syncBridgeConnectionState ${agentId}: ${previousState ?? "none"} → ${connectionState}`,
    );
    this.applyBridgeConnectionState(
      agentId,
      bridgeUuid,
      connectionState,
      previousState,
    );
  }

  private playBridgeSfx(track: AudioTrackAsset): void {
    const now = Date.now();
    if (now - this.lastBridgeSfxTime < BRIDGE_SFX_DEBOUNCE_MS) return;
    this.lastBridgeSfxTime = now;
    this.audioComponent.audioTrack = track;
    this.audioComponent.play(1);
  }

  private applyBridgeConnectionState(
    agentId: string,
    bridgeUuid: string,
    connectionState: BridgeConnectionState,
    previousState?: BridgeConnectionState,
  ): void {
    const current = this.store.getAgent(agentId);
    if (!current) return;

    const isWorking =
      current.status === AgentStatus.Working ||
      current.status === AgentStatus.AwaitingAction;
    const stateChanged = previousState !== connectionState;

    if (connectionState === "offline") {
      if (stateChanged && previousState) {
        this.playBridgeSfx(BRIDGE_DISCONNECTED_SFX);
      }
      this.store.updateAgentStatus(agentId, AgentStatus.Offline, null);
      if (stateChanged) {
        this.log(`${TAG} Bridge agent ${agentId} went offline`);
      }
      return;
    }

    if (connectionState === "stale") {
      if (!isWorking) {
        this.store.updateAgentStatus(agentId, AgentStatus.Connecting, null);
      }
      if (stateChanged) {
        this.log(
          `${TAG} Bridge agent ${agentId} connection stale — reconnecting`,
        );
      }
      return;
    }

    if (!isWorking) {
      this.store.updateAgentStatus(agentId, AgentStatus.Idle, null);
    }
    if (stateChanged) {
      this.log(
        `${TAG} Bridge agent ${agentId} status changed via realtime: online`,
      );
    }

    if (previousState === "offline") {
      this.playBridgeSfx(BRIDGE_CONNECTED_SFX);
      this.onBridgeAgentCameOnline(agentId, bridgeUuid);
    }
  }

  private markAllBridgeChannelsDisconnected(): void {
    for (const agent of this.store.getAgents()) {
      if (agent.provider !== "bridge") continue;
      const bridgeUuid = this.bridgeAgentUuid(agent.id);
      const previousState = this.bridgeConnectionMap.get(agent.id);
      const connectionState = this.heartbeatManager.syncBroadcastChannel(
        agent.id,
        false,
      );
      this.syncBridgeConnectionState(
        agent.id,
        bridgeUuid,
        connectionState,
        previousState,
      );
    }
  }

  private subscribeBridgeAgentDeletion(
    agentId: string,
    bridgeUuid: string,
  ): void {
    this.bridgeProvider.subscribeToAgentDeletion(bridgeUuid, () => {
      this.log(`${TAG} Bridge agent ${bridgeUuid} deleted via realtime`);
      this.handleBridgeAgentRemoved(agentId, bridgeUuid);
    });
  }

  private async onBridgeAgentCameOnline(
    agentId: string,
    bridgeUuid: string,
  ): Promise<void> {
    this.log(
      `[DBG AgentManager] onBridgeAgentCameOnline ${agentId} — invalidating history and recovering`,
    );
    this.log(
      `${TAG} Bridge agent ${agentId} came online — recovering conversations`,
    );

    for (const topic of this.store.getTopicsForAgent(agentId)) {
      if (topic.externalId) {
        this.invalidateConversationHistory(topic.externalId, false);
      }
    }

    await this.loadBridgeConversations(agentId, bridgeUuid);
    await this.recoverBridgeActiveTopic(agentId);
    this.loadBridgeWorkspaces();
  }

  private handleBridgeAgentRemoved(agentId: string, bridgeUuid: string): void {
    this.bridgeProvider.unsubscribeAgent(bridgeUuid);
    this.heartbeatManager.removeAgent(agentId);
    this.activeConversationByAgent.delete(agentId);
    this.bridgeProvider.removePairedId(bridgeUuid);
    for (const topic of this.store.getTopicsForAgent(agentId)) {
      if (topic.externalId) {
        this.invalidateConversationHistory(topic.externalId, false);
      }
    }
    this.store.removeAgent(agentId);
    this.log(
      `${TAG} Bridge agent ${agentId} removed from UI (unpaired remotely)`,
    );
  }

  private subscribeBridgeAgentInserts(): void {
    this.bridgeProvider.subscribeToNewAgents((agent) => {
      const bridgeUuid = agent.id;
      const agentId = `bridge-agent-${bridgeUuid}`;

      if (this.store.getAgent(agentId)) return;
      if (
        agent.agent_type === "cursor_cloud" &&
        this.store.getAgent(`${PROVIDER_IDS.CURSOR_CLOUD}-agent`)
      )
        return;

      this.log(
        `${TAG} New bridge agent discovered via realtime: ${bridgeUuid}`,
      );
      this.connectBridgeAgent(
        bridgeUuid,
        agent.name ?? undefined,
        agent.status,
        agent.last_seen_at,
        agent.agent_type,
      );
    });
  }

  private async connectBridgeAgent(
    bridgeUuid: string,
    name?: string,
    dbStatus?: "online" | "offline",
    lastSeenAt?: string | null,
    agentType?: string,
  ): Promise<void> {
    if (agentType === "cursor_cloud") {
      const provider = this.providerRegistry.getProvider(
        PROVIDER_IDS.CURSOR_CLOUD,
      );
      if (provider) {
        this.registerProviderAgent(provider, name);
        this.uiManager.notifyProviderConnected(PROVIDER_IDS.CURSOR_CLOUD, true);
      }
      return;
    }

    const agentId = `bridge-agent-${bridgeUuid}`;
    this.log(
      `[DBG AgentManager] connectBridgeAgent ${agentId} — caller: full setup`,
    );
    this.store.setConversationsLoading(agentId, true);
    this.registerBridgeAgent(bridgeUuid, name, dbStatus, lastSeenAt);
    this.startPollingBridgeStatus(agentId, bridgeUuid);
    this.subscribeBridgeConversations(agentId, bridgeUuid);
    // Don't block on initial conversation load — the bridge may not be
    // listening yet.  The onSignal retry in subscribeBridgeChannelLiveness
    // will re-trigger loadBridgeConversations as soon as the bridge sends
    // its first bridge_presence, which is a reliable indicator it's ready.
    void this.loadBridgeConversations(agentId, bridgeUuid).then(() => {
      this.log(
        `[DBG AgentManager] connectBridgeAgent ${agentId} — loadBridgeConversations done, topics=${this.store.getTopicsForAgent(agentId).length}`,
      );
      void this.recoverBridgeActiveTopic(agentId);
    });
    this.loadBridgeWorkspaces();
  }

  private async initSupabase(): Promise<void> {
    const supabaseProject = this.snapCloudRequirements?.getSupabaseProject();
    if (!supabaseProject) {
      this.log(`${TAG} No Supabase project configured`);
      this.uiManager.notifySupabaseConfigured(false);
      return;
    }

    const url = (supabaseProject.url ?? "").trim();
    if (!url) {
      this.log(`${TAG} Supabase project URL not configured`);
      this.uiManager.notifySupabaseConfigured(false);
      return;
    }
    this.uiManager.notifySupabaseConfigured(true);

    this.supabaseService.onError.add((msg) => {
      this.log(`${TAG} Supabase error: ${msg}`);
      this.uiManager.setStatus(`Connection error: ${msg}`, true);
    });

    const MAX_INIT_ATTEMPTS = 5;
    const BASE_DELAY_MS = 2000;

    for (let attempt = 1; attempt <= MAX_INIT_ATTEMPTS; attempt++) {
      if (this.destroyed) return;

      const ok = await this.supabaseService.init(supabaseProject);
      if (ok) return;

      this.log(
        `${TAG} Supabase init failed (attempt ${attempt}/${MAX_INIT_ATTEMPTS})`,
      );

      if (attempt < MAX_INIT_ATTEMPTS) {
        const delay = BASE_DELAY_MS;
        this.log(`${TAG} Retrying Supabase init in ${delay}ms`);
        this.uiManager.setStatus("Failed to connect, retrying...", true);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }

    this.log(`${TAG} Supabase init failed after ${MAX_INIT_ATTEMPTS} attempts`);
    this.uiManager.setStatus("Failed to connect — restart experience", true);
  }

  private async tryAutoConnect(): Promise<boolean> {
    let anyConnected = false;

    for (const provider of this.providerRegistry.getAllProviders()) {
      if (provider.providerId === "bridge") {
        const pairedAgents = await this.bridgeProvider.fetchPairedAgents();
        if (pairedAgents.length > 0) {
          for (const pairedAgent of pairedAgents) {
            this.log(
              `${TAG} Auto-connect: Bridge pairing found in Supabase (agent ${pairedAgent.id})`,
            );
            await this.connectBridgeAgent(
              pairedAgent.id,
              pairedAgent.name ?? undefined,
              pairedAgent.status,
              pairedAgent.last_seen_at,
              pairedAgent.agent_type,
            );
          }
          anyConnected = true;
        } else {
          this.log(`${TAG} Auto-connect: No bridge agents paired, skipping`);
        }
        this.subscribeBridgeAgentInserts();
        continue;
      }

      const agentId = `${provider.providerId}-agent`;
      try {
        const instances = await provider.listAgentInstances(50);
        this.log(
          `${TAG} Auto-connect: found ${instances.length} existing ${provider.providerId} instances`,
        );

        this.registerProviderAgent(provider);

        for (const instance of instances) {
          this.createTopicFromInstance(agentId, instance);
        }

        this.store.restoreLastActiveTopic(agentId);
        this.updateAgentStatusFromTopics(agentId);

        this.uiManager.notifyProviderConnected(provider.providerId, true);
        anyConnected = true;
      } catch (e) {
        this.log(
          `${TAG} Auto-connect: no stored key for ${provider.providerId}, skipping`,
        );
      }
    }

    return anyConnected;
  }

  private registerProviderAgent(
    provider: AgentProvider,
    customName?: string,
  ): void {
    const agentId = `${provider.providerId}-agent`;
    const existing = this.store.getAgent(agentId);

    if (existing) {
      if (existing.status === AgentStatus.Connecting) {
        this.store.updateAgentStatus(agentId, AgentStatus.Idle, null);
        this.log(`${TAG} Provider agent connected: ${agentId}`);
      }
      if (customName && existing.name !== customName) {
        this.store.updateAgentName(agentId, customName);
      }
      this.uiManager.notifyProviderConnected(provider.providerId, true);
      return;
    }

    const agent: Agent = {
      id: agentId,
      name:
        customName ??
        PROVIDER_DISPLAY_NAMES[provider.providerId] ??
        provider.providerId,
      description: "Cloud-based coding agents",
      status: AgentStatus.Idle,
      currentTaskId: null,
      provider: provider.providerId,
    };

    this.store.addAgent(agent);
    this.audioComponent.audioTrack = ROBOT_SPAWN_SFX;
    this.audioComponent.play(1);
    this.uiManager.notifyProviderConnected(provider.providerId, true);
    this.log(`${TAG} Registered provider agent: ${agentId}`);
  }

  private registerBridgeAgent(
    bridgeUuid: string,
    customName?: string,
    dbStatus?: "online" | "offline",
    lastSeenAt?: string | null,
  ): void {
    const agentId = `bridge-agent-${bridgeUuid}`;
    const existing = this.store.getAgent(agentId);
    this.log(
      `[DBG AgentManager] registerBridgeAgent ${agentId}: dbStatus=${dbStatus ?? "none"} lastSeenAt=${lastSeenAt ?? "null"}`,
    );
    const connectionState = dbStatus
      ? this.heartbeatManager.syncHeartbeat(
          agentId,
          dbStatus,
          lastSeenAt ?? null,
        )
      : "stale";
    const resolvedStatus =
      connectionState === "online"
        ? AgentStatus.Idle
        : connectionState === "stale"
          ? AgentStatus.Connecting
          : AgentStatus.Offline;

    if (existing) {
      if (
        existing.status === AgentStatus.Connecting ||
        (existing.status !== AgentStatus.Working &&
          existing.status !== AgentStatus.AwaitingAction)
      ) {
        this.store.updateAgentStatus(agentId, resolvedStatus, null);
        this.log(
          `${TAG} Bridge agent status refreshed: ${agentId} (${connectionState})`,
        );
      }
      if (customName && existing.name !== customName) {
        this.store.updateAgentName(agentId, customName);
      }
      return;
    }

    const agent: Agent = {
      id: agentId,
      name: customName ?? PROVIDER_DISPLAY_NAMES.bridge,
      description: "Local AI agent",
      status: resolvedStatus,
      currentTaskId: null,
      provider: "bridge",
    };

    this.store.addAgent(agent);
    this.audioComponent.audioTrack = ROBOT_SPAWN_SFX;
    this.audioComponent.play(1);
    this.log(`${TAG} Registered bridge agent: ${agentId}`);
  }

  private async loadExistingInstances(): Promise<void> {
    for (const provider of this.providerRegistry.getAllProviders()) {
      const agentId = `${provider.providerId}-agent`;
      try {
        const instances = await provider.listAgentInstances(50);
        this.log(
          `${TAG} Found ${instances.length} existing ${provider.providerId} instances`,
        );

        for (const instance of instances) {
          this.createTopicFromInstance(agentId, instance);
        }

        this.store.restoreLastActiveTopic(agentId);
        this.updateAgentStatusFromTopics(agentId);
      } catch (e) {
        this.log(
          `${TAG} Failed to load instances for ${provider.providerId}: ${e}`,
        );
        this.store.updateAgentStatus(agentId, AgentStatus.Error, null);
      }
    }
  }

  private async loadProviderOptions(): Promise<void> {
    for (const provider of this.providerRegistry.getAllProviders()) {
      if (provider.providerId === "bridge") {
        await this.loadBridgeWorkspaces();
        continue;
      }

      const agentId = `${provider.providerId}-agent`;

      try {
        const models = await provider.listModels();
        this.log(
          `${TAG} Loaded ${models.length} models for ${provider.providerId}`,
        );
        this.uiManager.agentWorldView.setAgentModels(agentId, models);
      } catch (e) {
        this.log(
          `${TAG} Failed to load models for ${provider.providerId}: ${e}`,
        );
      }

      try {
        const repos = await provider.listRepositories();
        const repoEntries = repos.map((r) => ({
          name: r.name || r.repository.split("/").pop() || r.repository,
          path: r.repository,
        }));
        this.log(
          `${TAG} Loaded ${repoEntries.length} repos for ${provider.providerId}`,
        );
        this.uiManager.agentWorldView.setAgentRepos(agentId, repoEntries);
      } catch (e) {
        this.log(
          `${TAG} Failed to load repos for ${provider.providerId}: ${e}`,
        );
      }
    }
  }

  private async loadBridgeWorkspaces(): Promise<void> {
    for (const bridgeUuid of this.bridgeProvider.getPairedAgentIds()) {
      const agentId = `bridge-agent-${bridgeUuid}`;
      try {
        const repos = await this.bridgeProvider.listRepositories(bridgeUuid);
        const repoEntries = repos.map((r) => ({
          name: r.gitBranch ? `${r.name} (${r.gitBranch})` : r.name,
          path: r.repository,
          gitBranch: r.gitBranch,
          lastUsed: r.lastUsed,
        }));
        this.log(
          `${TAG} Loaded ${repoEntries.length} workspaces for bridge agent ${bridgeUuid}`,
        );
        this.uiManager.agentWorldView.setAgentRepos(agentId, repoEntries);
      } catch (e) {
        this.log(
          `${TAG} Failed to load workspaces for bridge ${bridgeUuid}: ${e}`,
        );
      }

      try {
        const models = await this.bridgeProvider.listModels(bridgeUuid);
        this.log(
          `${TAG} Loaded ${models.length} model aliases for bridge agent ${bridgeUuid}`,
        );
        this.uiManager.agentWorldView.setAgentModels(agentId, models);
      } catch (e) {
        this.log(`${TAG} Failed to load models for bridge ${bridgeUuid}: ${e}`);
      }
    }
  }

  private createTopicFromInstance(
    agentId: string,
    instance: AgentInstance,
  ): ChatTopic | null {
    if (this.store.isExternalIdDeleted(instance.id)) return null;
    if (instance.status === AgentInstanceStatus.Expired) return null;

    const existing = this.store.getTopicByExternalId(instance.id);
    if (existing) return existing;

    const metadata: Record<string, string> = {
      status: instance.status,
    };
    if (instance.prUrl) metadata.prUrl = instance.prUrl;
    if (instance.branchName) metadata.branchName = instance.branchName;
    if (instance.url) metadata.url = instance.url;
    if (instance.summary) metadata.summary = instance.summary;
    if (instance.workspace) metadata.workspace = instance.workspace;

    const createdAt = instance.createdAt
      ? new Date(instance.createdAt).getTime()
      : undefined;

    return this.store.addTopic(
      agentId,
      instance.name,
      instance.id,
      metadata,
      false,
      createdAt,
    );
  }

  private wireSupabaseBroadcasts(): void {
    this.supabaseService.onBroadcast.add((envelope: BroadcastEnvelope) => {
      this.log(`${TAG} Broadcast received: ${envelope.event}`);
      switch (envelope.event) {
        case "agent_status":
          if (isAgentStatusBroadcast(envelope.payload)) {
            this.handleAgentStatus(envelope.payload);
          } else {
            this.log(
              `${TAG} Invalid agent_status payload: ${JSON.stringify(envelope.payload)}`,
            );
          }
          break;
        case "agent_launched":
          if (isAgentLaunchedBroadcast(envelope.payload)) {
            this.handleAgentLaunched(envelope.payload);
          } else {
            this.log(
              `${TAG} Invalid agent_launched payload: ${JSON.stringify(envelope.payload)}`,
            );
          }
          break;
      }
    });

    this.supabaseService.onDisconnected.add((reason: string) => {
      this.log(`${TAG} Supabase disconnected: ${reason}`);
      this.markAllBridgeChannelsDisconnected();
    });

    this.supabaseService.onConnected.add(() => {
      this.log(`${TAG} Supabase reconnected, polling active instances`);
      this.startPollingActiveInstances();
      this.startPollingDiscovery();
      this.bridgeProvider.refreshBridgeChannels();
      this.handleBridgeReconnection();
    });
  }

  private subscribeBridgeConversations(
    agentId: string,
    bridgeUuid: string,
  ): void {
    this.bridgeProvider.subscribeToConversations(
      bridgeUuid,
      (conversation: BridgeConversation) => {
        this.log(
          `${TAG} New bridge conversation: ${conversation.id} "${conversation.title}"`,
        );

        const instance: AgentInstance = {
          id: conversation.id,
          name: conversation.title,
          status: AgentInstanceStatus.Running,
          workspace: conversation.workspace ?? undefined,
          createdAt: conversation.created_at,
        };

        const topic = this.createTopicFromInstance(agentId, instance);
        if (topic) {
          this.store.markTopicUnreadIfNew(topic.id);
          this.updateAgentStatusFromTopics(agentId);
        }
      },
    );

    this.log(
      `${TAG} Subscribed to bridge conversation inserts for agent ${bridgeUuid}`,
    );
  }

  private wireBridgeTopicSwitch(): void {
    this.store.onTopicSelected.add(({ agentId, topicId }) => {
      if (this.store.getSelectedAgentId() !== agentId) return;

      const agent = this.store.getAgent(agentId);
      if (!agent?.provider) return;

      const topic = this.store.getActiveTopic(agentId);
      if (!topic || topic.id !== topicId || !topic.externalId) return;

      void this.activateTopicHistory(agentId, topicId);
    });

    this.store.onAgentSelected.add((agent) => {
      if (!agent?.provider) return;

      const topicId = this.store.getActiveTopicId(agent.id);
      if (!topicId) return;

      void this.activateTopicHistory(agent.id, topicId);
    });
  }

  private async recoverTopicPermissionState(
    agentId: string,
    conversationId: string,
  ): Promise<void> {
    const bridgeUuid = this.bridgeAgentUuid(agentId);
    try {
      const convState = await this.bridgeProvider.getConversationState(
        conversationId,
        bridgeUuid,
      );
      if (!convState) return;

      const topic = this.store.getTopicByExternalId(conversationId);
      if (!topic) return;

      const mappedStatus =
        BRIDGE_ACTIVITY_TO_METADATA[convState.activity_state];
      if (mappedStatus) {
        this.store.updateTopicMetadata(topic.id, { status: mappedStatus });
        this.updateAgentStatusFromTopics(agentId);
      }

      if (
        convState.activity_state === "awaiting_permission" &&
        convState.permission_payload
      ) {
        this.uiManager.agentWorldView.showPermissionRequest(
          convState.permission_payload,
        );
      }
    } catch (e) {
      this.log(
        `${TAG} Failed to recover permission state for ${conversationId}: ${e}`,
      );
    }
  }

  private wireWorkspaceDiscovery(): void {
    this.uiManager.agentWorldView.onAddWorkspaceRequested.add(
      async (agentId) => {
        const agent = this.store.getAgent(agentId);
        if (!agent || agent.provider !== "bridge") return;

        const bridgeUuid = this.bridgeAgentUuid(agentId);
        try {
          const discovered =
            await this.bridgeProvider.discoverWorkspaces(bridgeUuid);
          if (discovered.length === 0) {
            this.log(`${TAG} No discoverable workspaces for ${agentId}`);
            return;
          }
          this.uiManager.agentWorldView.showDiscoveredWorkspaces(discovered);
        } catch (e) {
          this.log(`${TAG} Workspace discovery failed for ${agentId}: ${e}`);
        }
      },
    );

    this.uiManager.agentWorldView.onDiscoveredWorkspaceSelected.add(
      async ({ agentId, path }) => {
        const agent = this.store.getAgent(agentId);
        if (!agent || agent.provider !== "bridge") return;

        const bridgeUuid = this.bridgeAgentUuid(agentId);
        try {
          const result = await this.bridgeProvider.addWorkspace(
            path,
            bridgeUuid,
          );
          if (result.success) {
            this.log(`${TAG} Workspace added: ${path}`);
            await this.loadBridgeWorkspaces();
            const repos = this.store.getRepos(agentId);
            const newIdx = repos.findIndex((r) => r.path === path);
            if (newIdx >= 0) {
              this.store.setRepoIndex(agentId, newIdx);
            }
            this.uiManager.agentWorldView.refreshChatFooter();
          } else {
            this.log(`${TAG} Failed to add workspace: ${result.error}`);
          }
        } catch (e) {
          this.log(`${TAG} Add workspace failed: ${e}`);
        }
      },
    );
  }

  private wireOpenInCli(): void {
    this.uiManager.agentWorldView.onOpenInCliRequested.add(
      async (agentId: string) => {
        const agent = this.store.getAgent(agentId);
        if (!agent || agent.provider !== "bridge") return;

        const topicId = this.store.getActiveTopicId(agentId);
        if (!topicId) return;

        const topic = this.store.getActiveTopic(agentId);
        const conversationId = topic?.externalId;
        if (!conversationId) return;

        const bridgeUuid = this.bridgeAgentUuid(agentId);
        try {
          await this.bridgeProvider.openInCli(conversationId, bridgeUuid);
          this.log(
            `${TAG} Open in CLI requested for conversation ${conversationId}`,
          );
        } catch (e) {
          this.log(`${TAG} Open in CLI failed: ${e}`);
        }
      },
    );

    this.store.onAgentSelected.add((agent) => {
      const isBridge = agent?.provider === "bridge";
      this.uiManager.agentWorldView.setOpenInCliVisible(isBridge);
    });
  }

  private subscribeBridgeRealtime(
    conversationId: string,
    agentId: string,
  ): void {
    this.log(
      `[DBG AgentManager] subscribeBridgeRealtime ${agentId} → conversationId=${conversationId}`,
    );
    const bridgeUuid = this.bridgeAgentUuid(agentId);

    const prevConvId = this.activeConversationByAgent.get(agentId);
    if (prevConvId && prevConvId !== conversationId) {
      this.bridgeProvider.unsubscribeConversation(prevConvId);
    }
    this.activeConversationByAgent.set(agentId, conversationId);

    const buffered = this.bridgeProvider.drainBufferedMessages(conversationId);
    if (buffered.length > 0) {
      const topic = this.store.getTopicByExternalId(conversationId);
      this.log(
        `[DBG AgentManager] subscribeBridgeRealtime: draining ${buffered.length} buffered messages for convId=${conversationId} topicFound=${!!topic}`,
      );
      if (topic) {
        for (const msg of buffered) {
          if (msg.role !== "agent") continue;
          const cleanContent = stripMarkdown(msg.content);
          if (msg.images && msg.images.length > 0) {
            const images = msg.images;
            this.bridgeMessageQueue = this.bridgeMessageQueue.then(async () => {
              const textures = await this.decodeBridgeImages(images);
              this.store.addMessageToTopic(
                agentId,
                topic.id,
                "agent",
                cleanContent,
                false,
                msg.id,
                textures,
              );
            });
          } else {
            this.store.addMessageToTopic(
              agentId,
              topic.id,
              "agent",
              cleanContent,
              false,
              msg.id,
            );
          }
        }
        this.updateAgentStatusFromTopics(agentId);
      }
    }

    const bufferedState =
      this.bridgeProvider.drainBufferedActivityState(conversationId);
    if (bufferedState) {
      const topic = this.store.getTopicByExternalId(conversationId);
      if (topic) {
        const mappedStatus =
          BRIDGE_ACTIVITY_TO_METADATA[bufferedState.activity_state];
        this.store.updateTopicMetadata(topic.id, { status: mappedStatus });
        this.updateAgentStatusFromTopics(agentId);
        if (
          bufferedState.activity_state === "awaiting_permission" &&
          bufferedState.permission_payload
        ) {
          const activeTopic = this.store.getActiveTopic(agentId);
          if (activeTopic?.id === topic.id) {
            this.uiManager.agentWorldView.showPermissionRequest(
              bufferedState.permission_payload,
            );
          }
          this.uiManager.showPermissionNotification(
            agentId,
            topic.id,
            topic.title,
            bufferedState.permission_payload.tool,
          );
          this.lastPermissionTool.set(
            agentId,
            bufferedState.permission_payload.tool,
          );
          if (bufferedState.permission_payload.request_id) {
            this.lastPermissionRequestId.set(
              agentId,
              bufferedState.permission_payload.request_id,
            );
          }
          this.store.addMessageToTopic(
            agentId,
            topic.id,
            "agent",
            `Permission requested: ${bufferedState.permission_payload.tool}`,
          );
        }
      }
    }

    this.bridgeProvider.subscribeToMessages(
      conversationId,
      (message: BridgeMessage) => {
        if (message.role === "agent") {
          const topic = this.store.getTopicByExternalId(conversationId);
          this.log(
            `[DBG AgentManager] agent message received: convId=${conversationId} msgId=${message.id} contentLen=${message.content?.length ?? 0} images=${message.images?.length ?? 0} topicFound=${!!topic}`,
          );
          if (!topic) return;

          const cleanContent = stripMarkdown(message.content);

          this.bridgeMessageQueue = this.bridgeMessageQueue.then(async () => {
            let textures: Texture[] | undefined;
            if (message.images && message.images.length > 0) {
              textures = await this.decodeBridgeImages(message.images);
            }
            this.store.addMessageToTopic(
              agentId,
              topic.id,
              "agent",
              cleanContent,
              false,
              message.id,
              textures,
            );
            this.updateAgentStatusFromTopics(agentId);
          });
        }
      },
      bridgeUuid,
    );

    this.bridgeProvider.subscribeToConversationStatus(
      conversationId,
      (conv: BridgeConversation) => {
        const topic = this.store.getTopicByExternalId(conversationId);
        if (!topic) return;

        const activityState = conv.activity_state;
        const mappedStatus = BRIDGE_ACTIVITY_TO_METADATA[activityState];
        this.log(
          `[DBG AgentManager] activity_state update: convId=${conversationId} state=${activityState} → status=${mappedStatus} topicId=${topic.id}`,
        );
        this.store.updateTopicMetadata(topic.id, { status: mappedStatus });
        this.updateAgentStatusFromTopics(agentId);

        if (
          activityState === "awaiting_permission" &&
          conv.permission_payload
        ) {
          this.log(
            `${TAG} Permission request for ${conv.permission_payload.tool}`,
          );
          const activeTopic = this.store.getActiveTopic(agentId);
          if (activeTopic?.id === topic.id) {
            this.uiManager.agentWorldView.showPermissionRequest(
              conv.permission_payload,
            );
          }
          this.uiManager.showPermissionNotification(
            agentId,
            topic.id,
            topic.title,
            conv.permission_payload.tool,
          );
          this.lastPermissionTool.set(agentId, conv.permission_payload.tool);
          if (conv.permission_payload.request_id) {
            this.lastPermissionRequestId.set(
              agentId,
              conv.permission_payload.request_id,
            );
          }
          this.store.addMessageToTopic(
            agentId,
            topic.id,
            "agent",
            `Permission requested: ${conv.permission_payload.tool}`,
          );
        } else {
          const activeTopic = this.store.getActiveTopic(agentId);
          if (activeTopic?.id === topic.id) {
            this.uiManager.agentWorldView.hidePermissionRequest();
          }
        }
      },
      bridgeUuid,
    );

    this.log(
      `${TAG} Bridge realtime subscriptions active for ${conversationId}`,
    );
  }

  private async handleBridgeReconnection(): Promise<void> {
    if (!this.isInitialSetupComplete) {
      this.log(
        `[DBG AgentManager] handleBridgeReconnection: skipped — initial setup not complete yet`,
      );
      return;
    }
    if (!this.bridgeProvider.isPaired()) return;

    const pairedAgents = await this.bridgeProvider.fetchPairedAgents();
    const knownIds = new Set(
      this.store
        .getAgents()
        .filter((a) => a.provider === "bridge")
        .map((a) => a.id),
    );

    this.log(
      `[DBG AgentManager] handleBridgeReconnection: paired=${pairedAgents.length} known=${knownIds.size}`,
    );

    for (const pairedAgent of pairedAgents) {
      const bridgeUuid = pairedAgent.id;
      const agentId = `bridge-agent-${bridgeUuid}`;

      if (pairedAgent.agent_type === "cursor_cloud") {
        await this.connectBridgeAgent(
          bridgeUuid,
          pairedAgent.name ?? undefined,
          undefined,
          undefined,
          pairedAgent.agent_type,
        );
        continue;
      }

      if (!knownIds.has(agentId)) {
        this.log(
          `[DBG AgentManager] handleBridgeReconnection: ${agentId} is NEW — calling connectBridgeAgent`,
        );
        this.log(
          `${TAG} Reconnection discovered new bridge agent: ${bridgeUuid}`,
        );
        await this.connectBridgeAgent(
          bridgeUuid,
          pairedAgent.name ?? undefined,
          pairedAgent.status,
          pairedAgent.last_seen_at,
        );
        continue;
      }

      this.registerBridgeAgent(
        bridgeUuid,
        pairedAgent.name ?? undefined,
        pairedAgent.status,
        pairedAgent.last_seen_at,
      );
      this.startPollingBridgeStatus(agentId, bridgeUuid);
      this.subscribeBridgeConversations(agentId, bridgeUuid);

      // Always re-sync conversations on reconnect — partial loads or stale
      // state from before the disconnect should be refreshed.
      this.log(
        `[DBG AgentManager] handleBridgeReconnection: ${agentId} is KNOWN — reloading conversations`,
      );
      await this.loadBridgeConversations(agentId, bridgeUuid);
      await this.recoverBridgeActiveTopic(agentId);
    }

    this.subscribeBridgeAgentInserts();
  }

  private async recoverBridgeActiveTopic(agentId: string): Promise<void> {
    const selectedId = this.store.getSelectedAgentId();
    if (selectedId !== agentId) {
      this.log(
        `[DBG AgentManager] recoverBridgeActiveTopic ${agentId}: skipped — selectedAgent=${selectedId ?? "none"}`,
      );
      return;
    }

    const activeTopic = this.store.getActiveTopic(agentId);
    if (!activeTopic?.externalId) {
      this.log(
        `[DBG AgentManager] recoverBridgeActiveTopic ${agentId}: skipped — no active topic with externalId (activeTopic=${activeTopic?.id ?? "none"})`,
      );
      return;
    }
    this.log(
      `[DBG AgentManager] recoverBridgeActiveTopic ${agentId}: running for topic ${activeTopic.externalId}`,
    );

    const bridgeUuid = this.bridgeAgentUuid(agentId);
    try {
      if (!this.hydratedConversations.has(activeTopic.externalId)) {
        await this.ensureTopicConversationLoaded(agentId, activeTopic.id);
      } else {
        this.touchConversationHistory(activeTopic.externalId);
        const recentMessages = await this.bridgeProvider.fetchRecentMessages(
          activeTopic.externalId,
          5,
          bridgeUuid,
        );

        const existingExternalIds = this.store.getExternalMessageIds(
          activeTopic.id,
        );

        for (const msg of recentMessages) {
          if (existingExternalIds.has(msg.id)) continue;

          const sender = msg.role === "user" ? "user" : "agent";
          const content =
            msg.role === "agent" ? stripMarkdown(msg.content) : msg.content;

          if (msg.images && msg.images.length > 0) {
            const textures = await this.decodeBridgeImages(msg.images);
            this.store.addMessageToTopic(
              agentId,
              activeTopic.id,
              sender,
              content,
              true,
              msg.id,
              textures,
            );
          } else {
            this.store.addMessageToTopic(
              agentId,
              activeTopic.id,
              sender,
              content,
              true,
              msg.id,
            );
          }
        }
      }

      this.subscribeBridgeRealtime(activeTopic.externalId, agentId);
      await this.recoverTopicPermissionState(agentId, activeTopic.externalId);

      this.log(`${TAG} Bridge reconnection recovery complete for ${agentId}`);
    } catch (e) {
      this.log(
        `${TAG} Bridge reconnection recovery failed for ${agentId}: ${e}`,
      );
    }
  }

  private handleAgentStatus(payload: AgentStatusBroadcast): void {
    const agentId = payload.agentId;
    const topic = this.store.getTopicByExternalId(payload.externalId);
    if (topic) {
      const metadata: Record<string, string> = {
        status: payload.status,
      };
      if (payload.summary) metadata.summary = payload.summary;
      this.store.updateTopicMetadata(topic.id, metadata);
    }

    if (isTerminalStatus(payload.status)) {
      this.fetchConversation(agentId, payload.externalId, payload.provider);
    }

    this.updateAgentStatusFromTopics(agentId);
  }

  private handleAgentLaunched(payload: AgentLaunchedBroadcast): void {
    if (this.store.isExternalIdDeleted(payload.externalId)) return;

    const existing = this.store.getTopicByExternalId(payload.externalId);
    if (existing) return;

    this.store.addTopic(payload.agentId, payload.name, payload.externalId, {
      status: AgentInstanceStatus.Creating,
    });

    this.store.updateAgentStatus(payload.agentId, AgentStatus.Working, null);
  }

  private updateAgentStatusFromTopics(agentId: string): void {
    const bridgeConnectionState = this.bridgeConnectionMap.get(agentId);
    if (bridgeConnectionState === "offline") {
      this.store.updateAgentStatus(agentId, AgentStatus.Offline, null);
      return;
    }

    const topics = this.store.getTopicsForAgent(agentId);
    let hasRunning = false;
    let hasAwaitingAction = false;
    let hasError = false;

    for (const topic of topics) {
      const status = topic.metadata?.status;
      if (status === AgentInstanceStatus.AwaitingAction) {
        hasAwaitingAction = true;
      } else if (
        status === AgentInstanceStatus.Creating ||
        status === AgentInstanceStatus.Running
      ) {
        hasRunning = true;
      } else if (status === AgentInstanceStatus.Error) {
        hasError = true;
      }
    }

    let agentStatus = AgentStatus.Idle;
    if (hasRunning) {
      agentStatus = AgentStatus.Working;
    } else if (hasAwaitingAction) {
      agentStatus = AgentStatus.AwaitingAction;
    } else if (hasError) {
      agentStatus = AgentStatus.Error;
    } else if (bridgeConnectionState === "stale") {
      agentStatus = AgentStatus.Connecting;
    }

    this.store.updateAgentStatus(agentId, agentStatus, null);
  }

  private async fetchConversation(
    agentId: string,
    externalId: string,
    providerId: string,
    isReplay: boolean = false,
  ): Promise<void> {
    if (!isReplay && this.hydratedConversations.has(externalId)) {
      this.log(
        `${TAG} Conversation already hydrated for ${externalId}, skipping`,
      );
      this.touchConversationHistory(externalId);
      return;
    }

    const pending = this.conversationLoadPromises.get(externalId);
    if (pending && !isReplay) {
      await pending;
      return;
    }

    this.log(`${TAG} Fetching conversation for ${externalId}`);
    const provider = this.providerRegistry.getProvider(providerId);
    if (!provider) return;

    try {
      let messages: AgentConversationMessage[];
      if (providerId === "bridge") {
        const bridgeUuid = this.bridgeAgentUuid(agentId);
        messages = await this.bridgeProvider.getConversation(
          externalId,
          bridgeUuid,
        );
      } else {
        messages = await provider.getConversation(externalId);
      }
      this.log(`${TAG} Got ${messages.length} messages for ${externalId}`);

      const topic = this.store.getTopicByExternalId(externalId);
      if (!topic) {
        this.log(`${TAG} No topic found for ${externalId}`);
        return;
      }

      this.store.replaceMessagesForTopic(
        agentId,
        topic.id,
        messages.map((msg) => ({
          externalId: msg.id,
          sender: msg.type === "user_message" ? "user" : "agent",
          content: msg.text,
        })),
      );
      this.rememberConversationHistory(externalId);

      const selectedAgentId = this.store.getSelectedAgentId();
      const activeTopicId = this.store.getActiveTopicId(agentId);
      if (selectedAgentId === agentId && activeTopicId === topic.id) {
        this.uiManager.agentWorldView.refreshSelectedThread(agentId, topic.id);
        this.generatePromptSuggestions(agentId, topic.id);
      }

      if (isReplay) {
        this.store.markTopicUnreadIfNew(topic.id);
      }
    } catch (e) {
      this.log(`${TAG} Failed to fetch conversation for ${externalId}: ${e}`);
    }
  }

  private wireProviderDisconnect(): void {
    this.uiManager.agentManagerPanel.onDisconnectRequested.add(
      async (provider) => {
        this.log(`${TAG} Provider disconnect requested: ${provider}`);

        if (provider === "bridge") {
          for (const uuid of this.bridgeProvider.getPairedAgentIds()) {
            await this.bridgeProvider.notifyAgentRemoved(uuid);
          }
          this.bridgeProvider.unsubscribeAll();
          await this.bridgeProvider.unpairAll();
          this.heartbeatManager.clear();
          this.log(`${TAG} All bridge agents unpaired`);
        } else {
          try {
            await this.supabaseService.invokeFunction("key-delete", {});
            this.log(`${TAG} API key deleted for ${provider}`);
          } catch (e) {
            this.log(`${TAG} Failed to delete API key for ${provider}: ${e}`);
          }
          await this.unpairBridgeEntriesForProvider(provider);
        }

        const agents = this.store
          .getAgents()
          .filter((a) => a.provider === provider);
        for (const agent of agents) {
          this.store.removeAgent(agent.id);
        }
        this.uiManager.notifyProviderConnected(provider, false);
      },
    );
  }

  private wireDisconnect(): void {
    this.uiManager.agentWorldView.onDisconnectRequested.add(async (agentId) => {
      this.log(`${TAG} Disconnect requested for agent ${agentId}`);

      const agent = this.store.getAgent(agentId);

      if (!this.useMockData && agent?.provider) {
        if (agent.provider === "bridge") {
          const bridgeUuid = this.bridgeAgentUuid(agentId);
          try {
            await this.bridgeProvider.notifyAgentRemoved(bridgeUuid);
            await this.bridgeProvider.unpairAgent(bridgeUuid);
            this.heartbeatManager.removeAgent(agentId);
            this.activeConversationByAgent.delete(agentId);
            for (const topic of this.store.getTopicsForAgent(agentId)) {
              if (topic.externalId) {
                this.invalidateConversationHistory(topic.externalId, false);
              }
            }
            this.log(`${TAG} Bridge agent ${bridgeUuid} unpaired`);
          } catch (e) {
            this.log(`${TAG} Failed to unpair bridge agent: ${e}`);
          }
        } else {
          try {
            await this.supabaseService.invokeFunction("key-delete", {});
            this.log(`${TAG} API key deleted for ${agent.provider}`);
          } catch (e) {
            this.log(`${TAG} Failed to delete API key: ${e}`);
          }
          await this.unpairBridgeEntriesForProvider(agent.provider);
          this.uiManager.notifyProviderConnected(agent.provider, false);
        }
      }

      this.store.removeAgent(agentId);
    });
  }

  private async unpairBridgeEntriesForProvider(
    providerId: string,
  ): Promise<void> {
    const entries = this.bridgeProvider
      .getPairedAgents()
      .filter((e) => e.agent_type === providerId);

    for (const entry of entries) {
      try {
        await this.bridgeProvider.notifyAgentRemoved(entry.id);
        await this.bridgeProvider.unpairAgent(entry.id);
        this.log(
          `${TAG} Unpaired bridge entry ${entry.id} (type: ${providerId})`,
        );
      } catch (e) {
        this.log(`${TAG} Failed to unpair bridge entry ${entry.id}: ${e}`);
      }
    }
  }

  private wireDelete(): void {
    this.uiManager.agentWorldView.onDeleteRequested.add(async (agentId) => {
      this.log(`${TAG} Delete requested for agent ${agentId}`);

      const agent = this.store.getAgent(agentId);
      if (!agent?.provider) return;

      const activeTopic = this.store.getActiveTopic(agentId);

      if (activeTopic) {
        if (activeTopic.externalId) {
          const bridgeUuid =
            agent.provider === "bridge"
              ? this.bridgeAgentUuid(agentId)
              : undefined;
          this.store.markExternalIdDeleted(
            activeTopic.externalId,
            agent.provider,
            bridgeUuid,
          );
          this.invalidateConversationHistory(activeTopic.externalId, false);
        }
        this.store.removeTopic(agentId, activeTopic.id);
      }

      this.updateAgentStatusFromTopics(agentId);

      const remaining = this.store.getTopicsForAgent(agentId);
      if (remaining.length > 0) {
        const mostRecent = remaining.reduce((a, b) =>
          b.lastActivityAt > a.lastActivityAt ? b : a,
        );
        this.store.selectTopic(agentId, mostRecent.id);
      } else {
        this.store.selectAgent(null);
      }

      if (!this.useMockData && activeTopic?.externalId) {
        if (agent.provider === "bridge") {
          const bridgeUuid = this.bridgeAgentUuid(agentId);
          try {
            await this.bridgeProvider.deleteAgent(
              activeTopic.externalId,
              bridgeUuid,
            );
            this.store.clearDeletedExternalId(activeTopic.externalId);
            this.log(`${TAG} Deleted agent instance ${activeTopic.externalId}`);
          } catch (e) {
            this.log(
              `${TAG} Failed to delete agent instance (will retry next session): ${e}`,
            );
          }
        } else {
          const provider = this.providerRegistry.getProvider(agent.provider);
          if (provider) {
            try {
              await provider.deleteAgent(activeTopic.externalId);
              this.store.clearDeletedExternalId(activeTopic.externalId);
              this.log(
                `${TAG} Deleted agent instance ${activeTopic.externalId}`,
              );
            } catch (e) {
              this.log(
                `${TAG} Failed to delete agent instance (will retry next session): ${e}`,
              );
            }
          }
        }
      }
    });
  }

  private wireClearConversations(): void {
    this.uiManager.agentWorldView.onClearConversationsRequested.add(
      async (agentId) => {
        this.log(`${TAG} Clear conversations requested for agent ${agentId}`);

        const agent = this.store.getAgent(agentId);
        if (!agent?.provider) return;

        const topics = [...this.store.getTopicsForAgent(agentId)];

        const bridgeUuid =
          agent.provider === "bridge"
            ? this.bridgeAgentUuid(agentId)
            : undefined;

        // Tombstone all topics locally first so they don't reappear via realtime
        for (const topic of topics) {
          if (topic.externalId) {
            this.store.markExternalIdDeleted(
              topic.externalId,
              agent.provider,
              bridgeUuid,
            );
            this.invalidateConversationHistory(topic.externalId, false);
          }
          this.store.removeTopic(agentId, topic.id);
        }

        // Then attempt remote deletes — clear tombstones on success
        if (!this.useMockData) {
          const deletions = topics
            .filter((t) => t.externalId)
            .map((topic) => {
              if (agent.provider === "bridge") {
                return this.bridgeProvider
                  .deleteAgent(topic.externalId!, bridgeUuid!)
                  .then(() => {
                    this.store.clearDeletedExternalId(topic.externalId!);
                    this.log(
                      `${TAG} Deleted agent instance ${topic.externalId}`,
                    );
                  })
                  .catch((e) =>
                    this.log(
                      `${TAG} Failed to delete agent instance (will retry next session): ${e}`,
                    ),
                  );
              } else {
                const provider = this.providerRegistry.getProvider(
                  agent.provider,
                );
                if (provider) {
                  return provider
                    .deleteAgent(topic.externalId!)
                    .then(() => {
                      this.store.clearDeletedExternalId(topic.externalId!);
                      this.log(
                        `${TAG} Deleted agent instance ${topic.externalId}`,
                      );
                    })
                    .catch((e) =>
                      this.log(
                        `${TAG} Failed to delete agent instance (will retry next session): ${e}`,
                      ),
                    );
                }
              }
              return Promise.resolve();
            });
          await Promise.all(deletions);
        }
        this.updateAgentStatusFromTopics(agentId);
        this.store.selectAgent(null);
      },
    );
  }

  private async retryPendingDeletions(): Promise<void> {
    const pending = this.store.getPendingDeletions();
    if (pending.length === 0) return;

    this.log(`${TAG} Retrying ${pending.length} pending remote deletions`);

    for (const entry of pending) {
      if (this.destroyed) return;

      try {
        if (entry.provider === "bridge") {
          if (!entry.bridgeAgentUuid) {
            this.log(
              `${TAG} Skipping pending deletion ${entry.externalId} — no bridgeAgentUuid`,
            );
            continue;
          }
          await this.bridgeProvider.deleteAgent(
            entry.externalId,
            entry.bridgeAgentUuid,
          );
        } else if (entry.provider === "unknown") {
          continue;
        } else {
          const provider = this.providerRegistry.getProvider(entry.provider);
          if (!provider) {
            this.log(
              `${TAG} Skipping pending deletion ${entry.externalId} — provider ${entry.provider} not found`,
            );
            continue;
          }
          await provider.deleteAgent(entry.externalId);
        }

        this.store.clearDeletedExternalId(entry.externalId);
        this.log(`${TAG} Retry succeeded: deleted ${entry.externalId}`);
      } catch (e) {
        this.log(
          `${TAG} Retry failed for ${entry.externalId}, will try next session: ${e}`,
        );
      }
    }
  }

  private wireDeleteAllData(): void {
    this.uiManager.agentManagerPanel.onDeleteAllDataRequested.add(async () => {
      this.log(`${TAG} Delete all data requested`);

      if (!this.useMockData) {
        for (const uuid of this.bridgeProvider.getPairedAgentIds()) {
          await this.bridgeProvider.notifyAgentRemoved(uuid);
        }
        this.bridgeProvider.unsubscribeAll();
        try {
          await this.bridgeProvider.unpairAll();
          this.log(`${TAG} All bridge agents unpaired`);
        } catch (e) {
          this.log(`${TAG} Failed to unpair bridge agents: ${e}`);
        }

        try {
          await this.supabaseService.invokeFunction("key-delete", {});
          this.log(`${TAG} API keys deleted`);
        } catch (e) {
          this.log(`${TAG} Failed to delete API keys: ${e}`);
        }
      }

      this.hydratedConversations.clear();
      this.conversationLoadPromises.clear();
      this.conversationHistoryLru = [];
      this.activeConversationByAgent.clear();
      this.heartbeatManager.destroy();

      this.store.clearAllData();

      this.uiManager.notifyProviderConnected("bridge", false);
      this.uiManager.setDockedAgentCount(0);

      this.log(`${TAG} All data deleted`);
    });
  }

  private wirePermissionResponse(): void {
    this.uiManager.agentWorldView.onPermissionDecision.add(
      async ({ agentId, decision }) => {
        this.log(
          `${TAG} Permission ${decision} from user for agent ${agentId}`,
        );
        const agent = this.store.getAgent(agentId);
        if (!agent) return;

        const activeTopic = this.store.getActiveTopic(agentId);
        if (!activeTopic?.externalId) return;

        const tool = this.lastPermissionTool.get(agentId) ?? "tool";
        this.lastPermissionTool.delete(agentId);
        const requestId = this.lastPermissionRequestId.get(agentId);
        this.lastPermissionRequestId.delete(agentId);
        const decisionLabel =
          decision === "allow"
            ? "allowed"
            : decision === "allow_session"
              ? "allowed for session"
              : "denied";
        this.store.addMessageToTopic(
          agentId,
          activeTopic.id,
          "system",
          `Permission ${decisionLabel}: ${tool}`,
        );

        try {
          const bridgeUuid = this.bridgeAgentUuid(agentId);
          await this.bridgeProvider.respondToPermission(
            activeTopic.externalId,
            decision,
            bridgeUuid,
            requestId,
          );
        } catch (e) {
          this.log(`${TAG} Failed to send permission response: ${e}`);
        }
      },
    );
  }

  private wireVoiceNoteGesture(): void {
    this.uiManager.voiceNoteGesture.onVoiceNoteSendTo.add(
      ({ agentId, transcript }) => {
        //this.uiManager.showPanelIfHidden();
        this.store.selectAgent(agentId);
        if (
          !this.uiManager.agentManagerPanel.getVoiceNoteContinuesLastTopic()
        ) {
          this.store.clearActiveTopic(agentId);
        }
        this.uiManager.agentInputBar.submitText(transcript);
      },
    );
  }

  private wireSmartFeatures(): void {
    this.uiManager.agentWorldView.onSmartFeatureChanged.add(
      (e: { index: number; enabled: boolean }) => {
        const agentId = this.store.getSelectedAgentId();
        if (!agentId) return;

        if (e.index === SCREEN_SHARING_FEATURE_INDEX) {
          this.handleScreenSharingToggle(agentId, e.enabled);
          return;
        }

        this.store.setSmartFeatureEnabled(agentId, e.index, e.enabled);

        if (e.index === 0) {
          this.log(
            `${TAG} Smart Summaries ${e.enabled ? "enabled" : "disabled"} for ${agentId}`,
          );
        } else if (e.index === 1) {
          this.log(
            `${TAG} Prompt Suggestions ${e.enabled ? "enabled" : "disabled"} for ${agentId}`,
          );
          if (!e.enabled) {
            this.uiManager.agentWorldView.clearSuggestions();
          }
        } else if (e.index === 2) {
          this.log(
            `${TAG} Topic Renaming ${e.enabled ? "enabled" : "disabled"} for ${agentId}`,
          );
        }
      },
    );

    this.store.onMessageAdded.add((msg) => {
      if (msg.sender !== "user") return;
      this.attemptTopicRename(msg.agentId, msg.topicId, msg.content);
    });

    this.store.onAgentMessageReceived.add((msg) => {
      this.generatePromptSuggestions(msg.agentId, msg.topicId);
    });

    this.store.onTopicSelected.add(({ agentId, topicId }) => {
      this.generatePromptSuggestions(agentId, topicId);
    });

    this.store.onAgentSelected.add((agent) => {
      if (!agent) {
        this.uiManager.agentWorldView.clearSuggestions();
        return;
      }
      const topicId = this.store.getActiveTopicId(agent.id);
      if (topicId) {
        this.generatePromptSuggestions(agent.id, topicId);
      }
      this.syncScreenSharingState(agent.id);
    });

    this.uiManager.agentWorldView.onSuggestionTapped.add((text: string) => {
      this.uiManager.agentInputBar.submitText(text);
      this.uiManager.agentWorldView.clearSuggestions();
    });
  }

  private syncScreenSharingState(agentId: string): void {
    const agent = this.store.getAgent(agentId);
    if (!agent || agent.provider !== "bridge") return;

    const bridgeUuid = this.bridgeAgentUuid(agentId);
    this.bridgeProvider
      .fetchArtifactsConfig(bridgeUuid)
      .then((response) => {
        this.store.setSmartFeatureEnabled(
          agentId,
          SCREEN_SHARING_FEATURE_INDEX,
          response.artifacts_enabled,
        );
      })
      .catch((err: Error) => {
        this.log(`${TAG} Failed to fetch screen sharing state: ${err.message}`);
      });
  }

  private handleScreenSharingToggle(agentId: string, enabled: boolean): void {
    const agent = this.store.getAgent(agentId);
    if (!agent || agent.provider !== "bridge") {
      this.log(`${TAG} Screen sharing toggle ignored — not a bridge agent`);
      return;
    }

    const bridgeUuid = this.bridgeAgentUuid(agentId);
    this.bridgeProvider
      .toggleArtifacts(bridgeUuid, enabled)
      .then((response) => {
        this.log(
          `${TAG} Screen sharing ${response.artifacts_enabled ? "enabled" : "disabled"} for ${agentId}`,
        );
      })
      .catch((err: Error) => {
        this.log(`${TAG} Failed to toggle screen sharing: ${err.message}`);
      });
  }

  private generatePromptSuggestions(agentId: string, topicId: string): void {
    if (!this.store.isPromptSuggestionsEnabled(agentId)) return;

    const messages = this.store.getMessagesForTopic(topicId);
    if (messages.length === 0) return;

    const topic = this.store.getTopicById(topicId);
    const topicTitle = topic?.title ?? "Chat";

    const gen = ++this.suggestionGeneration;
    this.uiManager.agentWorldView.clearSuggestions();

    PromptSuggestionService.generateSuggestions(topicTitle, messages).then(
      (suggestions) => {
        if (gen !== this.suggestionGeneration) return;
        if (this.store.getSelectedAgentId() === agentId) {
          this.uiManager.agentWorldView.setSuggestions(suggestions);
        }
      },
    );
  }

  private attemptTopicRename(
    agentId: string,
    topicId: string,
    userMessage: string,
  ): void {
    if (!this.store.isTopicRenamingEnabled(agentId)) return;

    const topic = this.store.getTopicById(topicId);
    if (!topic || topic.title !== "New Chat") return;

    const messages = this.store.getMessagesForTopic(topicId);
    if (messages.length !== 1) return;

    TopicRenamingService.generateTitle(userMessage, topic.title).then(
      (title) => {
        const current = this.store.getTopicById(topicId);
        if (current) {
          this.store.updateTopic(agentId, topicId, { title });
        }
      },
    );
  }

  private wireInputBar(): void {
    this.uiManager.agentInputBar.onTaskSubmitted.add(
      async ({ agentId, prompt, images }) => {
        this.store.addMessage(agentId, "user", prompt, images);

        if (this.useMockData) {
          this.handleMockTask(agentId, prompt);
          return;
        }

        const agent = this.store.getAgent(agentId);
        if (!agent?.provider) {
          this.log(`${TAG} No provider for agent ${agentId}`);
          return;
        }

        const provider = this.providerRegistry.getProvider(agent.provider);
        if (!provider) {
          this.log(`${TAG} Provider ${agent.provider} not found`);
          return;
        }

        let encodedImages: AgentImage[] | undefined;
        if (images && images.length > 0) {
          try {
            encodedImages = await Promise.all(
              images.map((tex) => encodeTextureAsImage(tex)),
            );
            this.log(`${TAG} Encoded ${encodedImages.length} images`);
          } catch (e) {
            this.log(`${TAG} Failed to encode images: ${e}`);
          }
        }

        const activeTopic = this.store.getActiveTopic(agentId);

        if (activeTopic?.externalId) {
          await this.handleFollowup(
            provider.providerId,
            agentId,
            activeTopic.externalId,
            prompt,
            encodedImages,
          );

          if (provider.providerId === "bridge") {
            this.subscribeBridgeRealtime(activeTopic.externalId, agentId);
          }
        } else if (provider.providerId !== "bridge") {
          await this.handleLaunch(
            provider.providerId,
            agentId,
            prompt,
            encodedImages,
          );
        } else {
          await this.handleBridgeNewConversation(
            agentId,
            prompt,
            encodedImages,
          );
        }
      },
    );
  }

  private wireStopRequest(): void {
    this.uiManager.agentInputBar.onStopRequested.add(async ({ agentId }) => {
      if (this.useMockData) {
        this.store.updateAgentStatus(agentId, AgentStatus.Idle, null);
        this.store.addMessage(agentId, "agent", "Task stopped by user.");
        return;
      }

      const agent = this.store.getAgent(agentId);
      if (!agent?.provider) return;

      const provider = this.providerRegistry.getProvider(agent.provider);
      if (!provider) return;

      const activeTopic = this.store.getActiveTopic(agentId);

      if (!activeTopic?.externalId) return;

      try {
        if (agent.provider === "bridge") {
          const bridgeUuid = this.bridgeAgentUuid(agentId);
          await this.bridgeProvider.stopAgent(
            activeTopic.externalId,
            bridgeUuid,
          );
        } else {
          await provider.stopAgent(activeTopic.externalId);
        }
        this.log(`${TAG} Stopped agent instance ${activeTopic.externalId}`);
        this.store.updateTopicMetadata(activeTopic.id, {
          status: AgentInstanceStatus.Stopped,
        });
        this.store.updateAgentStatus(agentId, AgentStatus.Idle, null);
        this.store.addMessageToTopic(
          agentId,
          activeTopic.id,
          "system",
          "Task stopped",
        );
      } catch (e) {
        this.log(`${TAG} Failed to stop agent: ${e}`);
        this.store.addMessage(agentId, "agent", `Failed to stop: ${e}`);
      }
    });
  }

  private async handleLaunch(
    providerId: string,
    agentId: string,
    prompt: string,
    images?: AgentImage[],
  ): Promise<void> {
    const provider = this.providerRegistry.getProvider(providerId);
    if (!provider) return;

    try {
      const model = this.uiManager.agentWorldView.getSelectedModel(agentId);
      const repository = this.uiManager.agentWorldView.getSelectedRepo(agentId);
      const instance = await provider.launchAgent({
        prompt,
        images,
        model,
        repository,
      });
      this.log(`${TAG} Launched ${instance.id}: ${instance.name}`);

      this.store.clearDeletedExternalId(instance.id);
      const topic = this.createTopicFromInstance(agentId, instance);
      if (!topic) return;
      this.store.selectTopic(agentId, topic.id);
      this.store.updateAgentStatus(agentId, AgentStatus.Working, null);
      this.startPollingActiveInstances();
    } catch (e) {
      this.log(`${TAG} Failed to launch agent: ${e}`);
      this.store.addMessage(agentId, "agent", `Failed to launch: ${e}`);
    }
  }

  private async handleFollowup(
    providerId: string,
    agentId: string,
    externalId: string,
    prompt: string,
    images?: AgentImage[],
  ): Promise<void> {
    const provider = this.providerRegistry.getProvider(providerId);
    if (!provider) return;

    try {
      if (providerId === "bridge") {
        const bridgeUuid = this.bridgeAgentUuid(agentId);
        const model = this.store.getSelectedModel(agentId);
        await this.bridgeProvider.sendFollowup(
          externalId,
          prompt,
          images,
          bridgeUuid,
          model,
        );
      } else {
        await provider.sendFollowup(externalId, prompt, images);
      }
      this.log(`${TAG} Sent followup to ${externalId}`);

      this.invalidateConversationHistory(externalId, false);
      this.store.updateAgentStatus(agentId, AgentStatus.Working, null);

      const topic = this.store.getTopicByExternalId(externalId);
      if (topic) {
        this.store.updateTopicMetadata(topic.id, {
          status: AgentInstanceStatus.Running,
        });
      }
      this.startPollingActiveInstances();
    } catch (e) {
      this.log(`${TAG} Failed to send followup: ${e}`);
      this.store.addMessage(agentId, "agent", `Failed to send followup: ${e}`);
    }
  }

  private async handleBridgeNewConversation(
    agentId: string,
    prompt: string,
    images?: AgentImage[],
  ): Promise<void> {
    const bridgeUuid = this.bridgeAgentUuid(agentId);
    const placeholderTopicId = this.store.getActiveTopicId(agentId);
    const workspace = this.store.getSelectedRepo(agentId);
    const model = this.store.getSelectedModel(agentId);

    try {
      const conversation = await this.bridgeProvider.createConversation(
        prompt,
        bridgeUuid,
        workspace,
        images,
        model,
      );
      this.log(
        `${TAG} Created bridge conversation ${conversation.id} and sent first message`,
      );

      const realtimeDuplicate = this.store.getTopicByExternalId(
        conversation.id,
      );
      if (realtimeDuplicate) {
        this.store.removeTopic(agentId, realtimeDuplicate.id);
      }

      const placeholder = placeholderTopicId
        ? this.store.getTopicById(placeholderTopicId)
        : undefined;

      if (placeholder && !placeholder.externalId) {
        const meta: Record<string, string> = {
          status: AgentInstanceStatus.Running,
        };
        if (conversation.workspace) meta.workspace = conversation.workspace;
        this.store.updateTopic(agentId, placeholder.id, {
          title: conversation.title,
          externalId: conversation.id,
          metadata: meta,
        });

        if (this.store.getActiveTopicId(agentId) !== placeholder.id) {
          this.store.selectTopic(agentId, placeholder.id);
        }
      } else {
        const instance: AgentInstance = {
          id: conversation.id,
          name: conversation.title,
          status: AgentInstanceStatus.Running,
          workspace: conversation.workspace ?? undefined,
          createdAt: conversation.created_at,
        };

        const topic = this.createTopicFromInstance(agentId, instance);
        if (!topic) return;

        this.store.selectTopic(agentId, topic.id);
      }

      this.store.updateAgentStatus(agentId, AgentStatus.Working, null);
      this.subscribeBridgeRealtime(conversation.id, agentId);
    } catch (e) {
      this.log(`${TAG} Failed to create bridge conversation: ${e}`);
      this.store.addMessage(
        agentId,
        "agent",
        `Failed to start conversation: ${e}`,
      );
    }
  }

  private startPollingActiveInstances(): void {
    this.pollingManager.startPollingActiveInstances();
  }

  private startPollingDiscovery(): void {
    this.pollingManager.startPollingDiscovery();
  }

  private async decodeBridgeImages(
    images: BridgeImagePayload[],
  ): Promise<Texture[]> {
    const textures: Texture[] = [];
    for (const img of images) {
      try {
        const texture = await decodeBase64ToTexture(img.data);
        textures.push(texture);
      } catch (e) {
        this.log(`${TAG} Failed to decode bridge image: ${e}`);
      }
    }
    return textures;
  }

  private handleMockTask(agentId: string, prompt: string): void {
    const taskId = `mock-task-${Date.now()}`;
    const createdAt = Date.now();
    this.store.updateAgentStatus(agentId, AgentStatus.Working, taskId);
    this.store.upsertTask({
      id: taskId,
      agentId,
      prompt,
      status: "running",
      result: null,
      createdAt,
    });
    this.log(`${TAG} Mock task ${taskId} assigned to ${agentId}`);

    const delayEvent = this.createEvent("DelayedCallbackEvent");
    delayEvent.bind(() => {
      const result = `Mock result for: "${prompt}"`;
      this.store.upsertTask({
        id: taskId,
        agentId,
        prompt,
        status: "completed",
        result,
        createdAt,
      });
      this.store.updateAgentStatus(agentId, AgentStatus.Idle, null);
      this.store.addMessage(agentId, "agent", result);
      this.log(`${TAG} Mock task ${taskId} completed`);
    });
    (delayEvent as DelayedCallbackEvent).reset(3);
  }
}
