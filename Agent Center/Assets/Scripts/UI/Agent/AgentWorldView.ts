import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { Agent, AgentStatus, ChatMessage, ChatTopic } from "../../Types";
import { AgentStore, RepoEntry } from "../../State/AgentStore";
import { AgentObject } from "./AgentObject";
import { AgentChatPanel } from "../Chat/AgentChatPanel";
import { AgentManagerPanel } from "../AgentManagerPanel";
import { TranslateEventArg } from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation";
import {
  setTimeout,
  clearTimeout,
  CancelToken,
} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import { THEME_KEYS } from "../Shared/UIConstants";
import { createAudioComponent } from "../Shared/UIBuilders";
import { AgentButtonBar } from "./AgentButtonBar";
import {
  RobotState,
  STATUS_TO_ROBOT_STATE,
  TOPIC_STATUS_TO_ROBOT_STATE,
} from "../Shared/RobotTypes";
import { PermissionPayload } from "../../Api/Supabase/Bridge/BridgeTypes";

const ERROR_STATE_SFX: AudioTrackAsset = requireAsset(
  "../../../Audio/errorState.wav",
) as AudioTrackAsset;
const DETACH_DOCK_SFX: AudioTrackAsset = requireAsset(
  "../../../Audio/detachDock.wav",
) as AudioTrackAsset;

const DRAG_THRESHOLD = 4;
const DETACH_THRESHOLD = 40;
const PINCH_HOLD_DURATION_MS = 400;
const TAG = "[AgentWorldView]";

interface AgentNode {
  agentObject: AgentObject;
  sceneObject: SceneObject;
}

export class AgentWorldView {
  private store: AgentStore;
  private parentObject: SceneObject;
  private explosionPrefab: ObjectPrefab;
  private dockedNodes: Map<string, AgentNode> = new Map();
  private worldClones: AgentNode[] = [];
  private clonesByAgentId: Map<string, AgentNode[]> = new Map();
  private chatPanel: AgentChatPanel;
  private panel: AgentManagerPanel | null = null;
  private extraBars: AgentButtonBar[] = [];
  private lastTappedNode: AgentNode | null = null;
  private activeDockedAgentId = "";
  private pendingSpawns: CancelToken[] = [];
  private audioComponent: AudioComponent;
  private isInternetAvailable = true;

  public readonly onOpenPanelRequested = new Event<void>();
  public readonly onDisconnectRequested = new Event<string>();
  public readonly onDeleteRequested = new Event<string>();
  public readonly onClearConversationsRequested = new Event<string>();
  public readonly onAddWorkspaceRequested = new Event<string>();
  public readonly onDiscoveredWorkspaceSelected = new Event<{
    agentId: string;
    path: string;
    name: string;
  }>();
  public readonly onPermissionDecision = new Event<{
    agentId: string;
    decision: "allow" | "allow_session" | "deny";
  }>();
  public readonly onSmartFeatureChanged = new Event<{
    index: number;
    enabled: boolean;
  }>();
  public readonly onSuggestionTapped = new Event<string>();
  public readonly onOpenInCliRequested = new Event<string>();
  public readonly onSettingsViewToggled = new Event<boolean>();

