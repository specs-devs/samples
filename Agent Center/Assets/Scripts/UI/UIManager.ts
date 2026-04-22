import { Agent } from "../Types";
import { AgentStore } from "../State/AgentStore";
import { NotificationManager } from "./NotificationManager";
import { AgentWorldView } from "./Agent/AgentWorldView";
import { AgentInputBar } from "./AgentInputBar";
import { AgentManagerPanel } from "./AgentManagerPanel";
import { HandDockedMenu } from "./HandDockedMenu";
import { VoiceNoteGesture } from "./VoiceNoteGesture";
import { CameraHint } from "./CameraHint";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";

export class UIManager {
  public readonly agentWorldView: AgentWorldView;
  public readonly agentInputBar: AgentInputBar;
  public readonly agentManagerPanel: AgentManagerPanel;
  public readonly handDockedMenu: HandDockedMenu;
  public readonly voiceNoteGesture: VoiceNoteGesture;
  public readonly cameraHint: CameraHint;
  public readonly notificationManager: NotificationManager;

  private store: AgentStore;
  private root: SceneObject;
  private inputBarRecording = false;

  constructor(
    store: AgentStore,
    root: SceneObject,
    explosionPrefab: ObjectPrefab,
  ) {
    this.store = store;
    this.root = root;

    this.agentWorldView = new AgentWorldView(
      store,
      root,
      explosionPrefab,
    );

    this.agentInputBar = new AgentInputBar(
      store,
      this.agentWorldView,
      root,
    );

    const panelObj = global.scene.createSceneObject("AgentManagerPanel");
    panelObj.setParent(root);
    this.agentManagerPanel = panelObj.createComponent(
      AgentManagerPanel.getTypeName(),
    ) as AgentManagerPanel;

    this.agentWorldView.setPanel(this.agentManagerPanel);
    this.agentInputBar.connectBLEKeyboard(this.agentManagerPanel.bleKeyboardManager);

    this.agentWorldView.onOpenPanelRequested.add(() => {
      this.agentManagerPanel.show();
      this.handDockedMenu.setPanelActive(true);
      this.agentManagerPanel.switchToAgentsTab();
    });

    const menuObj = global.scene.createSceneObject("HandDockedMenu");
    menuObj.setParent(root);
    this.handDockedMenu = menuObj.createComponent(
      HandDockedMenu.getTypeName(),
    ) as HandDockedMenu;

    // Panel toggle is pure UI — lives here, not in the controller.
    this.handDockedMenu.onMenuButtonTapped.add(() => {
      if (this.agentManagerPanel.isShowing()) {
        this.agentManagerPanel.hide();
        this.handDockedMenu.setPanelActive(false);
      } else {
        this.agentManagerPanel.show();
        this.handDockedMenu.setPanelActive(true);
      }
    });

    const voiceNoteObj = global.scene.createSceneObject("VoiceNoteGesture");
    voiceNoteObj.setParent(root);
    this.voiceNoteGesture = voiceNoteObj.createComponent(
      VoiceNoteGesture.getTypeName(),
    ) as VoiceNoteGesture;
    this.voiceNoteGesture.init(menuObj);
    this.agentWorldView.registerButtonBar(this.voiceNoteGesture.getButtonBar());

    const refreshVoiceGesture = () => {
      this.voiceNoteGesture.setEnabled(
        store.getAgents().length > 0 && !this.inputBarRecording,
      );
    };

    store.onAgentsChanged.add(refreshVoiceGesture);
    store.onAgentStatusChanged.add(refreshVoiceGesture);

    this.agentInputBar.onRecordingChanged.add((recording: boolean) => {
      this.inputBarRecording = recording;
      refreshVoiceGesture();
    });

    this.agentWorldView.onSettingsViewToggled.add((active: boolean) => {
      this.agentInputBar.setSettingsMode(active);
    });

    this.agentManagerPanel.onSettingsTabSelected.add(() => {
      this.agentInputBar.setSettingsMode(true);
    });
    this.agentManagerPanel.onAgentsTabSelected.add(() => {
      this.agentInputBar.setSettingsMode(false);
    });

    this.agentInputBar.onInputBarShown.add(() => {
      this.agentManagerPanel.setAgentButtonBarVisible(false);
    });
    this.agentInputBar.onInputBarHidden.add(() => {
      this.agentManagerPanel.setAgentButtonBarVisible(true);
    });

    this.cameraHint = new CameraHint();
    this.agentInputBar.onCameraToggled.add((active: boolean) => {
      if (active) {
        this.cameraHint.show(root);
      } else {
        this.cameraHint.hide();
      }
    });
    this.agentInputBar.onCaptureGestureStarted.add(() => {
      this.cameraHint.hide();
    });

    const mainCam = WorldCameraFinderProvider.getInstance().getComponent() as Camera;

    this.agentManagerPanel.bleKeyboardManager.onKeyboardInput.add((e) => {
      if (!e.isSpecialKey || e.key !== "Tab") return;
      if (this.agentInputBar.isTextInputActive) return;
      const camTransform = mainCam.getSceneObject().getTransform();
      this.agentWorldView.activateAgentClosestToCenter(
        camTransform.getWorldPosition(),
        camTransform.forward,
      );
    });

    const overlayLayer = LayerSet.makeUnique();
    const overlayCamObj = global.scene.createSceneObject("OverlayCamera");
    overlayCamObj.setParent(mainCam.getSceneObject());
    overlayCamObj.getTransform().setLocalPosition(vec3.zero());
    overlayCamObj.getTransform().setLocalRotation(quat.quatIdentity());
    const overlayCam = overlayCamObj.createComponent("Component.Camera") as Camera;
    overlayCam.renderLayer = overlayLayer;
    overlayCam.renderOrder = 100;
    overlayCam.enableClearColor = false;
    overlayCam.enableClearDepth = true;
    overlayCam.near = mainCam.near;
    overlayCam.far = mainCam.far;
    overlayCam.type = Camera.Type.Perspective;
    overlayCam.devicePropertyUsage = Camera.DeviceProperty.All;
    overlayCam.renderTarget = mainCam.renderTarget;

    this.notificationManager = new NotificationManager(
      store,
      root,
      overlayLayer,
      overlayCam,
      () => this.agentManagerPanel.isShowing(),
    );

    this.notificationManager.onNotificationTapped.add(() => {
      this.agentManagerPanel.show();
      this.handDockedMenu.setPanelActive(true);
      this.agentManagerPanel.switchToAgentsTab();
    });
  }

