import { DialogueObject } from "./Shared/DialogueObject";
import { HorizontalFrame } from "./Elements/HorizontalFrame";
import { TabBar, TAB_BAR_WIDTH } from "./Elements/TabBar";
import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";
import { setTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import {
  slideOut,
  slideIn,
  scaleOut,
  scaleIn,
  wipeTransition,
} from "./Shared/UIAnimations";
import { AgentsEmptyView } from "./Views/AgentsEmptyView";
import { AgentsLoadingView } from "./Views/AgentsLoadingView";
import { NoInternetView } from "./Views/NoInternetView";
import { SupabaseConfigMissingView } from "./Views/SupabaseConfigMissingView";
import { AuthView, AuthSubmission } from "./Views/AuthView";
import { SettingsListView, AgentEntry } from "./Views/SettingsListView";
import { AgentButtonBar } from "./Agent/AgentButtonBar";
import { BLEKeyboardManager } from "../Bluetooth/BLEKeyboardManager";
import { BluetoothScanView } from "./Views/BluetoothScanView";
import { PANEL_WIDTH, Z_CONTENT } from "./Shared/UIConstants";

export type { AuthSubmission } from "./Views/AuthView";

const SPAWN_DISTANCE = 110;
const HIDDEN_POSITION = new vec3(0, -1200, 0);
const SHOW_SLIDE_Y = -3;
const SHOW_START_SCALE_RATIO = 0.88;
const ANIM_DURATION = 0.5;
const SLIDE_OFFSET = 5;
const STAGGER_MS = 60;
const FRAME_INNER_SIZE = new vec2(PANEL_WIDTH + 4, 10);
const PLATE_ABOVE_FRAME_Y = FRAME_INNER_SIZE.y / 2 + 1;
const DISCONNECT_DELAY_MS = 2500;
const AGENT_VISUAL_WIDTH = 10;
const FRAME_HORIZONTAL_PAD = 4;
const FRAME_RESIZE_DURATION = 0.3;
const BUTTON_BAR_GAP = 3;
const BUTTON_BAR_FORWARD = 8;
const BUTTON_BAR_TILT_DEG = 20;

const AGENTS: AgentEntry[] = [
  {
    name: "Local Agent",
    provider: "bridge",
    authType: "pairingCode",
    description:
      "Local AI agent running on your Computer. Pair using your 6-digit code.",
    alwaysConnect: true,
  },
];

@component
export class AgentManagerPanel extends BaseScriptComponent {
  public bleKeyboardManager: BLEKeyboardManager;
  private btScanView: BluetoothScanView;

  private frame: HorizontalFrame;
  private contentRoot: SceneObject;
  private frameObj: SceneObject;
  private dockedAgentsContainer: SceneObject;

  private agentsEmptyView: AgentsEmptyView;
  private agentsLoadingView: AgentsLoadingView;
  private noInternetView: NoInternetView;
  private supabaseConfigMissingView: SupabaseConfigMissingView;
  private _isInternetAvailable = true;
  private _isSupabaseConfigured = true;
  private settingsListView: SettingsListView;
  private authView: AuthView;
  private agentButtonBar: AgentButtonBar;
  private buttonBarContainer: SceneObject;

  private dialogue: DialogueObject;
  private dialogueObj: SceneObject;
  private pendingDisconnectProvider = "";
  private pendingDeleteAll = false;
  private animCancels = new CancelSet();
  private frameAnimCancels = new CancelSet();
  private rootFullScale = vec3.one();
  private tabBarComponent: TabBar;
  private _dockedAgentCount = 0;
  private _initialLoadComplete = false;
  private _isShowing = false;
  private _isOnAgentsPage = true;
  private _isFrameHovered = false;
  private _buttonBarExternallyHidden = false;
  private _lastButtonBarShouldShow = false;

  public readonly onAuthenticated = new Event<AuthSubmission>();
  public readonly onDisconnectRequested = new Event<string>();
  public readonly onDeleteAllDataRequested = new Event<void>();
  public readonly onSettingsTabSelected = new Event<void>();
  public readonly onAgentsTabSelected = new Event<void>();

  onAwake(): void {
    const root = this.getSceneObject();
    this.rootFullScale = root.getTransform().getLocalScale();
    root.getTransform().setWorldPosition(HIDDEN_POSITION);

    this.frameObj = global.scene.createSceneObject("PanelFrame");
    this.frameObj.setParent(root);

    this.dockedAgentsContainer = global.scene.createSceneObject(
      "DockedAgentsContainer",
    );
    this.dockedAgentsContainer.setParent(root);

    this.contentRoot = global.scene.createSceneObject("PanelContent");
    this.contentRoot.setParent(root);

    this.agentsEmptyView = new AgentsEmptyView(this.contentRoot);
    this.agentsLoadingView = new AgentsLoadingView(this.contentRoot);

    this.noInternetView = new NoInternetView(this.contentRoot);
    this.supabaseConfigMissingView = new SupabaseConfigMissingView(
      this.contentRoot,
    );
    global.deviceInfoSystem.onInternetStatusChanged.add((args) => {
      this.handleInternetStatusChanged(args.isInternetAvailable);
    });
    this.handleInternetStatusChanged(
      global.deviceInfoSystem.isInternetAvailable(),
    );

    this.settingsListView = new SettingsListView(this.contentRoot, AGENTS);
    this.settingsListView.onConnectRequested.add(
      ({ name, provider, authType }) => {
        this.showAuth(name, provider, authType);
      },
    );
    this.settingsListView.onDisconnectRequested.add(({ name, provider }) => {
      this.pendingDisconnectProvider = provider;
      this.dialogueObj.enabled = true;
      this.dialogue.showConfirmation(
        "Disconnect",
        `Are you sure you want to disconnect ${name}?`,
      );
    });
    this.settingsListView.onDeleteAllDataRequested.add(() => {
      this.pendingDeleteAll = true;
      this.dialogueObj.enabled = true;
      this.dialogue.showConfirmation(
        "Delete All Data",
        "This will permanently delete all your data including conversations, preferences, and agent connections. This cannot be undone.",
      );
    });

    this.authView = new AuthView(this.contentRoot);
    this.authView.onAuthenticated.add((submission) => {
      this.onAuthenticated.invoke(submission);
    });
    this.authView.onBackRequested.add(() => this.showList());

    this.buttonBarContainer = global.scene.createSceneObject(
      "AgentButtonBarContainer",
    );
    this.buttonBarContainer.setParent(root);
    this.buttonBarContainer
      .getTransform()
      .setLocalRotation(
        quat.fromEulerAngles(MathUtils.DegToRad * BUTTON_BAR_TILT_DEG, 0, 0),
      );

    this.agentButtonBar = this.buttonBarContainer.createComponent(
      AgentButtonBar.getTypeName(),
    ) as AgentButtonBar;

    this.tabBarComponent = new TabBar(this.contentRoot);
    this.buildDialogue();

    // Create BLEKeyboardManager as a child component
    const bleObj = global.scene.createSceneObject("BLEKeyboardManager");
    bleObj.setParent(root);
    this.bleKeyboardManager = bleObj.createComponent(
      BLEKeyboardManager.getTypeName(),
    ) as BLEKeyboardManager;

    this.btScanView = new BluetoothScanView(this.contentRoot);

    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private buildDialogue(): void {
    this.dialogueObj = global.scene.createSceneObject("DisconnectDialogue");
    this.dialogueObj.setParent(this.contentRoot);
    const dialogueY = this.settingsListView.getTotalHeight() / 2;
    this.dialogueObj
      .getTransform()
      .setLocalPosition(new vec3(0, dialogueY, Z_CONTENT + 0.5));
    this.dialogue = this.dialogueObj.createComponent(
      DialogueObject.getTypeName(),
    ) as DialogueObject;

    this.dialogue.onConfirmed.add(() => {
      if (this.pendingDeleteAll) {
        this.pendingDeleteAll = false;
        this.onDeleteAllDataRequested.invoke();
      } else {
        this.onDisconnectRequested.invoke(this.pendingDisconnectProvider);
        this.pendingDisconnectProvider = "";
      }
    });
  }

  private onStart(): void {
    this.frame = this.frameObj.createComponent(
      HorizontalFrame.getTypeName(),
    ) as HorizontalFrame;
    this.frame.innerSize = FRAME_INNER_SIZE;
    this.frame.showCloseButton = false;
    //this.frame.setForceShow(true);

    this.contentRoot.setParent(this.frame.content);
    this.contentRoot
      .getTransform()
      .setLocalPosition(new vec3(0, PLATE_ABOVE_FRAME_Y, 0));
    this.contentRoot
      .getTransform()
      .setLocalRotation(quat.fromEulerAngles(MathUtils.DegToRad * 75, 0, 0));

    this.dockedAgentsContainer.setParent(this.frame.content);
    this.dockedAgentsContainer
      .getTransform()
      .setLocalRotation(quat.fromEulerAngles(MathUtils.DegToRad * 75, 0, 0));

    this.buttonBarContainer.setParent(this.frame.content);

    this.frame.onFrameHoverEnter.add(() => {
      this._isFrameHovered = true;
      this.updateButtonBarVisibility();
    });
    this.frame.onFrameHoverExit.add(() => {
      this._isFrameHovered = false;
      this.updateButtonBarVisibility();
    });

    this.settingsListView.initializeButtons();

    this.btScanView.initialize();

    this.settingsListView.onBluetoothScanRequested.add(() => {
      this.btScanView.clearDevices();
      this.btScanView.setScanning(true);
      this.bleKeyboardManager.startScan();
      wipeTransition(
        this.settingsListView.sceneObject,
        this.btScanView.sceneObject,
        {
          cancelSet: this.animCancels,
          slideOffset: SLIDE_OFFSET,
          duration: ANIM_DURATION,
          staggerMs: STAGGER_MS,
          direction: "forward",
        },
      );
    });

    this.btScanView.onBackRequested.add(() => {
      this.bleKeyboardManager.stopScan();
      wipeTransition(
        this.btScanView.sceneObject,
        this.settingsListView.sceneObject,
        {
          cancelSet: this.animCancels,
          slideOffset: SLIDE_OFFSET,
          duration: ANIM_DURATION,
          staggerMs: STAGGER_MS,
          direction: "back",
        },
      );
    });

    this.bleKeyboardManager.onDeviceFound.add((device) => {
      this.btScanView.addDevice(device);
    });

    this.bleKeyboardManager.onScanComplete.add(() => {
      this.btScanView.setScanning(false);
      this.settingsListView.updateBluetoothStatus(
        this.bleKeyboardManager.isConnected,
        this.bleKeyboardManager.connectedDeviceName,
      );
    });

    this.btScanView.onPairRequested.add((address: Uint8Array) => {
      const device = this.bleKeyboardManager.getFoundDeviceByAddress(address);
      if (device) {
        this.btScanView.setConnecting(device.name);
        this.bleKeyboardManager.connectToDevice(device.address, device.name);
      }
      // Do NOT transition here — wait for onConnectionStateChanged
    });

    this.bleKeyboardManager.onConnectionStateChanged.add(
      ({ connected, deviceName }) => {
        this.settingsListView.updateBluetoothStatus(connected, deviceName);
        if (connected && this.btScanView.sceneObject.enabled) {
          wipeTransition(
            this.btScanView.sceneObject,
            this.settingsListView.sceneObject,
            {
              cancelSet: this.animCancels,
              slideOffset: SLIDE_OFFSET,
              duration: ANIM_DURATION,
              staggerMs: STAGGER_MS,
              direction: "back",
            },
          );
        }
      },
    );

    this.settingsListView.onBluetoothUnpairRequested.add(() => {
      this.bleKeyboardManager.unpairDevice();
    });

    this.tabBarComponent.initialize();

    this.tabBarComponent.onAgentsSelected.add(() => {
      this.showAgentsView();
      this.onAgentsTabSelected.invoke();
    });

    this.tabBarComponent.onSettingsSelected.add(() => {
      this.hideAgentsView();
      this.onSettingsTabSelected.invoke();
    });

    this.updateFrameWidth(false);
    this.updateButtonBarPosition();
  }

  private showAuth(
    agentName: string,
    provider: string,
    authType: "apiKey" | "pairingCode" = "apiKey",
  ): void {
    this.animCancels.cancel();
    wipeTransition(
      this.settingsListView.sceneObject,
      this.authView.sceneObject,
      {
        cancelSet: this.animCancels,
        slideOffset: SLIDE_OFFSET,
        duration: ANIM_DURATION,
        staggerMs: STAGGER_MS,
        direction: "forward",
        beforeWipeIn: () =>
          this.authView.showForProvider(agentName, provider, authType),
      },
    );
  }

  showList(): void {
    this.animCancels.cancel();

    if (!this.authView.sceneObject.enabled) {
      this.settingsListView.sceneObject.enabled = true;
      return;
    }

    wipeTransition(
      this.authView.sceneObject,
      this.settingsListView.sceneObject,
      {
        cancelSet: this.animCancels,
        slideOffset: SLIDE_OFFSET,
        duration: ANIM_DURATION,
        staggerMs: STAGGER_MS,
        direction: "back",
      },
    );
  }

  showAgentsView(): void {
    this.animCancels.cancel();
    this.authView.sceneObject.enabled = false;

    const fromObj = this.btScanView.sceneObject.enabled
      ? this.btScanView.sceneObject
      : this.settingsListView.sceneObject;
    this.btScanView.sceneObject.enabled = false;

    const activeView = !this._isSupabaseConfigured
      ? this.supabaseConfigMissingView.sceneObject
      : !this._isInternetAvailable
        ? this.noInternetView.sceneObject
        : this._dockedAgentCount > 0
          ? this.dockedAgentsContainer
          : this._initialLoadComplete
            ? this.agentsEmptyView.sceneObject
            : this.agentsLoadingView.sceneObject;

    this._isOnAgentsPage = true;
    this.updateButtonBarVisibility();

    wipeTransition(fromObj, activeView, {
      cancelSet: this.animCancels,
      slideOffset: SLIDE_OFFSET,
      duration: ANIM_DURATION,
      staggerMs: STAGGER_MS,
      direction: "back",
      ended: () => this.updateFrameWidth(),
    });
  }

  private hideAgentsView(): void {
    this.animCancels.cancel();

    const activeView = !this._isSupabaseConfigured
      ? this.supabaseConfigMissingView.sceneObject
      : !this._isInternetAvailable
        ? this.noInternetView.sceneObject
        : this._dockedAgentCount > 0
          ? this.dockedAgentsContainer
          : this._initialLoadComplete
            ? this.agentsEmptyView.sceneObject
            : this.agentsLoadingView.sceneObject;

    this._isOnAgentsPage = false;
    this.updateButtonBarVisibility();

    wipeTransition(activeView, this.settingsListView.sceneObject, {
      cancelSet: this.animCancels,
      slideOffset: SLIDE_OFFSET,
      duration: ANIM_DURATION,
      staggerMs: STAGGER_MS,
      direction: "forward",
      beforeWipeIn: () => this.updateFrameWidth(false),
    });
  }

  getFrame(): HorizontalFrame {
    return this.frame;
  }

  show(): void {
    this.animCancels.cancel();
    const root = this.getSceneObject();
    root.enabled = true;
    this._isShowing = true;

    this.settingsListView.sceneObject.enabled = false;
    this.authView.sceneObject.enabled = false;
    this.btScanView.sceneObject.enabled = false;
    const hasAgents = this._dockedAgentCount > 0;
    const hasInternet = this._isInternetAvailable;
    const isConfigured = this._isSupabaseConfigured;
    this.supabaseConfigMissingView.sceneObject.enabled = !isConfigured;
    this.noInternetView.sceneObject.enabled = isConfigured && !hasInternet;
    this.agentsLoadingView.sceneObject.enabled =
      isConfigured && hasInternet && !this._initialLoadComplete && !hasAgents;
    this.agentsEmptyView.sceneObject.enabled =
      isConfigured && hasInternet && this._initialLoadComplete && !hasAgents;
    this.agentsEmptyView.sceneObject
      .getTransform()
      .setLocalPosition(vec3.zero());
    this.agentsEmptyView.sceneObject.getTransform().setLocalScale(vec3.one());
    this.dockedAgentsContainer.enabled = isConfigured && hasInternet && hasAgents;
    this.updateFrameWidth(false);
    this.tabBarComponent.selectAgents();
    this._isOnAgentsPage = true;
    this.updateButtonBarVisibility();

    const camera = WorldCameraFinderProvider.getInstance();
    const spawnPos = camera.getForwardPosition(SPAWN_DISTANCE);

    root.getTransform().setWorldPosition(spawnPos);
    if (this.frame) {
      this.frame.recalculateRotation();
    }

    const showStartScale = new vec3(
      this.rootFullScale.x * SHOW_START_SCALE_RATIO,
      this.rootFullScale.y * SHOW_START_SCALE_RATIO,
      this.rootFullScale.z * SHOW_START_SCALE_RATIO,
    );
    const frameTransform = this.frameObj.getTransform();
    root.getTransform().setLocalScale(showStartScale);
    frameTransform.setLocalPosition(new vec3(0, SHOW_SLIDE_Y, 0));

    animate({
      duration: ANIM_DURATION,
      easing: "ease-out-back",
      cancelSet: this.animCancels,
      update: (t: number) => {
        if (isNull(root)) return;
        root
          .getTransform()
          .setLocalScale(vec3.lerp(showStartScale, this.rootFullScale, t));
        frameTransform.setLocalPosition(new vec3(0, SHOW_SLIDE_Y * (1 - t), 0));
      },
      ended: () => {
        if (isNull(root)) return;
        root.getTransform().setLocalScale(this.rootFullScale);
        frameTransform.setLocalPosition(vec3.zero());
      },
    });
  }

  hide(): void {
    if (!this._isShowing) return;
    this.animCancels.cancel();
    this._isShowing = false;
    const root = this.getSceneObject();

    scaleOut(root, {
      duration: ANIM_DURATION * 0.5,
      cancelSet: this.animCancels,
      disable: false,
      ended: () => {
        if (this._isShowing) return;
        root.getTransform().setLocalScale(this.rootFullScale);
        root.getTransform().setWorldPosition(HIDDEN_POSITION);
        root.enabled = false;
      },
    });
  }

  setProviderConnected(provider: string, connected: boolean): void {
    this.settingsListView.setProviderConnected(provider, connected);
  }

  getVoiceNoteContinuesLastTopic(): boolean {
    return this.settingsListView.getVoiceNoteContinuesLastTopic();
  }

  setStatus(message: string, isError: boolean = false): void {
    this.authView.setStatus(message, isError);
  }

  isShowing(): boolean {
    return this._isShowing;
  }

  getDockedAgentsParent(): SceneObject {
    return this.dockedAgentsContainer;
  }

  getFrameWorldPosition(): vec3 {
    return this.frameObj.getTransform().getWorldPosition();
  }

  getDockedAgentYOffset(): number {
    return PLATE_ABOVE_FRAME_Y;
  }

  switchToAgentsTab(): void {
    if (this.tabBarComponent.getActiveTab() === "agents") return;
    this.tabBarComponent.selectAgents();
    this.showAgentsView();
    this.onAgentsTabSelected.invoke();
  }

  setDockedAgentCount(count: number): void {
    const prevCount = this._dockedAgentCount;
    const prevHad = prevCount > 0;
    if (count === prevCount) return;
    this._dockedAgentCount = count;
    this.updateButtonBarVisibility();
    this.updateFrameWidth();

    if (count === 0 && prevHad) {
      this.dockedAgentsContainer.enabled = false;
    }

    if (this.tabBarComponent.getActiveTab() !== "agents") return;

    if (count > 0) {
      this.agentsEmptyView.sceneObject.enabled = false;
      this.agentsLoadingView.sceneObject.enabled = false;
      if (this._isSupabaseConfigured && this._isInternetAvailable) {
        this.dockedAgentsContainer.enabled = true;
      }
    } else if (prevHad) {
      setTimeout(() => {
        if (
          this._dockedAgentCount > 0 ||
          this.tabBarComponent.getActiveTab() !== "agents"
        )
          return;
        if (!this._isSupabaseConfigured || !this._isInternetAvailable) return;
        if (this._initialLoadComplete) {
          slideIn({
            sceneObject: this.agentsEmptyView.sceneObject,
            slideFrom: new vec3(SLIDE_OFFSET, 0, 0),
            duration: ANIM_DURATION,
            cancelSet: this.animCancels,
          });
        }
        this.updateFrameWidth();
      }, DISCONNECT_DELAY_MS);
    }
  }

  private handleInternetStatusChanged(available: boolean): void {
    this._isInternetAvailable = available;
    if (!this._isShowing) return;

    this.noInternetView.sceneObject.enabled =
      this._isSupabaseConfigured && !available;
    this.updateFrameWidth();

    if (this.tabBarComponent.getActiveTab() !== "agents") return;
    if (!this._isSupabaseConfigured) return;

    if (!available) {
      this.dockedAgentsContainer.enabled = false;
      this.agentsEmptyView.sceneObject.enabled = false;
      this.agentsLoadingView.sceneObject.enabled = false;
    } else {
      const hasAgents = this._dockedAgentCount > 0;
      this.agentsLoadingView.sceneObject.enabled =
        !this._initialLoadComplete && !hasAgents;
      this.agentsEmptyView.sceneObject.enabled =
        this._initialLoadComplete && !hasAgents;
      this.dockedAgentsContainer.enabled = hasAgents;
    }
  }

  setSupabaseConfigured(configured: boolean): void {
    if (this._isSupabaseConfigured === configured) return;
    this._isSupabaseConfigured = configured;
    if (!this._isShowing) return;

    this.supabaseConfigMissingView.sceneObject.enabled = !configured;
    this.updateFrameWidth();

    if (this.tabBarComponent.getActiveTab() !== "agents") return;

    if (!configured) {
      this.noInternetView.sceneObject.enabled = false;
      this.dockedAgentsContainer.enabled = false;
      this.agentsEmptyView.sceneObject.enabled = false;
      this.agentsLoadingView.sceneObject.enabled = false;
    } else {
      this.noInternetView.sceneObject.enabled = !this._isInternetAvailable;
      if (this._isInternetAvailable) {
        const hasAgents = this._dockedAgentCount > 0;
        this.agentsLoadingView.sceneObject.enabled =
          !this._initialLoadComplete && !hasAgents;
        this.agentsEmptyView.sceneObject.enabled =
          this._initialLoadComplete && !hasAgents;
        this.dockedAgentsContainer.enabled = hasAgents;
      }
    }
  }

  private computeFrameWidth(): number {
    if (
      this.tabBarComponent.getActiveTab() === "settings" ||
      this._dockedAgentCount === 0 ||
      !this._isInternetAvailable ||
      !this._isSupabaseConfigured
    ) {
      return FRAME_INNER_SIZE.x;
    }
    return AGENT_VISUAL_WIDTH + FRAME_HORIZONTAL_PAD;
  }

  private updateFrameWidth(animated: boolean = true): void {
    if (!this.frame) return;

    const targetWidth = this.computeFrameWidth();
    const targetOffsetX = (targetWidth - FRAME_INNER_SIZE.x) / 2;
    const frameLeftInContent = -targetWidth / 2 - targetOffsetX;
    const targetTabBarX = frameLeftInContent + 1 - TAB_BAR_WIDTH / 2;

    const contentPos = this.contentRoot.getTransform().getLocalPosition();
    const tabBarTransform = this.tabBarComponent
      .getSceneObject()
      .getTransform();
    const tabBarPos = tabBarTransform.getLocalPosition();

    const widthMatch = Math.abs(this.frame.innerSize.x - targetWidth) < 0.01;
    const posMatch = Math.abs(contentPos.x - targetOffsetX) < 0.01;
    const tabBarMatch = Math.abs(tabBarPos.x - targetTabBarX) < 0.01;
    if (widthMatch && posMatch && tabBarMatch) return;

    this.frameAnimCancels.cancel();

    if (!animated) {
      this.frame.innerSize = new vec2(targetWidth, FRAME_INNER_SIZE.y);
      this.contentRoot
        .getTransform()
        .setLocalPosition(new vec3(targetOffsetX, contentPos.y, contentPos.z));
      tabBarTransform.setLocalPosition(
        new vec3(targetTabBarX, tabBarPos.y, tabBarPos.z),
      );
      return;
    }

    const startWidth = this.frame.innerSize.x;
    const startOffsetX = contentPos.x;
    const startTabBarX = tabBarPos.x;

    animate({
      duration: FRAME_RESIZE_DURATION,
      easing: "ease-out-cubic",
      cancelSet: this.frameAnimCancels,
      update: (t: number) => {
        const w = startWidth + (targetWidth - startWidth) * t;
        this.frame.innerSize = new vec2(w, FRAME_INNER_SIZE.y);

        const ox = startOffsetX + (targetOffsetX - startOffsetX) * t;
        this.contentRoot
          .getTransform()
          .setLocalPosition(new vec3(ox, contentPos.y, contentPos.z));

        const tx = startTabBarX + (targetTabBarX - startTabBarX) * t;
        tabBarTransform.setLocalPosition(
          new vec3(tx, tabBarPos.y, tabBarPos.z),
        );
      },
    });
  }

  getAgentButtonBar(): AgentButtonBar {
    return this.agentButtonBar;
  }

  setAgentButtonBarVisible(visible: boolean): void {
    this._buttonBarExternallyHidden = !visible;
    this.updateButtonBarVisibility();
  }

  private updateButtonBarVisibility(): void {
    const shouldShow =
      this._isOnAgentsPage &&
      this._isFrameHovered &&
      this._dockedAgentCount > 1 &&
      !this._buttonBarExternallyHidden;
    if (shouldShow === this._lastButtonBarShouldShow) return;
    this._lastButtonBarShouldShow = shouldShow;
    if (shouldShow) {
      this.agentButtonBar.show();
    } else {
      this.agentButtonBar.hide();
    }
  }

  updateButtonBarPosition(): void {
    if (!this.buttonBarContainer || !this.frame) return;
    const frameHalfH = FRAME_INNER_SIZE.y / 2;
    this.buttonBarContainer
      .getTransform()
      .setLocalPosition(new vec3(0, frameHalfH + -5, 3));
  }

  setInitialLoadComplete(): void {
    this._initialLoadComplete = true;

    if (this.tabBarComponent.getActiveTab() !== "agents") {
      this.agentsLoadingView.sceneObject.enabled = false;
      return;
    }

    if (!this._isSupabaseConfigured) {
      this.agentsLoadingView.sceneObject.enabled = false;
      this.agentsEmptyView.sceneObject.enabled = false;
      return;
    }

    if (!this._isInternetAvailable) {
      this.agentsLoadingView.sceneObject.enabled = false;
      this.agentsEmptyView.sceneObject.enabled = false;
      return;
    }

    if (this._dockedAgentCount === 0) {
      this.agentsLoadingView.concealSpinner();
      wipeTransition(
        this.agentsLoadingView.sceneObject,
        this.agentsEmptyView.sceneObject,
        {
          cancelSet: this.animCancels,
          slideOffset: SLIDE_OFFSET,
          duration: ANIM_DURATION,
          staggerMs: STAGGER_MS,
          direction: "forward",
        },
      );
    } else {
      this.agentsLoadingView.sceneObject.enabled = false;
    }
  }
}