  constructor(
    store: AgentStore,
    parentObject: SceneObject,
    explosionPrefab: ObjectPrefab,
  ) {
    this.store = store;
    this.parentObject = parentObject;
    this.explosionPrefab = explosionPrefab;

    const panelObj = global.scene.createSceneObject("AgentChatPanel");
    panelObj.setParent(parentObject);
    this.chatPanel = panelObj.createComponent(
      AgentChatPanel.getTypeName(),
    ) as AgentChatPanel;
    this.chatPanel.setStore(store);

    this.store.onAgentsChanged.add((agents) => this.syncAgents(agents));
    this.store.onAgentStatusChanged.add(({ agentId }) => {
      const agent = this.store.getAgent(agentId);
      if (agent) {
        this.forEachAgentObject(agentId, (ao) => ao.setAgent(agent));
        this.hideIfSelectedAgentUnavailable();
        this.syncButtonBarStatus(agentId, agent);
      }
    });
    this.store.onAgentSelected.add((agent) => this.updateSelection(agent));
    this.store.onMessageAdded.add((msg) => this.onMessageAdded(msg));

    this.store.onTopicsChanged.add(({ agentId }) => {
      this.refreshAgentTopics(agentId);
      if (this.store.getSelectedAgentId() === agentId) {
        // Use the tracked agent's active topic so clones keep their own title
        // instead of being overwritten by the store's (possibly different) topic.
        const tracked = this.chatPanel.getTrackAgent();
        const topicId = tracked
          ? tracked.getActiveTopic()
          : this.store.getActiveTopicId(agentId);
        const topic = topicId
          ? this.store.getTopicById(topicId)
          : this.store.getActiveTopic(agentId);
        this.chatPanel.setTopicTitle(topic?.title ?? "New Chat");
      }
    });

    this.store.onConversationsLoadingChanged.add(({ agentId, loading }) => {
      this.forEachAgentObject(agentId, (ao) =>
        ao.setConversationsLoading(loading),
      );
    });

    this.store.onTopicSelected.add(({ agentId, topicId }) => {
      // Only update the docked node. Clones set their own _activeTopicId
      // directly in their onTopicClicked / onNewChatRequested handlers before
      // calling selectTopic, so they must not be overwritten here — doing so
      // would cause docked-agent or controller-driven topic changes to bleed
      // into clones that should stay on the topic they were created from.
      const dockedNode = this.dockedNodes.get(agentId);
      if (dockedNode) {
        dockedNode.agentObject.setActiveTopic(topicId);
      }

      this.refreshAgentTopics(agentId);
      // Reload the panel only for the node currently displaying this topic.
      // This works for both the docked agent and clones: clone handlers set
      // their own topic before firing selectTopic, so getActiveTopic() matches.
      const trackedAgent = this.chatPanel.getTrackAgent();
      if (this.store.getSelectedAgentId() === agentId &&
          trackedAgent?.getActiveTopic() === topicId) {
        const agent = this.store.getAgent(agentId);
        if (agent) {
          this.presentTopic(agentId, topicId, agent.name);
        }
      }
    });

    this.chatPanel.onCloseRequested.add(() => {
      this.store.selectAgent(null);
    });

    this.chatPanel.onDisconnectRequested.add(() => {
      const agentId = this.store.getSelectedAgentId();
      if (agentId) {
        this.onDisconnectRequested.invoke(agentId);
      }
    });

    this.chatPanel.onDeleteRequested.add(() => {
      const agentId = this.store.getSelectedAgentId();
      if (agentId) {
        const cloneToDestroy = this.lastTappedNode?.agentObject.isClone
          ? this.lastTappedNode.agentObject
          : null;
        this.onDeleteRequested.invoke(agentId);
        if (cloneToDestroy) {
          this.destroyClone(cloneToDestroy);
        }
      }
    });

    this.chatPanel.onClearConversationsRequested.add(() => {
      const agentId = this.store.getSelectedAgentId();
      if (agentId) {
        this.onClearConversationsRequested.invoke(agentId);
      }
    });

    this.chatPanel.onAddWorkspaceRequested.add(() => {
      const agentId = this.store.getSelectedAgentId();
      if (agentId) {
        this.onAddWorkspaceRequested.invoke(agentId);
      }
    });

    this.chatPanel.onDiscoveredWorkspaceSelected.add(({ path, name }) => {
      const agentId = this.store.getSelectedAgentId();
      if (agentId) {
        this.onDiscoveredWorkspaceSelected.invoke({ agentId, path, name });
      }
    });

    this.chatPanel.onThemeChanged.add((themeKey) => {
      const agentId = this.store.getSelectedAgentId();
      if (agentId) {
        this.applyTheme(agentId, themeKey);
      }
    });

    this.chatPanel.onModeChanged.add(({ mode, highlightSettings }) => {
      const agentId = this.store.getSelectedAgentId();
      if (agentId) {
        const active = mode === "settings" && highlightSettings;
        this.forEachAgentObject(agentId, (ao) => ao.setSettingsActive(active));
      }
      this.onSettingsViewToggled.invoke(mode === "settings");
    });

    this.chatPanel.onPermissionDecision.add(
      (decision: "allow" | "allow_session" | "deny") => {
        const agentId = this.store.getSelectedAgentId();
        if (agentId) {
          this.onPermissionDecision.invoke({ agentId, decision });
        }
      },
    );

    this.chatPanel.onSmartFeatureChanged.add((e) => {
      this.onSmartFeatureChanged.invoke(e);
    });

    this.chatPanel.onSuggestionTapped.add((text: string) => {
      this.onSuggestionTapped.invoke(text);
    });

    this.chatPanel.onOpenInCliRequested.add(() => {
      const agentId = this.store.getSelectedAgentId();
      if (agentId) {
        this.onOpenInCliRequested.invoke(agentId);
      }
    });

    this.audioComponent = createAudioComponent(parentObject);

    global.deviceInfoSystem.onInternetStatusChanged.add((args) => {
      this.applyInternetAvailability(args.isInternetAvailable);
    });
    this.applyInternetAvailability(global.deviceInfoSystem.isInternetAvailable());
  }

  registerButtonBar(bar: AgentButtonBar): void {
    bar.syncAgents(this.store.getAgents(), (agentId: string) =>
      this.store.getThemeIndex(agentId),
    );
    this.extraBars.push(bar);
  }

  setPanel(panel: AgentManagerPanel): void {
    this.panel = panel;

    panel.getAgentButtonBar().onAgentSelected.add((agentId: string) => {
      this.switchActiveDockedAgent(agentId);
    });
  }

  getAgentObject(agentId: string): SceneObject | null {
    return this.dockedNodes.get(agentId)?.sceneObject ?? null;
  }

  getAgentComponent(agentId: string): AgentObject | null {
    if (
      this.lastTappedNode &&
      this.lastTappedNode.agentObject.getAgent()?.id === agentId
    ) {
      return this.lastTappedNode.agentObject;
    }
    return this.dockedNodes.get(agentId)?.agentObject ?? null;
  }