  // --- Notification delegation ---

  showPermissionNotification(
    agentId: string,
    topicId: string,
    topicTitle: string,
    toolName: string,
  ): void {
    this.notificationManager.showPermissionNotification(
      agentId,
      topicId,
      topicTitle,
      toolName,
    );
  }

  // --- Panel/navigation wrappers (keep AgentManagerController out of sub-components) ---

  setStatus(text: string, isError?: boolean): void {
    this.agentManagerPanel.setStatus(text, isError);
  }

  notifyProviderConnected(providerId: string, connected: boolean): void {
    this.agentManagerPanel.setProviderConnected(providerId, connected);
  }

  notifyInitialLoadComplete(): void {
    this.agentManagerPanel.setInitialLoadComplete();
  }

  notifySupabaseConfigured(configured: boolean): void {
    this.agentManagerPanel.setSupabaseConfigured(configured);
  }

  showPanel(): void {
    this.agentManagerPanel.show();
    this.handDockedMenu.setPanelActive(true);
  }

  hidePanel(): void {
    this.agentManagerPanel.hide();
    this.handDockedMenu.setPanelActive(false);
  }

  showPanelIfHidden(): void {
    if (!this.agentManagerPanel.isShowing()) {
      this.showPanel();
    }
  }

  switchToAgentsTab(): void {
    this.agentManagerPanel.switchToAgentsTab();
  }

  clearAgentError(agentId: string): void {
    this.agentWorldView.clearAgentError(agentId);
  }

  setDockedAgentCount(count: number): void {
    this.agentManagerPanel.setDockedAgentCount(count);
  }
}
