import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { AgentStore } from "../State/AgentStore";
import { SmartSummaryService } from "../Services/SmartSummaryService";
import { AgentResponseNotification } from "./AgentResponseNotification";
import { RobotState, RobotTheme } from "./Shared/RobotTypes";
import { THEME_KEYS } from "./Shared/UIConstants";
import { createAudioComponent } from "./Shared/UIBuilders";

const COMPLETED_SFX: AudioTrackAsset = requireAsset(
  "../../Audio/completed.wav",
) as AudioTrackAsset;
const PERMISSION_SFX: AudioTrackAsset = requireAsset(
  "../../Audio/permission_request.wav",
) as AudioTrackAsset;

interface QueuedNotification {
  agentId: string;
  topicId: string;
  topicTitle: string;
  body: string;
  theme: RobotTheme;
  robotState?: RobotState;
  sfx?: AudioTrackAsset;
}

export class NotificationManager {
  public readonly onNotificationTapped = new Event<{
    agentId: string;
    topicId: string;
  }>();

  private activeNotification: AgentResponseNotification | null = null;
  private notificationQueue: QueuedNotification[] = [];
  private audioComponent: AudioComponent;

  constructor(
    private readonly store: AgentStore,
    private readonly root: SceneObject,
    private readonly overlayLayer: LayerSet,
    private readonly overlayCamera: Camera,
    private readonly isPanelShowing: () => boolean,
  ) {
    this.overlayCamera.enabled = false;
    this.audioComponent = createAudioComponent(root);

    store.onTopicCompleted.add(({ agentId, topicId }) => {
      const isViewing =
        this.isPanelShowing() &&
        store.getSelectedAgentId() === agentId &&
        store.getActiveTopicId(agentId) === topicId;
      if (isViewing) return;

      const agent = store.getAgent(agentId);
      const topic = store
        .getTopicsForAgent(agentId)
        .find((t) => t.id === topicId);
      if (!agent || !topic) return;

      const themeIdx = store.getThemeIndex(agentId);
      const themeKey = (THEME_KEYS[themeIdx] ?? "robot") as RobotTheme;
      const rawBody = topic.metadata?.summary ?? "Task completed";

      const entry: QueuedNotification = {
        agentId,
        topicId,
        topicTitle: topic.title,
        body: rawBody,
        theme: themeKey,
        sfx: COMPLETED_SFX,
      };

      if (!store.isSmartSummariesEnabled(agentId)) {
        this.enqueueOrShow(entry);
        return;
      }

      const messages = store.getMessagesForTopic(topicId);
      SmartSummaryService.summarizeNotification(
        topic.title,
        messages,
        rawBody,
      ).then((summary) => {
        entry.body = summary;
        this.enqueueOrShow(entry);
      });
    });
  }

  showPermissionNotification(
    agentId: string,
    topicId: string,
    topicTitle: string,
    toolName: string,
  ): void {
    const isViewing =
      this.isPanelShowing() &&
      this.store.getSelectedAgentId() === agentId &&
      this.store.getActiveTopicId(agentId) === topicId;
    if (isViewing) return;

    const themeIdx = this.store.getThemeIndex(agentId);
    const themeKey = (THEME_KEYS[themeIdx] ?? "robot") as RobotTheme;

    const entry: QueuedNotification = {
      agentId,
      topicId,
      topicTitle,
      body: `Permission: ${toolName}`,
      theme: themeKey,
      robotState: "awaiting_action",
      sfx: PERMISSION_SFX,
    };

    this.enqueueOrShow(entry);
  }

  private enqueueOrShow(entry: QueuedNotification): void {
    if (this.activeNotification) {
      this.notificationQueue.push(entry);
      return;
    }
    this.showNotification(entry);
  }

  private showNotification(entry: QueuedNotification): void {
    this.overlayCamera.enabled = true;
    this.audioComponent.audioTrack = entry.sfx ?? COMPLETED_SFX;
    this.audioComponent.play(1);

    const notifObj = global.scene.createSceneObject("ResponseNotif");
    notifObj.setParent(this.root);
    const notif = notifObj.createComponent(
      AgentResponseNotification.getTypeName(),
    ) as AgentResponseNotification;

    notif.setOverlayLayer(this.overlayLayer);

    notif.onTapped.add(() => {
      this.activeNotification = null;
      this.store.selectAgent(entry.agentId);
      this.store.selectTopic(entry.agentId, entry.topicId);
      this.onNotificationTapped.invoke({
        agentId: entry.agentId,
        topicId: entry.topicId,
      });
      this.showNextNotification();
    });

    notif.onDismissed.add(() => {
      if (this.activeNotification === notif) {
        this.activeNotification = null;
        this.showNextNotification();
      }
    });

    this.activeNotification = notif;
    notif.show(entry.topicTitle, entry.body, entry.theme, entry.robotState);
  }

  private showNextNotification(): void {
    const next = this.notificationQueue.shift();
    if (next) {
      this.showNotification(next);
    } else {
      this.overlayCamera.enabled = false;
    }
  }
}