  setAgentTyping(agentId: string, typing: boolean): void {
    this.forEachAgentObject(agentId, (ao) => ao.setTyping(typing));
  }

  setAgentListening(agentId: string, listening: boolean): void {
    this.forEachAgentObject(agentId, (ao) => ao.setListening(listening));
  }

  showAgentError(agentId: string, message: string): void {
    this.audioComponent.audioTrack = ERROR_STATE_SFX;
    this.audioComponent.play(1);
    this.forEachAgentObject(agentId, (ao) => ao.showError(message));
  }

  clearAgentError(agentId: string): void {
    this.forEachAgentObject(agentId, (ao) => ao.clearError());
  }

  setAgentModels(agentId: string, models: string[]): void {
    this.store.setModels(agentId, models);
  }

  setAgentRepos(agentId: string, repos: RepoEntry[]): void {
    this.store.setRepos(agentId, repos);
  }

  getSelectedModel(agentId: string): string | undefined {
    return this.store.getSelectedModel(agentId);
  }

  getSelectedRepo(agentId: string): string | undefined {
    return this.store.getSelectedRepo(agentId);
  }

  showDiscoveredWorkspaces(
    workspaces: Array<{ path: string; name: string }>,
  ): void {
    this.chatPanel.showDiscoveredWorkspaces(workspaces);
  }

  refreshChatFooter(): void {
    this.chatPanel.refreshFooter();
  }

  setOpenInCliVisible(visible: boolean): void {
    this.chatPanel.setOpenInCliVisible(visible);
  }

  private applyTheme(agentId: string, themeKey: string): void {
    this.forEachAgentObject(agentId, (ao) => ao.setTheme(themeKey));
    if (this.panel) {
      this.panel.getAgentButtonBar().setAgentTheme(agentId, themeKey);
    }
    for (const bar of this.extraBars) {
      bar.setAgentTheme(agentId, themeKey);
    }
  }

  private applyStoredTheme(agentId: string, agentObject: AgentObject): void {
    const idx = this.store.getThemeIndex(agentId);
    agentObject.setTheme(THEME_KEYS[idx] ?? "robot");
  }

  private addCloneNode(agentId: string, node: AgentNode): void {
    this.worldClones.push(node);
    let list = this.clonesByAgentId.get(agentId);
    if (!list) {
      list = [];
      this.clonesByAgentId.set(agentId, list);
    }
    list.push(node);
  }

  private removeCloneNode(node: AgentNode): void {
    const idx = this.worldClones.indexOf(node);
    if (idx !== -1) this.worldClones.splice(idx, 1);
    const agentId = node.agentObject.getAgent()?.id;
    if (agentId) {
      const list = this.clonesByAgentId.get(agentId);
      if (list) {
        const ci = list.indexOf(node);
        if (ci !== -1) list.splice(ci, 1);
        if (list.length === 0) this.clonesByAgentId.delete(agentId);
      }
    }
  }

  private forEachAgentObject(
    agentId: string,
    fn: (obj: AgentObject) => void,
  ): void {
    const docked = this.dockedNodes.get(agentId);
    if (docked) fn(docked.agentObject);
    const clones = this.clonesByAgentId.get(agentId);
    if (clones) {
      for (const clone of clones) {
        fn(clone.agentObject);
      }
    }
  }

  private static readonly SPAWN_STAGGER_MS = 33;

  private cancelPendingSpawns(): void {
    for (const token of this.pendingSpawns) {
      clearTimeout(token);
    }
    this.pendingSpawns = [];
  }

  private syncAgents(agents: Agent[]): void {
    this.cancelPendingSpawns();

    const incoming = new Set(agents.map((a) => a.id));
    const removed = this.removeStaleAgents(incoming);
    const newAgents = this.updateExistingAgents(agents);
    this.hideIfSelectedAgentUnavailable();

    if (removed || newAgents.length > 0) {
      this.layoutDockedAgents();
    }

    if (removed && this.panel) {
      this.panel.setDockedAgentCount(this.dockedNodes.size);
    }

    this.spawnNewAgents(newAgents, agents);

    this.syncButtonBar(agents);
    this.applyDockedVisibility();
  }

  private removeStaleAgents(incoming: Set<string>): boolean {
    let removed = false;
    for (const [id, node] of this.dockedNodes) {
      if (!incoming.has(id)) {
        node.agentObject.destroy();
        this.dockedNodes.delete(id);
        this.removeWorldClonesForAgent(id);
        removed = true;
      }
    }

    if (removed && !incoming.has(this.activeDockedAgentId)) {
      const firstId = this.dockedNodes.keys().next().value as
        | string
        | undefined;
      this.activeDockedAgentId = firstId ?? "";
    }
    return removed;
  }

  private updateExistingAgents(agents: Agent[]): Agent[] {
    const newAgents: Agent[] = [];
    for (const agent of agents) {
      const existing = this.dockedNodes.get(agent.id);
      if (existing) {
        existing.agentObject.setAgent(agent);
        this.updateWorldCloneAgentData(agent);
        this.refreshAgentTopics(agent.id);
      } else {
        newAgents.push(agent);
      }
    }
    return newAgents;
  }

