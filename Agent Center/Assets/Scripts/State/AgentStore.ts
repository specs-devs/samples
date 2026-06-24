import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { Agent, AgentStatus, Task, ChatMessage, ChatTopic, RepoEntry } from "../Types";
export type { RepoEntry };

interface AgentConfig {
  models: string[];
  modelIndex: number;
  repos: RepoEntry[];
  repoIndex: number;
  themeIndex: number;
  smartFeatures: boolean[];
}

export interface PendingDeletion {
  externalId: string;
  provider: string;
  bridgeAgentUuid?: string;
}

interface HydratedMessageInput {
  externalId?: string;
  sender: "user" | "agent" | "system";
  content: string;
  timestamp?: number;
  images?: Texture[];
}

export class AgentStore {
  private agents: Map<string, Agent> = new Map();
  private cachedAgentArray: Agent[] | null = null;
  private tasks: Map<string, Task> = new Map();
  private messages: Map<string, ChatMessage[]> = new Map();
  private topics: Map<string, ChatTopic[]> = new Map();
  private topicById: Map<string, ChatTopic> = new Map();
  private topicByExternalId: Map<string, ChatTopic> = new Map();
  private activeTopicId: Map<string, string> = new Map();
  private selectedAgentId: string | null = null;
  private unreadTopicIds: Set<string> = new Set();
  private viewedTimestamps: Map<string, number> = new Map();
  private agentConfigs: Map<string, AgentConfig> = new Map();
  private messageCounter = 0;
  private topicCounter = 0;

  private lastActiveExternalIds: Map<string, string> = new Map();
  private pendingDeletions: Map<string, PendingDeletion> = new Map();
  private externalMessageIdsByTopic: Map<string, Set<string>> = new Map();
  private static readonly EMPTY_IDS: Set<string> = new Set();
  private static readonly SMART_FEATURE_COUNT = 5;
  private conversationsLoading: Set<string> = new Set();

  constructor() {
    this.loadViewedTimestamps();
    this.loadThemePreferences();
    this.loadSmartFeaturePreferences();
    this.loadLastActiveTopics();
    this.loadDeletedExternalIds();
  }

  public readonly onAgentsChanged = new Event<Agent[]>();
  public readonly onAgentStatusChanged = new Event<{ agentId: string; status: AgentStatus }>();
  public readonly onTaskUpdated = new Event<Task>();
  public readonly onAgentSelected = new Event<Agent | null>();
  public readonly onMessageAdded = new Event<ChatMessage>();
  /** Fires only for non-silent agent messages (excludes replay/history loads). */
  public readonly onAgentMessageReceived = new Event<ChatMessage>();
  public readonly onTopicsChanged = new Event<{
    agentId: string;
    topics: ChatTopic[];
  }>();
  public readonly onTopicSelected = new Event<{
    agentId: string;
    topicId: string;
  }>();
  public readonly onConversationsLoadingChanged = new Event<{
    agentId: string;
    loading: boolean;
  }>();
  /** Fires when a topic's status transitions from a working state to FINISHED. */
  public readonly onTopicCompleted = new Event<{
    agentId: string;
    topicId: string;
  }>();

  setAgents(agents: Agent[]): void {
    this.agents.clear();
    for (const agent of agents) {
      this.agents.set(agent.id, agent);
    }
    this.invalidateAgentCache();
    this.onAgentsChanged.invoke(this.getAgents());
  }

  addAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
    this.invalidateAgentCache();
    this.onAgentsChanged.invoke(this.getAgents());
  }

  updateAgentStatus(
    agentId: string,
    status: AgentStatus,
    currentTaskId: string | null,
  ): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      agent.currentTaskId = currentTaskId;
      this.onAgentStatusChanged.invoke({ agentId, status });
    }
  }

  updateAgentName(agentId: string, name: string): void {
    const agent = this.agents.get(agentId);
    if (agent && agent.name !== name) {
      agent.name = name;
      this.onAgentsChanged.invoke(this.getAgents());
    }
  }

  removeAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.invalidateAgentCache();

    const agentTopics = this.topics.get(agentId) ?? [];
    for (const topic of agentTopics) {
      this.messages.delete(topic.id);
      this.externalMessageIdsByTopic.delete(topic.id);
      this.unreadTopicIds.delete(topic.id);
      this.topicById.delete(topic.id);
      if (topic.externalId) {
        this.topicByExternalId.delete(topic.externalId);
      }
    }
    this.topics.delete(agentId);
    this.activeTopicId.delete(agentId);
    this.agentConfigs.delete(agentId);

    if (this.selectedAgentId === agentId) {
      this.selectedAgentId = null;
      this.onAgentSelected.invoke(null);
    }

    this.onAgentsChanged.invoke(this.getAgents());
  }

  upsertTask(task: Task): void {
    this.tasks.set(task.id, task);
    this.onTaskUpdated.invoke(task);
  }

  selectAgent(agentId: string | null): void {
    this.selectedAgentId = agentId;
    const agent = agentId ? (this.agents.get(agentId) ?? null) : null;
    this.onAgentSelected.invoke(agent);
  }

  addTopic(
    agentId: string,
    title: string,
    externalId?: string,
    metadata?: Record<string, string>,
    setActive: boolean = true,
    createdAt?: number,
  ): ChatTopic | null {
    if (externalId && this.pendingDeletions.has(externalId)) {
      print(`[AgentStore] Blocked addTopic for deleted externalId: ${externalId}`);
      return null;
    }

    const now = Date.now();
    const topic: ChatTopic = {
      id: `topic-${++this.topicCounter}`,
      agentId,
      title,
      createdAt: createdAt ?? now,
      lastActivityAt: now,
      externalId,
      metadata,
    };

    let agentTopics = this.topics.get(agentId);
    if (!agentTopics) {
      agentTopics = [];
      this.topics.set(agentId, agentTopics);
    }
    agentTopics.push(topic);

    this.topicById.set(topic.id, topic);
    if (topic.externalId) {
      this.topicByExternalId.set(topic.externalId, topic);
    }

    if (setActive) {
      this.activeTopicId.set(agentId, topic.id);
    }

    this.onTopicsChanged.invoke({ agentId, topics: agentTopics });
    return topic;
  }

  selectTopic(agentId: string, topicId: string): void {
    const previousTopicId = this.activeTopicId.get(agentId) ?? null;
    const topicChanged = previousTopicId !== topicId;
    if (topicChanged) {
      this.activeTopicId.set(agentId, topicId);
    }
    const wasUnread = this.unreadTopicIds.delete(topicId);

    const topic = this.getTopicById(topicId);
    if (topic?.externalId) {
      this.viewedTimestamps.set(topic.externalId, Date.now());
      this.saveViewedTimestamps();
      this.lastActiveExternalIds.set(agentId, topic.externalId);
      this.saveLastActiveTopics();
    }

    if (topicChanged) {
      this.onTopicSelected.invoke({ agentId, topicId });
    }
    if (wasUnread) {
      this.onTopicsChanged.invoke({
        agentId,
        topics: this.topics.get(agentId) ?? [],
      });
    }
  }

  removeTopic(agentId: string, topicId: string): void {
    const agentTopics = this.topics.get(agentId);
    if (agentTopics) {
      const idx = agentTopics.findIndex((t) => t.id === topicId);
      if (idx !== -1) {
        const removed = agentTopics[idx];
        agentTopics.splice(idx, 1);
        this.messages.delete(topicId);
        this.externalMessageIdsByTopic.delete(topicId);
        this.unreadTopicIds.delete(topicId);
        this.topicById.delete(topicId);
        if (removed.externalId) {
          this.topicByExternalId.delete(removed.externalId);
        }

        if (this.activeTopicId.get(agentId) === topicId) {
          this.activeTopicId.delete(agentId);
        }

        if (
          removed.externalId &&
          this.lastActiveExternalIds.get(agentId) === removed.externalId
        ) {
          this.lastActiveExternalIds.delete(agentId);
          this.saveLastActiveTopics();
        }

        this.onTopicsChanged.invoke({ agentId, topics: agentTopics });
      }
    }
  }

  getTopicByExternalId(externalId: string): ChatTopic | undefined {
    return this.topicByExternalId.get(externalId);
  }

  updateTopicMetadata(topicId: string, metadata: Record<string, string>): void {
    this.updateTopic(undefined, topicId, { metadata });
  }

  updateTopic(
    agentId: string | undefined,
    topicId: string,
    updates: Partial<ChatTopic>,
  ): void {
    // If agentId is not provided, try to find it from the topic
    let targetAgentId = agentId;
    let topic: ChatTopic | undefined;

    if (!targetAgentId) {
      topic = this.getTopicById(topicId);
      if (topic) targetAgentId = topic.agentId;
    }

    if (!targetAgentId) return;

    const topics = this.topics.get(targetAgentId);
    if (!topics) return;

    if (!topic) {
      topic = topics.find((t) => t.id === topicId);
    }

    if (topic) {
      const prevStatus = topic.metadata?.status;

      // Merge metadata if provided
      if (updates.metadata) {
        topic.metadata = { ...topic.metadata, ...updates.metadata };
      }

      // Update other fields
      if (updates.title !== undefined) topic.title = updates.title;
      if (updates.externalId !== undefined) {
        if (topic.externalId) {
          this.topicByExternalId.delete(topic.externalId);
        }
        topic.externalId = updates.externalId;
        if (topic.externalId) {
          this.topicByExternalId.set(topic.externalId, topic);
        }
      }
      if (updates.lastActivityAt !== undefined)
        topic.lastActivityAt = updates.lastActivityAt;

      const newStatus = topic.metadata?.status;
      const wasWorking = prevStatus === "CREATING" || prevStatus === "RUNNING";
      if (wasWorking && newStatus === "FINISHED") {
        this.onTopicCompleted.invoke({
          agentId: targetAgentId,
          topicId: topic.id,
        });
      }

      this.onTopicsChanged.invoke({
        agentId: targetAgentId,
        topics: topics,
      });
    }
  }

  getTopicsForAgent(agentId: string): ChatTopic[] {
    return this.topics.get(agentId) ?? [];
  }

  setConversationsLoading(agentId: string, loading: boolean): void {
    const was = this.conversationsLoading.has(agentId);
    if (loading === was) return;
    if (loading) {
      this.conversationsLoading.add(agentId);
    } else {
      this.conversationsLoading.delete(agentId);
    }
    this.onConversationsLoadingChanged.invoke({ agentId, loading });
  }

  isConversationsLoading(agentId: string): boolean {
    return this.conversationsLoading.has(agentId);
  }

  getActiveTopicId(agentId: string): string | null {
    return this.activeTopicId.get(agentId) ?? null;
  }

  getActiveTopic(agentId: string): ChatTopic | undefined {
    const topicId = this.activeTopicId.get(agentId);
    return topicId ? this.topicById.get(topicId) : undefined;
  }

  clearActiveTopic(agentId: string): void {
    this.activeTopicId.delete(agentId);
  }

  getMessagesForTopic(topicId: string): ChatMessage[] {
    return this.messages.get(topicId) ?? [];
  }

  clearMessagesForTopic(topicId: string): void {
    this.messages.delete(topicId);
    this.externalMessageIdsByTopic.delete(topicId);
  }

  replaceMessagesForTopic(
    agentId: string,
    topicId: string,
    hydratedMessages: HydratedMessageInput[],
  ): void {
    this.clearMessagesForTopic(topicId);

    if (hydratedMessages.length === 0) {
      return;
    }

    const list: ChatMessage[] = [];
    let externalIds: Set<string> | null = null;

    for (const input of hydratedMessages) {
      list.push({
        id: `msg-${++this.messageCounter}`,
        externalId: input.externalId,
        agentId,
        topicId,
        sender: input.sender,
        content: input.content,
        timestamp: input.timestamp ?? Date.now(),
        images: input.images,
      });

      if (input.externalId) {
        if (!externalIds) {
          externalIds = new Set<string>();
        }
        externalIds.add(input.externalId);
      }
    }

    this.messages.set(topicId, list);
    if (externalIds && externalIds.size > 0) {
      this.externalMessageIdsByTopic.set(topicId, externalIds);
    }
  }

  getAgents(): Agent[] {
    if (!this.cachedAgentArray) {
      this.cachedAgentArray = Array.from(this.agents.values());
    }
    return this.cachedAgentArray;
  }

  private invalidateAgentCache(): void {
    this.cachedAgentArray = null;
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  getSelectedAgent(): Agent | null {
    return this.selectedAgentId
      ? (this.agents.get(this.selectedAgentId) ?? null)
      : null;
  }

  getSelectedAgentId(): string | null {
    return this.selectedAgentId;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  addMessage(
    agentId: string,
    sender: "user" | "agent" | "system",
    content: string,
    images?: Texture[],
  ): ChatMessage {
    let topicId = this.activeTopicId.get(agentId);
    if (!topicId) {
      const topic = this.addTopic(agentId, "New Chat");
      if (!topic) {
        print("[AgentStore] Failed to create topic for message");
        return { id: "", agentId, topicId: "", sender, content, timestamp: Date.now() };
      }
      topicId = topic.id;
    }

    return this.insertMessage(agentId, topicId, sender, content, false, images);
  }

  addMessageToTopic(
    agentId: string,
    topicId: string,
    sender: "user" | "agent" | "system",
    content: string,
    silent: boolean = false,
    externalId?: string,
    images?: Texture[],
  ): ChatMessage {
    return this.insertMessage(agentId, topicId, sender, content, silent, images, externalId);
  }

  getExternalMessageIds(topicId: string): Set<string> {
    return this.externalMessageIdsByTopic.get(topicId) ?? AgentStore.EMPTY_IDS;
  }

  private insertMessage(
    agentId: string,
    topicId: string,
    sender: "user" | "agent" | "system",
    content: string,
    silent: boolean = false,
    images?: Texture[],
    externalId?: string,
  ): ChatMessage {
    const msg: ChatMessage = {
      id: `msg-${++this.messageCounter}`,
      externalId,
      agentId,
      topicId,
      sender,
      content,
      timestamp: Date.now(),
      images,
    };
    let list = this.messages.get(topicId);
    if (!list) {
      list = [];
      this.messages.set(topicId, list);
    }
    list.push(msg);

    if (externalId) {
      let idSet = this.externalMessageIdsByTopic.get(topicId);
      if (!idSet) {
        idSet = new Set<string>();
        this.externalMessageIdsByTopic.set(topicId, idSet);
      }
      idSet.add(externalId);
    }

    if (sender === "agent" && !silent) {
      this.markTopicActivity(agentId, topicId);
      this.onAgentMessageReceived.invoke(msg);
    }

    this.onMessageAdded.invoke(msg);
    return msg;
  }

  private markTopicActivity(agentId: string, topicId: string): void {
    const topic = this.topicById.get(topicId);
    if (!topic) return;
    const agentTopics = this.topics.get(agentId);

    topic.lastActivityAt = Date.now();

    const isViewed =
      this.selectedAgentId === agentId &&
      this.activeTopicId.get(agentId) === topicId;

    if (!isViewed) {
      const lastViewed = topic.externalId
        ? this.viewedTimestamps.get(topic.externalId)
        : undefined;
      if (lastViewed === undefined || lastViewed < topic.lastActivityAt) {
        this.unreadTopicIds.add(topicId);
      }
    }

    this.onTopicsChanged.invoke({
      agentId,
      topics: agentTopics ?? [],
    });
  }

  markTopicUnreadIfNew(topicId: string): void {
    const topic = this.getTopicById(topicId);
    if (!topic?.externalId) return;

    const lastViewed = this.viewedTimestamps.get(topic.externalId);
    if (lastViewed !== undefined) return;

    this.unreadTopicIds.add(topicId);
    this.onTopicsChanged.invoke({
      agentId: topic.agentId,
      topics: this.topics.get(topic.agentId) ?? [],
    });
  }

  getUnreadTopicIds(agentId: string): Set<string> {
    const agentTopics = this.topics.get(agentId) ?? [];
    const result = new Set<string>();
    for (const topic of agentTopics) {
      if (this.unreadTopicIds.has(topic.id)) {
        result.add(topic.id);
      }
    }
    return result;
  }

  getMessagesForAgent(agentId: string): ChatMessage[] {
    const topicId = this.activeTopicId.get(agentId);
    return topicId ? (this.messages.get(topicId) ?? []) : [];
  }

  private getOrCreateConfig(agentId: string): AgentConfig {
    let config = this.agentConfigs.get(agentId);
    if (!config) {
      config = {
        models: [],
        modelIndex: 0,
        repos: [],
        repoIndex: 0,
        themeIndex: this.nextAvailableThemeIndex(),
        smartFeatures: new Array(AgentStore.SMART_FEATURE_COUNT).fill(false),
      };
      this.agentConfigs.set(agentId, config);
    }
    return config;
  }

  private nextAvailableThemeIndex(): number {
    const themeCount = 6;
    const usedIndices = new Set<number>();
    for (const config of this.agentConfigs.values()) {
      usedIndices.add(config.themeIndex);
    }
    for (let i = 0; i < themeCount; i++) {
      const candidate = (5 + i) % themeCount;
      if (!usedIndices.has(candidate)) return candidate;
    }
    return this.agentConfigs.size % themeCount;
  }

  setModels(agentId: string, models: string[]): void {
    const config = this.getOrCreateConfig(agentId);
    config.models = models;
    config.modelIndex = 0;
  }

  getModels(agentId: string): string[] {
    return this.agentConfigs.get(agentId)?.models ?? [];
  }

  getSelectedModel(agentId: string): string | undefined {
    const config = this.agentConfigs.get(agentId);
    return config?.models[config.modelIndex];
  }

  setModelIndex(agentId: string, index: number): void {
    const config = this.getOrCreateConfig(agentId);
    config.modelIndex = index;
  }

  setRepos(agentId: string, repos: RepoEntry[]): void {
    const config = this.getOrCreateConfig(agentId);
    const savedPath = this.loadSavedRepoPath(agentId);
    config.repos = repos;
    config.repoIndex = 0;
    if (savedPath) {
      const idx = repos.findIndex((r) => r.path === savedPath);
      if (idx >= 0) config.repoIndex = idx;
    }
  }

  getRepos(agentId: string): RepoEntry[] {
    return this.agentConfigs.get(agentId)?.repos ?? [];
  }

  getRepoNames(agentId: string): string[] {
    return this.getRepos(agentId).map((r) => r.name);
  }

  getSelectedRepo(agentId: string): string | undefined {
    const config = this.agentConfigs.get(agentId);
    return config?.repos[config.repoIndex]?.path;
  }

  getSelectedRepoName(agentId: string): string | undefined {
    const config = this.agentConfigs.get(agentId);
    return config?.repos[config.repoIndex]?.name;
  }

  setRepoIndex(agentId: string, index: number): void {
    const config = this.getOrCreateConfig(agentId);
    config.repoIndex = index;
    const entry = config.repos[index];
    if (entry) {
      this.saveRepoSelection(agentId, entry.path);
    }
  }

  getThemeIndex(agentId: string): number {
    return this.getOrCreateConfig(agentId).themeIndex;
  }

  setThemeIndex(agentId: string, index: number): void {
    const config = this.getOrCreateConfig(agentId);
    config.themeIndex = index;
    this.saveThemePreferences();
  }

  setSmartFeatureEnabled(agentId: string, index: number, enabled: boolean): void {
    const config = this.getOrCreateConfig(agentId);
    config.smartFeatures[index] = enabled;
    this.saveSmartFeaturePreferences();
  }

  isSmartFeatureEnabled(agentId: string, index: number): boolean {
    return this.getOrCreateConfig(agentId).smartFeatures[index] ?? false;
  }

  getSmartFeatures(agentId: string): boolean[] {
    return [...this.getOrCreateConfig(agentId).smartFeatures];
  }

  isSmartSummariesEnabled(agentId: string): boolean {
    return this.isSmartFeatureEnabled(agentId, 0);
  }

  isPromptSuggestionsEnabled(agentId: string): boolean {
    return this.isSmartFeatureEnabled(agentId, 1);
  }

  isTopicRenamingEnabled(agentId: string): boolean {
    return this.isSmartFeatureEnabled(agentId, 2);
  }

  isPermissionExplainerEnabled(agentId: string): boolean {
    return this.isSmartFeatureEnabled(agentId, 3);
  }

  getTopicById(topicId: string): ChatTopic | undefined {
    return this.topicById.get(topicId);
  }

  private loadViewedTimestamps(): void {
    try {
      const store = global.persistentStorageSystem.store;
      const json = store.getString("agentmanager_topic_viewed");
      if (json && json.length > 0) {
        const parsed = JSON.parse(json) as Record<string, number>;
        for (const [key, value] of Object.entries(parsed)) {
          this.viewedTimestamps.set(key, value);
        }
      }
    } catch (e) {
      print(`[AgentStore] Error loading viewed timestamps: ${e}`);
    }
  }

  private saveViewedTimestamps(): void {
    try {
      const store = global.persistentStorageSystem.store;
      const obj: Record<string, number> = {};
      for (const [key, value] of this.viewedTimestamps) {
        obj[key] = value;
      }
      store.putString("agentmanager_topic_viewed", JSON.stringify(obj));
    } catch (e) {
      print(`[AgentStore] Error saving viewed timestamps: ${e}`);
    }
  }

  private loadThemePreferences(): void {
    try {
      const store = global.persistentStorageSystem.store;
      const json = store.getString("agentmanager_theme_prefs");
      if (json && json.length > 0) {
        const parsed = JSON.parse(json) as Record<string, number>;
        for (const [agentId, themeIndex] of Object.entries(parsed)) {
          const config = this.getOrCreateConfig(agentId);
          config.themeIndex = themeIndex;
        }
      }
    } catch (e) {
      print(`[AgentStore] Error loading theme preferences: ${e}`);
    }
  }

  private saveThemePreferences(): void {
    try {
      const store = global.persistentStorageSystem.store;
      const obj: Record<string, number> = {};
      for (const [agentId, config] of this.agentConfigs) {
        obj[agentId] = config.themeIndex;
      }
      store.putString("agentmanager_theme_prefs", JSON.stringify(obj));
    } catch (e) {
      print(`[AgentStore] Error saving theme preferences: ${e}`);
    }
  }

  private loadSmartFeaturePreferences(): void {
    try {
      const store = global.persistentStorageSystem.store;
      const json = store.getString("agentmanager_smart_feature_prefs");
      if (json && json.length > 0) {
        const parsed = JSON.parse(json) as Record<string, boolean[]>;
        for (const [agentId, features] of Object.entries(parsed)) {
          const config = this.getOrCreateConfig(agentId);
          for (let i = 0; i < features.length && i < AgentStore.SMART_FEATURE_COUNT; i++) {
            config.smartFeatures[i] = features[i];
          }
        }
      }
    } catch (e) {
      print(`[AgentStore] Error loading smart feature preferences: ${e}`);
    }
  }

  private saveSmartFeaturePreferences(): void {
    try {
      const store = global.persistentStorageSystem.store;
      const obj: Record<string, boolean[]> = {};
      for (const [agentId, config] of this.agentConfigs) {
        obj[agentId] = config.smartFeatures;
      }
      store.putString("agentmanager_smart_feature_prefs", JSON.stringify(obj));
    } catch (e) {
      print(`[AgentStore] Error saving smart feature preferences: ${e}`);
    }
  }

  restoreLastActiveTopic(agentId: string): void {
    const externalId = this.lastActiveExternalIds.get(agentId);
    if (!externalId) return;

    const topic = this.getTopicByExternalId(externalId);
    if (!topic) return;

    this.activeTopicId.set(agentId, topic.id);
    this.onTopicSelected.invoke({ agentId, topicId: topic.id });
    this.onTopicsChanged.invoke({
      agentId,
      topics: this.topics.get(agentId) ?? [],
    });
  }

  private loadLastActiveTopics(): void {
    try {
      const store = global.persistentStorageSystem.store;
      const json = store.getString("agentmanager_last_topic");
      if (json && json.length > 0) {
        const parsed = JSON.parse(json) as Record<string, string>;
        for (const [agentId, externalId] of Object.entries(parsed)) {
          this.lastActiveExternalIds.set(agentId, externalId);
        }
      }
    } catch (e) {
      print(`[AgentStore] Error loading last active topics: ${e}`);
    }
  }

  private saveLastActiveTopics(): void {
    try {
      const store = global.persistentStorageSystem.store;
      const obj: Record<string, string> = {};
      for (const [agentId, externalId] of this.lastActiveExternalIds) {
        obj[agentId] = externalId;
      }
      store.putString("agentmanager_last_topic", JSON.stringify(obj));
    } catch (e) {
      print(`[AgentStore] Error saving last active topics: ${e}`);
    }
  }

  isExternalIdDeleted(externalId: string): boolean {
    return this.pendingDeletions.has(externalId);
  }

  markExternalIdDeleted(
    externalId: string,
    provider: string,
    bridgeAgentUuid?: string,
  ): void {
    this.pendingDeletions.set(externalId, {
      externalId,
      provider,
      bridgeAgentUuid,
    });
    this.saveDeletedExternalIds();
  }

  clearDeletedExternalId(externalId: string): void {
    if (this.pendingDeletions.delete(externalId)) {
      this.saveDeletedExternalIds();
    }
  }

  getPendingDeletions(): PendingDeletion[] {
    return Array.from(this.pendingDeletions.values());
  }

  private loadSavedRepoPath(agentId: string): string | undefined {
    try {
      const store = global.persistentStorageSystem.store;
      const json = store.getString("agentmanager_repo_prefs");
      if (json && json.length > 0) {
        const parsed = JSON.parse(json) as Record<string, string>;
        return parsed[agentId];
      }
    } catch (e) {
      print(`[AgentStore] Error loading repo preferences: ${e}`);
    }
    return undefined;
  }

  private saveRepoSelection(agentId: string, repoPath: string): void {
    try {
      const store = global.persistentStorageSystem.store;
      let existing: Record<string, string> = {};
      const json = store.getString("agentmanager_repo_prefs");
      if (json && json.length > 0) {
        existing = JSON.parse(json) as Record<string, string>;
      }
      existing[agentId] = repoPath;
      store.putString("agentmanager_repo_prefs", JSON.stringify(existing));
    } catch (e) {
      print(`[AgentStore] Error saving repo preferences: ${e}`);
    }
  }

  private loadDeletedExternalIds(): void {
    try {
      const store = global.persistentStorageSystem.store;
      const json = store.getString("agentmanager_deleted_instances");
      if (json && json.length > 0) {
        const parsed = JSON.parse(json) as unknown;
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            if (typeof entry === "string") {
              // Legacy format: flat string array — keep as tombstone with unknown provider
              this.pendingDeletions.set(entry, {
                externalId: entry,
                provider: "unknown",
              });
            } else if (entry && typeof entry === "object" && entry.externalId) {
              const d = entry as PendingDeletion;
              this.pendingDeletions.set(d.externalId, d);
            }
          }
        }
        print(
          `[AgentStore] Loaded ${this.pendingDeletions.size} pending deletions`,
        );
      }
    } catch (e) {
      print(`[AgentStore] Error loading deleted external IDs: ${e}`);
    }
  }

  private saveDeletedExternalIds(): void {
    try {
      const store = global.persistentStorageSystem.store;
      const entries: PendingDeletion[] = Array.from(
        this.pendingDeletions.values(),
      );
      store.putString(
        "agentmanager_deleted_instances",
        JSON.stringify(entries),
      );
    } catch (e) {
      print(`[AgentStore] Error saving deleted external IDs: ${e}`);
    }
  }

  clearAllData(): void {
    this.agents.clear();
    this.invalidateAgentCache();
    this.tasks.clear();
    this.messages.clear();
    this.externalMessageIdsByTopic.clear();
    this.topics.clear();
    this.topicById.clear();
    this.topicByExternalId.clear();
    this.activeTopicId.clear();
    this.selectedAgentId = null;
    this.unreadTopicIds.clear();
    this.viewedTimestamps.clear();
    this.agentConfigs.clear();
    this.lastActiveExternalIds.clear();
    this.pendingDeletions.clear();

    const store = global.persistentStorageSystem.store;
    const keys = [
      "agentmanager_topic_viewed",
      "agentmanager_theme_prefs",
      "agentmanager_smart_feature_prefs",
      "agentmanager_last_topic",
      "agentmanager_repo_prefs",
      "agentmanager_deleted_instances",
      "bridge_paired_agent_ids",
    ];
    for (const key of keys) {
      store.putString(key, "");
    }

    print("[AgentStore] All data cleared");
    this.onAgentsChanged.invoke([]);
    this.onAgentSelected.invoke(null);
  }
}