  private spawnNewAgents(newAgents: Agent[], allAgents: Agent[]): void {
    for (let i = 0; i < newAgents.length; i++) {
      const agent = newAgents[i];

      if (i === 0) {
        this.spawnAgent(agent);
        if (!this.activeDockedAgentId) {
          this.activeDockedAgentId = agent.id;
        }
        this.layoutDockedAgents();
        this.refreshAgentTopics(agent.id);
        if (this.panel) {
          this.panel.setDockedAgentCount(this.dockedNodes.size);
        }
      } else {
        const token = setTimeout(() => {
          this.spawnAgent(agent);
          this.layoutDockedAgents();
          this.refreshAgentTopics(agent.id);
          if (this.panel) {
            this.panel.setDockedAgentCount(this.dockedNodes.size);
          }
          this.applyDockedVisibility();
        }, i * AgentWorldView.SPAWN_STAGGER_MS);
        this.pendingSpawns.push(token);
      }
    }
  }

  private spawnAgent(agent: Agent): void {
    if (this.panel) {
      this.spawnDockedAgent(agent);
    } else {
      this.spawnWorldAgent(agent);
    }
  }

  private initAgentObject(
    parent: SceneObject,
    agent: Agent,
    options: {
      name: string;
      docked: boolean;
      isClone?: boolean;
      worldPosition?: vec3;
    },
  ): { agentObject: AgentObject; sceneObject: SceneObject } {
    const obj = global.scene.createSceneObject(options.name);
    obj.setParent(parent);
    if (options.worldPosition) {
      obj.getTransform().setWorldPosition(options.worldPosition);
    }

    const agentObject = obj.createComponent(
      AgentObject.getTypeName(),
    ) as AgentObject;
    agentObject.docked = options.docked;
    if (options.isClone) agentObject.isClone = true;
    if (!options.docked) agentObject.createHorizontalFrame();
    agentObject.setExplosionPrefab(this.explosionPrefab);
    agentObject.setAgent(agent);
    this.applyStoredTheme(agent.id, agentObject);
    this.wireAgentEvents(agentObject);

    return { agentObject, sceneObject: obj };
  }

  private spawnDockedAgent(agent: Agent): void {
    const dockedParent = this.panel!.getDockedAgentsParent();
    dockedParent.enabled = true;
    const { agentObject, sceneObject } = this.initAgentObject(
      dockedParent,
      agent,
      { name: `Agent_${agent.id}_docked`, docked: true },
    );
    this.wireDockedManipulation(agentObject);
    this.dockedNodes.set(agent.id, { agentObject, sceneObject });
  }

  private spawnWorldAgent(agent: Agent): void {
    const { agentObject, sceneObject } = this.initAgentObject(
      this.parentObject,
      agent,
      { name: `Agent_${agent.id}`, docked: false },
    );
    this.dockedNodes.set(agent.id, { agentObject, sceneObject });
  }

  private spawnClone(agent: Agent, worldPosition: vec3): AgentNode {
    const { agentObject, sceneObject: obj } = this.initAgentObject(
      this.parentObject,
      agent,
      {
        name: `Agent_${agent.id}_clone_${this.worldClones.length}`,
        docked: false,
        isClone: true,
        worldPosition,
      },
    );
    agentObject.disableManipulation();

    agentObject.onCloseRequested.add(() => {
      this.destroyClone(agentObject);
    });

    const cloneNode: AgentNode = { agentObject, sceneObject: obj };
    this.addCloneNode(agent.id, cloneNode);

    const topics = this.store.getTopicsForAgent(agent.id);
    const activeTopicId = this.store.getActiveTopicId(agent.id) ?? "";
    const unreadTopicIds = this.store.getUnreadTopicIds(agent.id);
    agentObject.setConversationsLoading(false);
    agentObject.setTopics(topics, activeTopicId, unreadTopicIds);
    agentObject.setTopicStatus(
      this.getTopicMetadataStatus(topics, activeTopicId),
    );
    return cloneNode;
  }

  private wireAgentEvents(agentObject: AgentObject): void {
    agentObject.onTapped.add((agentId) => {
      const tappedNode = this.findNodeForAgentObject(agentObject);
      const sameNode =
        this.lastTappedNode === tappedNode &&
        this.store.getSelectedAgentId() === agentId;

      if (sameNode) {
        this.lastTappedNode = null;
        this.store.selectAgent(null);
      } else {
        this.lastTappedNode = tappedNode;
        this.store.selectAgent(agentId);
      }
    });

    agentObject.onTopicClicked.add((topicId) => {
      const agentId = agentObject.getAgent()?.id;
      if (agentId) {
        this.lastTappedNode = this.findNodeForAgentObject(agentObject);
        if (this.chatPanel.getMode() === "settings") {
          this.chatPanel.toggleSettings();
        }
        agentObject.setActiveTopic(topicId);
        const topics = this.store.getTopicsForAgent(agentId);
        agentObject.setTopicStatus(
          this.getTopicMetadataStatus(topics, topicId),
        );
        this.store.selectTopic(agentId, topicId);
        // Re-select even if the agent is already active so the chat panel
        // rebinds to the node that was actually clicked.
        this.store.selectAgent(agentId);
      }
    });

    agentObject.onNewChatRequested.add(() => {
      const agentId = agentObject.getAgent()?.id;
      if (agentId) {
        this.lastTappedNode = this.findNodeForAgentObject(agentObject);
        const allTopics = this.store.getTopicsForAgent(agentId);
        const existingEmpty = allTopics.find((t) => {
          const msgs = this.store.getMessagesForTopic(t.id);
          return msgs.length === 0 && !t.externalId;
        });
        if (existingEmpty) {
          agentObject.setActiveTopic(existingEmpty.id);
          agentObject.setTopicStatus(null);
          if (this.chatPanel.getMode() === "settings") {
            this.chatPanel.toggleSettings();
          }
          this.store.selectTopic(agentId, existingEmpty.id);
          this.store.selectAgent(agentId);
          return;
        }
        const topic = this.store.addTopic(agentId, "New Chat")!;
        agentObject.setActiveTopic(topic.id);
        this.refreshAgentTopics(agentId);
        agentObject.setTopicStatus(null);
        if (this.chatPanel.getMode() === "settings") {
          this.chatPanel.toggleSettings();
        }
        this.store.selectTopic(agentId, topic.id);
        this.store.selectAgent(agentId);
      }
    });

    agentObject.onSettingsTapped.add(() => {
      const agent = agentObject.getAgent();
      if (!agent) return;
      this.lastTappedNode = this.findNodeForAgentObject(agentObject);

      const unavailable =
        agent.status === AgentStatus.Offline ||
        agent.status === AgentStatus.Sleeping ||
        agent.status === AgentStatus.Deactivated;

      if (unavailable) {
        if (
          this.chatPanel.isShowing() &&
          this.chatPanel.getMode() === "settings"
        ) {
          this.chatPanel.hide();
          this.store.selectAgent(null);
        } else {
          this.store.selectAgent(agent.id);
          this.chatPanel.show(agentObject);
          if (this.chatPanel.getMode() !== "settings") {
            this.chatPanel.toggleSettings();
          }
        }
      } else {
        this.store.selectAgent(agent.id);
        this.chatPanel.toggleSettings();
      }
    });
  }

  private wireDockedManipulation(agentObject: AgentObject): void {
    const manipulation = agentObject.getManipulation();
    if (!manipulation) return;

    let dockedLocalPos = vec3.zero();
    let startWorldPos = vec3.zero();
    let lastPosition = vec3.zero();
    let totalDistance = 0;
    let isDragging = false;
    let isPinchHeld = false;
    let pinchHoldTimer: CancelToken | null = null;
    let restoreAgent: AgentObject | null = null;

    manipulation.onTranslationStart.add(() => {
      dockedLocalPos = agentObject
        .getSceneObject()
        .getTransform()
        .getLocalPosition();
      startWorldPos = agentObject.getManipulationAnchorWorldPosition();
      lastPosition = startWorldPos;
      totalDistance = 0;
      isDragging = false;
      isPinchHeld = false;

      agentObject.showDragHoldTooltip(true);

      if (pinchHoldTimer !== null) {
        clearTimeout(pinchHoldTimer);
      }
      pinchHoldTimer = setTimeout(() => {
        isPinchHeld = true;
        pinchHoldTimer = null;
        // Reset distance tracking from the held position so movements during
        // the hold period don't count toward drag/detach thresholds.
        totalDistance = 0;
        lastPosition = agentObject.getManipulationAnchorWorldPosition();
      }, PINCH_HOLD_DURATION_MS);
    });

    manipulation.onTranslationUpdate.add((event: TranslateEventArg) => {
      const segmentDist = event.currentPosition.sub(lastPosition).length;
      totalDistance += segmentDist;
      lastPosition = event.currentPosition;

      if (!isPinchHeld) {
        // Hold threshold not yet met — lock in place so the agent doesn't
        // jitter or accidentally move during the hold window.
        agentObject.snapToDockedPosition(dockedLocalPos);
        return;
      }

      if (!isDragging) {
        if (totalDistance > DRAG_THRESHOLD) {
          isDragging = true;
          restoreAgent = this.chatPanel.getTrackAgent();
          this.chatPanel.hide();
          agentObject.setManipulating(true);
        } else {
          // Lock the agent in place until drag threshold is met, so small
          // incidental movements during a tap don't cause visible jitter.
          agentObject.snapToDockedPosition(dockedLocalPos);
        }
      }
    });

    manipulation.onTranslationEnd.add(() => {
      if (pinchHoldTimer !== null) {
        clearTimeout(pinchHoldTimer);
        pinchHoldTimer = null;
      }
      isPinchHeld = false;
      agentObject.showDragHoldTooltip(false);

      if (isDragging) {
        agentObject.setManipulating(false);
      }
      if (this.panel && totalDistance > DETACH_THRESHOLD) {
        const agent = agentObject.getAgent();
        if (agent) {
          this.audioComponent.audioTrack = DETACH_DOCK_SFX;
          this.audioComponent.play(1);
          this.openNewChatForDraggedAgent(agent, agentObject, lastPosition);
        }
        agentObject.snapToDockedPosition(dockedLocalPos);
      } else {
        if (restoreAgent) {
          this.chatPanel.show(restoreAgent);
        }
        agentObject.lerpToDockedPosition(dockedLocalPos);
      }
    });
  }

  private openNewChatForDraggedAgent(
    agent: Agent,
    agentObject: AgentObject,
    worldPosition: vec3,
  ): void {
    const agentId = agent.id;

    // Spawn a clone at the drag position showing the original topic, before we
    // change anything in the store so it picks up the current active topic.
    const cloneNode = this.spawnClone(agent, worldPosition);

    // Find or create an empty topic for the panel to switch to.
    const allTopics = this.store.getTopicsForAgent(agentId);
    const existingEmpty = allTopics.find((t) => {
      const msgs = this.store.getMessagesForTopic(t.id);
      return msgs.length === 0 && !t.externalId;
    });
    const topic = existingEmpty ?? this.store.addTopic(agentId, "New Chat");
    if (!topic) return;

    // Point lastTappedNode at the clone so updateSelection routes chatPanel.show()
    // to the clone rather than the docked agent.
    this.lastTappedNode = cloneNode;
    this.switchActiveDockedAgent(agentId);

    if (this.chatPanel.getMode() === "settings") {
      this.chatPanel.toggleSettings();
    }

    // Select the new topic without invoking onOpenPanelRequested, so the
    // agent manager panel stays in its current position.
    this.store.selectAgent(agentId);
    this.store.selectTopic(agentId, topic.id);

    // The selectAgent/selectTopic calls above fire various store events whose
    // handlers may set the panel title or attempt to reload the thread using the
    // store's active topic (the new empty one).  Re-present the clone's original
    // topic so the chat panel always reflects the conversation the clone was
    // created from.
    const cloneTopicId = cloneNode.agentObject.getActiveTopic();
    if (cloneTopicId) {
      this.presentTopic(agentId, cloneTopicId, agent.name);
    }
  }

  private destroyClone(agentObject: AgentObject): void {
    const idx = this.worldClones.findIndex(
      (c) => c.agentObject === agentObject,
    );
    if (idx === -1) return;

    const node = this.worldClones[idx];

    if (this.lastTappedNode?.agentObject === agentObject) {
      this.lastTappedNode = null;
      this.store.selectAgent(null);
    }

    this.removeCloneNode(node);
    agentObject.destroy();
  }

  private findNodeForAgentObject(agentObject: AgentObject): AgentNode | null {
    for (const node of this.dockedNodes.values()) {
      if (node.agentObject === agentObject) return node;
    }
    for (const clone of this.worldClones) {
      if (clone.agentObject === agentObject) return clone;
    }
    return null;
  }

  private updateWorldCloneAgentData(agent: Agent): void {
    const topics = this.store.getTopicsForAgent(agent.id);
    for (const clone of this.worldClones) {
      if (clone.agentObject.getAgent()?.id === agent.id) {
        clone.agentObject.setAgent(agent);
        const cloneTopicId = clone.agentObject.getActiveTopic();
        clone.agentObject.setTopicStatus(
          this.getTopicMetadataStatus(topics, cloneTopicId),
        );
      }
    }
  }

  private removeWorldClonesForAgent(agentId: string): void {
    const toRemove: AgentObject[] = [];
    for (const clone of this.worldClones) {
      if (clone.agentObject.getAgent()?.id === agentId) {
        toRemove.push(clone.agentObject);
      }
    }
    for (const ao of toRemove) {
      this.destroyClone(ao);
    }
  }

  private hideIfSelectedAgentUnavailable(): void {
    const selectedId = this.store.getSelectedAgentId();
    if (!selectedId) return;

    const agent = this.store.getAgent(selectedId);
    if (!agent) return;

    const unavailable =
      agent.status === AgentStatus.Offline ||
      agent.status === AgentStatus.Sleeping ||
      agent.status === AgentStatus.Deactivated;

    if (
      unavailable &&
      this.chatPanel.isShowing() &&
      this.chatPanel.getMode() !== "settings"
    ) {
      this.chatPanel.hide();
      this.store.selectAgent(null);
    }
  }

  private updateSelection(selected: Agent | null): void {
    let activeNode: AgentNode | null = null;
    if (selected) {
      const lastTappedIsSelected =
        this.lastTappedNode?.agentObject.getAgent()?.id === selected.id;
      activeNode = lastTappedIsSelected
        ? this.lastTappedNode
        : (this.dockedNodes.get(selected.id) ?? null);
    }

    let activeIsDocked = false;
    if (activeNode) {
      for (const n of this.dockedNodes.values()) {
        if (n === activeNode) {
          activeIsDocked = true;
          break;
        }
      }
    }

    if (activeIsDocked && selected) {
      this.switchActiveDockedAgent(selected.id);
      if (this.panel) {
        this.panel.getFrame().lerpToCamera();
      }
    }

    for (const [, node] of this.dockedNodes) {
      const isActive = node === activeNode;
      node.agentObject.setSelected(isActive);
    }
    for (const clone of this.worldClones) {
      clone.agentObject.setSelected(clone === activeNode);
    }

    if (selected && activeNode) {
      const offline = selected.status === AgentStatus.Offline;
      const unavailable =
        offline ||
        selected.status === AgentStatus.Sleeping ||
        selected.status === AgentStatus.Deactivated;

      if (offline) {
        this.chatPanel.show(activeNode.agentObject);
        if (this.chatPanel.getMode() !== "settings") {
          this.chatPanel.toggleSettings();
        }
      } else if (unavailable) {
        if (
          this.chatPanel.isShowing() &&
          this.chatPanel.getMode() !== "settings"
        ) {
          this.chatPanel.hide();
        }
      } else {
        this.chatPanel.show(activeNode.agentObject);
        const nodeTopicId = activeNode.agentObject.getActiveTopic();
        const storeTopicId = this.store.getActiveTopicId(selected.id);
        if (nodeTopicId && nodeTopicId !== storeTopicId && activeIsDocked) {
          // Docked node diverged from the store — sync it; onTopicSelected loads thread + title
          this.store.selectTopic(selected.id, nodeTopicId);
        } else {
          const topicId = nodeTopicId || storeTopicId;
          this.presentTopic(selected.id, topicId, selected.name);
        }
      }
    } else {
      this.chatPanel.hide();
    }
  }

  private onMessageAdded(msg: ChatMessage): void {
    const selectedId = this.store.getSelectedAgentId();
    if (msg.agentId !== selectedId) return;
    const activeTopicId = this.store.getActiveTopicId(selectedId);
    if (msg.topicId !== activeTopicId) return;
    const agent = this.store.getAgent(selectedId);
    if (!agent) return;
    this.chatPanel.addMessage(msg, agent.name);
  }

  refreshSelectedThread(agentId: string, topicId: string): void {
    if (this.store.getSelectedAgentId() !== agentId) return;
    if (this.store.getActiveTopicId(agentId) !== topicId) return;

    // If a clone is currently tracked, its active topic may differ from the
    // store's active topic.  Only refresh when the topics actually match so we
    // don't overwrite the clone's conversation with a different thread.
    const trackedAgent = this.chatPanel.getTrackAgent();
    if (trackedAgent && trackedAgent.getActiveTopic() !== topicId) return;

    const agent = this.store.getAgent(agentId);
    if (!agent) return;

    const messages = this.store.getMessagesForTopic(topicId);
    this.chatPanel.loadThread(topicId, agent.name, messages);

    const topic = this.store.getTopicById(topicId);
    this.chatPanel.setTopicTitle(topic?.title ?? "New Chat");
  }

  private presentTopic(
    agentId: string,
    topicId: string | null,
    agentName: string,
  ): void {
    const messages = topicId ? this.store.getMessagesForTopic(topicId) : [];
    const topic = topicId
      ? this.store.getTopicById(topicId)
      : this.store.getActiveTopic(agentId);

    if (topicId && topic?.externalId && messages.length === 0) {
      this.chatPanel.showThreadLoading();
    } else {
      this.chatPanel.loadThread(topicId, agentName, messages);
    }

    this.chatPanel.setTopicTitle(topic?.title ?? "New Chat");
  }

  private getTopicMetadataStatus(
    topics: ChatTopic[],
    topicId: string,
  ): string | null {
    const topic = topics.find((t) => t.id === topicId);
    return topic?.metadata?.status ?? null;
  }

  private refreshAgentTopics(agentId: string): void {
    const topics = this.store.getTopicsForAgent(agentId);
    const unreadTopicIds = this.store.getUnreadTopicIds(agentId);
    const agent = this.store.getAgent(agentId);
    if (agent) this.syncButtonBarStatus(agentId, agent);

    const loading = this.store.isConversationsLoading(agentId);
    const dockedNode = this.dockedNodes.get(agentId);
    if (dockedNode) {
      dockedNode.agentObject.setConversationsLoading(loading);
      const dockedTopicId = dockedNode.agentObject.getActiveTopic();
      if (!dockedTopicId) {
        const storeTopicId = this.store.getActiveTopicId(agentId) ?? "";
        dockedNode.agentObject.setTopics(topics, storeTopicId, unreadTopicIds);
        dockedNode.agentObject.setTopicStatus(
          this.getTopicMetadataStatus(topics, storeTopicId),
        );
      } else {
        dockedNode.agentObject.updateTopicList(topics, unreadTopicIds);
        dockedNode.agentObject.setTopicStatus(
          this.getTopicMetadataStatus(topics, dockedTopicId),
        );
      }
    }

    for (const clone of this.worldClones) {
      if (clone.agentObject.getAgent()?.id === agentId) {
        clone.agentObject.updateTopicList(topics, unreadTopicIds);
        const cloneTopicId = clone.agentObject.getActiveTopic();
        clone.agentObject.setTopicStatus(
          this.getTopicMetadataStatus(topics, cloneTopicId),
        );
      }
    }
  }

  private layoutDockedAgents(): void {
    const yOffset = this.panel ? this.panel.getDockedAgentYOffset() : 0;
    const centeredPos = new vec3(0, yOffset + 7, -6);

    for (const [, node] of this.dockedNodes) {
      node.sceneObject.getTransform().setLocalPosition(centeredPos);
      node.agentObject.orientToCamera();
    }
  }

  private syncButtonBarStatus(agentId: string, agent: Agent): void {
    const agentUnavailable =
      agent.status === AgentStatus.Offline ||
      agent.status === AgentStatus.Sleeping ||
      agent.status === AgentStatus.Deactivated;

    let state: RobotState;
    if (agentUnavailable) {
      state = STATUS_TO_ROBOT_STATE[agent.status];
    } else {
      const activeTopic = this.store.getActiveTopic(agentId);
      const topicStatus = activeTopic?.metadata?.status ?? null;
      if (topicStatus && TOPIC_STATUS_TO_ROBOT_STATE[topicStatus]) {
        state = TOPIC_STATUS_TO_ROBOT_STATE[topicStatus];
      } else {
        state = STATUS_TO_ROBOT_STATE[agent.status];
      }
    }

    if (this.panel) {
      this.panel.getAgentButtonBar().setAgentRobotState(agentId, state);
    }
    for (const bar of this.extraBars) {
      bar.setAgentRobotState(agentId, state);
    }
  }

  private syncButtonBar(agents: Agent[]): void {
    const themeIndexFn = (agentId: string) => this.store.getThemeIndex(agentId);
    if (this.panel) {
      const bar = this.panel.getAgentButtonBar();
      bar.syncAgents(agents, themeIndexFn);
      bar.setActiveAgent(this.activeDockedAgentId);
    }
    for (const bar of this.extraBars) {
      bar.syncAgents(agents, themeIndexFn);
    }
  }

  private applyDockedVisibility(): void {
    for (const [id, node] of this.dockedNodes) {
      const shouldBeEnabled =
        this.isInternetAvailable && id === this.activeDockedAgentId;
      if (node.sceneObject.enabled !== shouldBeEnabled) {
        node.sceneObject.enabled = shouldBeEnabled;
      }
    }
  }

  private applyInternetAvailability(available: boolean): void {
    this.isInternetAvailable = available;

    if (available) {
      this.applyDockedVisibility();
      for (const node of this.worldClones) {
        node.sceneObject.enabled = true;
      }
    } else {
      for (const node of this.dockedNodes.values()) {
        node.sceneObject.enabled = false;
      }
      for (const node of this.worldClones) {
        node.sceneObject.enabled = false;
      }
    }
  }

  activateAgentClosestToCenter(camPos: vec3, camForward: vec3): void {
    let bestId: string | null = null;
    let bestNode: AgentNode | null = null;
    let bestDot = -Infinity;

    const dockedNode = this.dockedNodes.get(this.activeDockedAgentId);
    if (dockedNode) {
      const toAgent = dockedNode.sceneObject.getTransform().getWorldPosition().sub(camPos);
      if (toAgent.length > 0.001) {
        const dot = toAgent.normalize().dot(camForward);
        if (dot > bestDot) {
          bestDot = dot;
          bestId = this.activeDockedAgentId;
          bestNode = dockedNode;
        }
      }
    }

    for (const clone of this.worldClones) {
      const agentId = clone.agentObject.getAgent()?.id;
      if (!agentId) continue;
      const toAgent = clone.sceneObject.getTransform().getWorldPosition().sub(camPos);
      if (toAgent.length > 0.001) {
        const dot = toAgent.normalize().dot(camForward);
        if (dot > bestDot) {
          bestDot = dot;
          bestId = agentId;
          bestNode = clone;
        }
      }
    }

    if (!bestId || !bestNode) return;

    const sameNode =
      this.lastTappedNode === bestNode &&
      this.store.getSelectedAgentId() === bestId;

    if (sameNode) {
      this.lastTappedNode = null;
      this.store.selectAgent(null);
    } else {
      this.lastTappedNode = bestNode;
      this.store.selectAgent(bestId);
    }
  }

  private switchActiveDockedAgent(agentId: string): void {
    if (agentId === this.activeDockedAgentId) return;
    if (!this.dockedNodes.has(agentId)) return;

    this.activeDockedAgentId = agentId;
    this.applyDockedVisibility();

    if (this.panel) {
      this.panel.getAgentButtonBar().setActiveAgent(agentId);
    }
  }

  showPermissionRequest(payload: PermissionPayload): void {
    this.chatPanel.showPermissionRequest(payload);
  }

  hidePermissionRequest(): void {
    this.chatPanel.hidePermissionRequest();
  }

  setSuggestions(suggestions: string[]): void {
    this.chatPanel.setSuggestions(suggestions);
  }

  clearSuggestions(): void {
    this.chatPanel.clearSuggestions();
  }
}
