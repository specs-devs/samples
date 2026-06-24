import { DirtyComponent } from "../Shared/DirtyComponent";
import { RoundedRectangle } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle";
import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { CapsuleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/CapsuleButton";
import { Tooltip } from "SpectaclesUIKit.lspkg/Scripts/Tooltip";
import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";
import {
  setTimeout,
  clearTimeout,
  CancelToken,
} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import { ChatMessageList } from "./ChatMessageList";
import { ChatSettingsPanel } from "./ChatSettingsPanel";
import { PermissionRequestView } from "./PermissionRequestView";
import { ChatMessage } from "../../Types";
import { AgentStore } from "../../State/AgentStore";
import { AgentObject } from "../Agent/AgentObject";
import { DialogueObject } from "../Shared/DialogueObject";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { MIN_SCALE, ICON_Z_OFFSET, TRASH_TEXTURE, CHEVRON_LEFT_TEXTURE, ANIM_DURATION } from "../Shared/UIConstants";
import {
  createTooltip,
  createAudioComponent,
  createText,
} from "../Shared/UIBuilders";
import { createImage } from "../Shared/ImageFactory";
import { PermissionPayload } from "../../Api/Supabase/Bridge/BridgeTypes";
import { TextSize, TextFont } from "../Shared/TextSizes";
import { SuggestionBar } from "../Input/SuggestionBar";
import {
  InteractableManipulation,
  TranslateEventArg,
} from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation";
import { Frame } from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame";
import HoverBehavior from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/modules/HoverBehavior";
import { Billboard } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Billboard/Billboard";
import { spawnDetachedImageFrame } from "./DetachedImageFrame";
import { LoadingSpinner } from "../../../Visuals/LoadingSpinner/LoadingSpinner";

const FOLDER_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/Folder.png",
) as Texture;
const TERMINAL_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/Terminal.png",
) as Texture;

const PANEL_INNER_SIZE = new vec2(30, 35);
const PADDING_ABOVE_VISUAL = 4;
const PADDING_BACK = 6;
const CONTENT_Z_OFFSET = 0.3;
const VIEWER_Z = CONTENT_Z_OFFSET + 5;
const VIEWER_PADDING = 2;
const POSITION_LERP_SPEED = 8;
const POSITION_THRESHOLD = 0.05;

const FOOTER_BTN_SIZE = 3;
const FOOTER_BTN_ICON_SIZE = 1.5;
const FOOTER_EMPTY_HEADER_HEIGHT = 2.5;
const FOOTER_EMPTY_SUB_HEIGHT = 1.5;
const FOOTER_EMPTY_TEXT_GAP = 0.3;
const FOOTER_SETTINGS_TITLE_HEIGHT = 4.0;
const PANEL_BG_CORNER_RADIUS = 2.5;
const PANEL_BG_COLOR = new vec4(0.07, 0.07, 0.09, 0.88);

const FOOTER_LABEL_HEIGHT = 2.5;
const FOOTER_LABEL_PADDING = 0.5;
const FOOTER_TOP_GAP = 1;
const FOOTER_GAP = -0.5;
const FOOTER_BTN_CLI_GAP = 1.0;
const SUGGESTION_BAR_GAP = 0;
const EMPTY_STATE_HEIGHT = 7;
const THREAD_LOADING_OVERLAY_COLOR = new vec4(0.04, 0.04, 0.06, 0.82);
const THREAD_LOADING_SPINNER_SIZE = 2.2;
const THREAD_LOADING_TEXT_HEIGHT = 1.5;
const THREAD_LOADING_STACK_GAP = 0.9;

const WS_BTN_WIDTH = 30;
const WS_BTN_HEIGHT = 4.5;
const WS_BTN_ICON_SIZE = 2.4;
const WS_BTN_ICON_GAP = 1.2;
const WS_BTN_PADDING = 1.5;
const WS_BTN_LINE_GAP = 0.225;
const WS_BTN_TEXT_H = 1;

const CLI_BTN_WIDTH = 9;
const CLI_BTN_HEIGHT = 2.5;
const CLI_BTN_DEPTH = 0.5;
const CLI_BTN_ICON_SIZE = 1.6;
const CLI_BTN_ICON_GAP = 0.6;
const CLI_BTN_H_PADDING = 1.2;

type PanelMode = "chat" | "settings";

@component
export class AgentChatPanel extends DirtyComponent {
  private panelBg: RoundedRectangle;
  private contentObj: SceneObject;
  private _innerSize: vec2 = new vec2(PANEL_INNER_SIZE.x, PANEL_INNER_SIZE.y);
  private trashBtnObj: SceneObject;
  private messageList: ChatMessageList;
  private store: AgentStore;
  private trackAgent: AgentObject | null = null;
  private animCancels = new CancelSet();
  private messageCancels = new CancelSet();
  private modeCancels = new CancelSet();
  private emptyCancels = new CancelSet();
  private imageViewerCancels = new CancelSet();
  private fullScale = vec3.one();
  private lastRobotLocalPos: vec3 | null = null;
  private lastContentTopY: number | null = null;
  private targetLocalPos = vec3.zero();
  private originalParent: SceneObject;

  private mode: PanelMode = "chat";
  private chatContentObj: SceneObject;
  private settingsPanel: ChatSettingsPanel;
  private dialogueObj: SceneObject;
  private dialogue: DialogueObject;
  private pendingConfirmAction:
    | "disconnect"
    | "delete"
    | "clearConversations"
    | null = null;
  private deleteTooltip: Tooltip;
  private pendingShowAnimation = false;
  private permissionView: PermissionRequestView;
  private pendingPermissionPayload: PermissionPayload | null = null;
  private audioComponent: AudioComponent;
  private folderRowObj: SceneObject;
  private workspaceLabel: Text;
  private suggestionBar: SuggestionBar;
  private suggestionBarObj: SceneObject;
  private workspaceBtnObj: SceneObject;
  private workspaceBtnLabel: Text;
  private hasMessages = false;
  private _scrollEnabled = false;
  private loadedTopicId: string | null = null;
  private emptyHeaderText: Text;
  private emptySubText: Text;
  private threadLoadingObj: SceneObject;
  private threadLoadingBg: RoundedRectangle;
  private threadLoadingSpinnerObj: SceneObject;
  private threadLoadingText: Text;
  private threadLoadingShape: BoxShape;
  private isThreadLoading = false;
  private _threadLoadingTimer: CancelToken | null = null;
  private _threadLoadingAnimCancels = new CancelSet();
  private settingsTitleObj: SceneObject;
  private settingsTitleText: Text;
  private settingsSubtitleObj: SceneObject;
  private settingsSubtitleText: Text;
  private topicTitleObj: SceneObject;
  private topicTitleText: Text;
  private cliButtonObj: SceneObject;
  private cliButtonEnabled = false;
  private cachedTopicTitleHeight = 0;
  private positionSettled = false;
  private _contentTopChangedUnsub: (() => void) | null = null;
  private _minimizeUnsub: (() => void) | null = null;
  private rootTransform: Transform;
  private readonly _scratchTargetPos = new vec3(0, 0, 0);

  private imageViewerObj: SceneObject;
  private imageViewerImage: Image;
  private imageViewerBackBtnObj: SceneObject;
  private imageViewerSourceBtn: SceneObject | null = null;
  private imageViewerSourceLocalPos: vec3 = vec3.zero();
  private imageViewerSourceScale: number = 1;
  private imageViewerShape: BoxShape;
  private imageViewerBillboard: Billboard;
  private imageViewerHoverCancels = new CancelSet();
  private detachedImageFrames: SceneObject[] = [];

  private _panelHovered = false;
  private _suggestionShowEvent: DelayedCallbackEvent | null = null;
  private _suggestionHideEvent: DelayedCallbackEvent | null = null;
  private _msgOffsetCancels = new CancelSet();

  public readonly onCloseRequested = new Event<void>();
  public readonly onPermissionDecision = new Event<
    "allow" | "allow_session" | "deny"
  >();
  public readonly onModeChanged = new Event<{
    mode: PanelMode;
    highlightSettings: boolean;
  }>();
  public readonly onDisconnectRequested = new Event<void>();
  public readonly onDeleteRequested = new Event<void>();
  public readonly onClearConversationsRequested = new Event<void>();
  public readonly onAddWorkspaceRequested = new Event<void>();
  public readonly onDiscoveredWorkspaceSelected = new Event<{
    path: string;
    name: string;
  }>();
  public readonly onThemeChanged = new Event<string>();
  public readonly onSmartFeatureChanged = new Event<{
    index: number;
    enabled: boolean;
  }>();
  public readonly onSuggestionTapped = new Event<string>();
  public readonly onOpenInCliRequested = new Event<void>();

  onAwake(): void {
    super.onAwake();
    const root = this.getSceneObject();
    this.originalParent = root.getParent();
    this.rootTransform = root.getTransform();
    const panelObj = global.scene.createSceneObject("ChatPanel");
    panelObj.setParent(root);
    panelObj.getTransform().setLocalPosition(vec3.zero());

    // Panel-level hover detection for suggestion bar — same approach as Frame:
    // collider+interactable on the parent object so the ray hits it even when
    // targeting a child button, without competing with scroll manipulation.
    const panelCollider = panelObj.createComponent(
      "ColliderComponent",
    ) as ColliderComponent;
    panelCollider.fitVisual = false;
    const panelShape = Shape.createBoxShape();
    panelShape.size = new vec3(PANEL_INNER_SIZE.x, PANEL_INNER_SIZE.y, 1);
    panelCollider.shape = panelShape;
    const panelInteractable = panelObj.createComponent(
      Interactable.getTypeName(),
    ) as Interactable;
    const panelHoverBehavior = new HoverBehavior(
      panelInteractable,
      "PanelHover",
    );
    this.createEvent("LateUpdateEvent").bind(() =>
      panelHoverBehavior.lateUpdate(),
    );
    panelHoverBehavior.onHoverStart.add(() => {
      if (this._suggestionHideEvent) {
        this._suggestionHideEvent.enabled = false;
        this._suggestionHideEvent = null;
      }
      if (this._panelHovered || this._suggestionShowEvent) return;
      // Delay showing suggestions until the user has hovered for 1 second.
      this._suggestionShowEvent = this.createEvent(
        "DelayedCallbackEvent",
      ) as DelayedCallbackEvent;
      this._suggestionShowEvent.bind(() => {
        this._suggestionShowEvent = null;
        this._panelHovered = true;
        if (this.mode === "chat") {
          this.suggestionBarObj.enabled = true;
          this.suggestionBar.setVisible(true);
          this.markPanelDirty();
          this._animateMsgOffset(true);
        }
      });
      this._suggestionShowEvent.reset(1.0);
    });
    panelHoverBehavior.onHoverEnd.add(() => {
      // If the 1-second show delay hasn't fired yet, cancel it — never showed.
      if (this._suggestionShowEvent) {
        this._suggestionShowEvent.enabled = false;
        this._suggestionShowEvent = null;
        return;
      }
      if (this._suggestionHideEvent) {
        this._suggestionHideEvent.enabled = false;
      }
      this._suggestionHideEvent = this.createEvent(
        "DelayedCallbackEvent",
      ) as DelayedCallbackEvent;
      this._suggestionHideEvent.bind(() => {
        this._suggestionHideEvent = null;
        this._panelHovered = false;
        if (this.mode === "chat") {
          this.suggestionBarObj.enabled = false;
          this.suggestionBar.setVisible(false);
          this.markPanelDirty();
          this._animateMsgOffset(false);
        }
      });
      this._suggestionHideEvent.reset(0.4);
    });

    // Background
    const bgObj = global.scene.createSceneObject("PanelBg");
    bgObj.setParent(panelObj);
    bgObj.getTransform().setLocalPosition(new vec3(0, 0, -0.1));
    this.panelBg = bgObj.createComponent(
      RoundedRectangle.getTypeName(),
    ) as RoundedRectangle;
    this.panelBg.size = PANEL_INNER_SIZE;
    this.panelBg.cornerRadius = PANEL_BG_CORNER_RADIUS;
    this.panelBg.backgroundColor = PANEL_BG_COLOR;
    this.panelBg.initialize();
    this.panelBg.renderMeshVisual.mainPass.blendMode =
      BlendMode.PremultipliedAlphaAuto;
    this.panelBg.renderMeshVisual.mainPass.colorMask = new vec4b(
      true,
      true,
      true,
      true,
    );

    // Content container (equivalent to frame.content)
    this.contentObj = global.scene.createSceneObject("PanelContent");
    this.contentObj.setParent(panelObj);
    this.contentObj.getTransform().setLocalPosition(vec3.zero());

    this._innerSize = new vec2(PANEL_INNER_SIZE.x, PANEL_INNER_SIZE.y);

    // Trash button — bottom-right footer corner
    this.trashBtnObj = global.scene.createSceneObject("TrashBtn");
    this.trashBtnObj.setParent(panelObj);
    const trashBtn = this.trashBtnObj.createComponent(
      RectangleButton.getTypeName(),
    ) as RectangleButton;
    trashBtn.size = new vec3(FOOTER_BTN_SIZE, FOOTER_BTN_SIZE, 0.5);
    trashBtn.initialize();
    createImage(TRASH_TEXTURE, {
      parent: this.trashBtnObj,
      name: "TrashIcon",
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: FOOTER_BTN_ICON_SIZE,
    });
    this.deleteTooltip = createTooltip(
      this.trashBtnObj,
      "Delete Conversation",
      {
        hoverSource: trashBtn,
      },
    );
    trashBtn.onTriggerUp.add(() => {
      this.pendingConfirmAction = "delete";
      if (this.mode === "chat") {
        this.chatContentObj.enabled = false;
      } else {
        this.settingsPanel.contentObject.enabled = false;
      }
      this.dialogueObj.enabled = true;
      this.dialogue.showConfirmation(
        "Delete Conversation",
        "Are you sure you want to delete this conversation?",
      );
      this.repositionDialogue();
    });

    this.topicTitleText = createText({
      parent: panelObj,
      name: "TopicTitle",
      text: "New Chat",
      size: TextSize.M,
      font: TextFont.Medium,
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Left,
      verticalAlignment: VerticalAlignment.Center,
    });
    this.topicTitleObj = this.topicTitleText.getSceneObject();

    this.settingsTitleText = createText({
      parent: panelObj,
      name: "SettingsTitle",
      text: "Settings",
      size: TextSize.XXL,
      font: TextFont.SemiBold,
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Center,
      verticalAlignment: VerticalAlignment.Center,
      worldSpaceRect: Rect.create(
        -PANEL_INNER_SIZE.x / 2,
        PANEL_INNER_SIZE.x / 2,
        -FOOTER_SETTINGS_TITLE_HEIGHT / 2,
        FOOTER_SETTINGS_TITLE_HEIGHT / 2,
      ),
    });
    this.settingsTitleObj = this.settingsTitleText.getSceneObject();
    this.settingsTitleObj.enabled = false;

    this.settingsSubtitleText = createText({
      parent: panelObj,
      name: "SettingsSubtitle",
      text: "",
      size: TextSize.M,
      color: new vec4(1, 1, 1, 0.55),
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Center,
      verticalAlignment: VerticalAlignment.Center,
      worldSpaceRect: Rect.create(
        -PANEL_INNER_SIZE.x / 2,
        PANEL_INNER_SIZE.x / 2,
        -FOOTER_LABEL_HEIGHT / 2,
        FOOTER_LABEL_HEIGHT / 2,
      ),
    });
    this.settingsSubtitleObj = this.settingsSubtitleText.getSceneObject();
    this.settingsSubtitleObj.enabled = false;

    this.chatContentObj = global.scene.createSceneObject("ChatContent");
    this.chatContentObj.setParent(this.contentObj);
    this.chatContentObj
      .getTransform()
      .setLocalPosition(new vec3(0, 0, CONTENT_Z_OFFSET));
    this.messageList = this.chatContentObj.createComponent(
      ChatMessageList.getTypeName(),
    ) as ChatMessageList;
    this.messageList.configure(PANEL_INNER_SIZE.x - 4, PANEL_INNER_SIZE.y);
    this.messageList.onImageTapped.add(
      ({ texture, sourceObj, srcWidth, srcHeight }) => {
        this.showImageViewer(texture, sourceObj, srcWidth, srcHeight);
      },
    );
    this.setInnerSize(
      new vec2(PANEL_INNER_SIZE.x, this.messageList.getEffectiveHeight()),
    );

    this.workspaceBtnObj = global.scene.createSceneObject("WorkspacePickerBtn");
    this.workspaceBtnObj.setParent(this.chatContentObj);
    this.workspaceBtnObj.getTransform().setLocalPosition(new vec3(0, 0, 0.5));

    const wsBtn = this.workspaceBtnObj.createComponent(
      RectangleButton.getTypeName(),
    ) as RectangleButton;
    wsBtn.size = new vec3(WS_BTN_WIDTH, WS_BTN_HEIGHT, 0.5);
    wsBtn.initialize();

    const wsBtnIconX =
      -WS_BTN_WIDTH / 2 + WS_BTN_PADDING + WS_BTN_ICON_SIZE / 2;
    createImage(FOLDER_TEXTURE, {
      parent: this.workspaceBtnObj,
      name: "WsBtnFolderIcon",
      position: new vec3(wsBtnIconX, 0, ICON_Z_OFFSET),
      size: WS_BTN_ICON_SIZE,
    });

    const wsBtnTextLeft = wsBtnIconX + WS_BTN_ICON_SIZE / 2 + WS_BTN_ICON_GAP;
    const wsBtnTextRight = WS_BTN_WIDTH / 2 - WS_BTN_PADDING;
    const wsBtnTextCenterX = (wsBtnTextLeft + wsBtnTextRight) / 2;
    const wsBtnTextHalfW = (wsBtnTextRight - wsBtnTextLeft) / 2;
    const textHalfH = WS_BTN_TEXT_H / 2;

    const headerY = WS_BTN_LINE_GAP / 2 + textHalfH;
    const pathY = -(WS_BTN_LINE_GAP / 2 + textHalfH);

    createText({
      parent: this.workspaceBtnObj,
      name: "WsBtnHeader",
      text: "Workspace",
      size: TextSize.M,
      font: TextFont.Medium,
      position: new vec3(wsBtnTextCenterX, headerY, ICON_Z_OFFSET),
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Left,
      verticalAlignment: VerticalAlignment.Center,
      worldSpaceRect: Rect.create(
        -wsBtnTextHalfW,
        wsBtnTextHalfW,
        -textHalfH,
        textHalfH,
      ),
    });

    this.workspaceBtnLabel = createText({
      parent: this.workspaceBtnObj,
      name: "WsBtnPath",
      text: "No workspace",
      size: TextSize.XS,
      color: new vec4(1, 1, 1, 0.55),
      position: new vec3(wsBtnTextCenterX, pathY, ICON_Z_OFFSET),
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Left,
      verticalAlignment: VerticalAlignment.Center,
      worldSpaceRect: Rect.create(
        -wsBtnTextHalfW,
        wsBtnTextHalfW,
        -textHalfH,
        textHalfH,
      ),
    });

    createTooltip(this.workspaceBtnObj, "Change Workspace", {
      hoverSource: wsBtn,
    });
    wsBtn.onTriggerUp.add(() => this.openRepoSelection());

    const emptyTextHalfW = PANEL_INNER_SIZE.x / 2;

    this.emptyHeaderText = createText({
      parent: panelObj,
      name: "EmptyHeader",
      text: "New Chat",
      size: TextSize.M,
      font: TextFont.Medium,
      position: new vec3(0, 0, ICON_Z_OFFSET),
      horizontalAlignment: HorizontalAlignment.Left,
      verticalAlignment: VerticalAlignment.Center,
      worldSpaceRect: Rect.create(
        0,
        emptyTextHalfW * 2,
        -FOOTER_EMPTY_HEADER_HEIGHT / 2,
        FOOTER_EMPTY_HEADER_HEIGHT / 2,
      ),
    });

    this.emptySubText = createText({
      parent: panelObj,
      name: "EmptySubtext",
      text: "Send a message to get started",
      size: TextSize.S,
      color: new vec4(1, 1, 1, 0.55),
      position: new vec3(0, 0, ICON_Z_OFFSET),
      horizontalAlignment: HorizontalAlignment.Left,
      verticalAlignment: VerticalAlignment.Center,
      worldSpaceRect: Rect.create(
        0,
        emptyTextHalfW * 2,
        -FOOTER_EMPTY_SUB_HEIGHT / 2,
        FOOTER_EMPTY_SUB_HEIGHT / 2,
      ),
    });

    this.threadLoadingObj = global.scene.createSceneObject(
      "ThreadLoadingOverlay",
    );
    this.threadLoadingObj.setParent(panelObj);
    this.threadLoadingObj
      .getTransform()
      .setLocalPosition(new vec3(0, 0, CONTENT_Z_OFFSET + 0.2));

    const loadingCollider = this.threadLoadingObj.createComponent(
      "ColliderComponent",
    ) as ColliderComponent;
    loadingCollider.fitVisual = false;
    this.threadLoadingShape = Shape.createBoxShape();
    this.threadLoadingShape.size = new vec3(
      PANEL_INNER_SIZE.x,
      PANEL_INNER_SIZE.y,
      2,
    );
    loadingCollider.shape = this.threadLoadingShape;
    this.threadLoadingObj.createComponent(Interactable.getTypeName());

    const loadingBgObj = global.scene.createSceneObject("ThreadLoadingBg");
    loadingBgObj.setParent(this.threadLoadingObj);
    loadingBgObj.getTransform().setLocalPosition(new vec3(0, 0, -0.05));
    this.threadLoadingBg = loadingBgObj.createComponent(
      RoundedRectangle.getTypeName(),
    ) as RoundedRectangle;
    this.threadLoadingBg.size = PANEL_INNER_SIZE;
    this.threadLoadingBg.cornerRadius = PANEL_BG_CORNER_RADIUS;
    this.threadLoadingBg.backgroundColor = THREAD_LOADING_OVERLAY_COLOR;
    this.threadLoadingBg.initialize();
    this.threadLoadingBg.renderMeshVisual.mainPass.blendMode =
      BlendMode.PremultipliedAlphaAuto;

    this.threadLoadingSpinnerObj = global.scene.createSceneObject(
      "ThreadLoadingSpinner",
    );
    this.threadLoadingSpinnerObj.setParent(this.threadLoadingObj);
    this.threadLoadingSpinnerObj
      .getTransform()
      .setLocalScale(
        new vec3(
          THREAD_LOADING_SPINNER_SIZE,
          THREAD_LOADING_SPINNER_SIZE,
          1,
        ),
      );
    const loadingSpinner = this.threadLoadingSpinnerObj.createComponent(
      LoadingSpinner.getTypeName(),
    ) as LoadingSpinner;
    loadingSpinner.renderOrder = 1;

    this.threadLoadingText = createText({
      parent: this.threadLoadingObj,
      name: "ThreadLoadingText",
      text: "Loading conversation...",
      size: TextSize.S,
      color: new vec4(1, 1, 1, 0.6),
      horizontalAlignment: HorizontalAlignment.Center,
      verticalAlignment: VerticalAlignment.Center,
      worldSpaceRect: Rect.create(
        -PANEL_INNER_SIZE.x / 2,
        PANEL_INNER_SIZE.x / 2,
        -THREAD_LOADING_TEXT_HEIGHT / 2,
        THREAD_LOADING_TEXT_HEIGHT / 2,
      ),
    });
    this.repositionThreadLoadingOverlay();
    this.threadLoadingObj.enabled = false;

    this.dialogueObj = global.scene.createSceneObject("DialogueContainer");
    this.dialogueObj.setParent(this.contentObj);
    this.dialogueObj
      .getTransform()
      .setLocalPosition(new vec3(0, 0, CONTENT_Z_OFFSET + 0.25));
    this.dialogue = this.dialogueObj.createComponent(
      DialogueObject.getTypeName(),
    ) as DialogueObject;

    this.dialogue.onClosed.add(() => {
      if (this.mode === "chat") {
        this.chatContentObj.enabled = true;
      } else {
        this.settingsPanel.contentObject.enabled = true;
      }
      this.dialogueObj.enabled = false;
      this.pendingConfirmAction = null;
    });

    this.dialogue.onConfirmed.add(() => {
      if (this.pendingConfirmAction === "delete") {
        this.onDeleteRequested.invoke(undefined);
      } else if (this.pendingConfirmAction === "clearConversations") {
        this.onClearConversationsRequested.invoke(undefined);
      } else {
        this.onDisconnectRequested.invoke(undefined);
      }
      this.pendingConfirmAction = null;
    });

    this.dialogueObj.enabled = false;

    this.createImageViewer();

    this.folderRowObj = global.scene.createSceneObject("FolderRow");
    this.folderRowObj.setParent(panelObj);

    this.workspaceLabel = createText({
      parent: this.folderRowObj,
      name: "WorkspaceLabel",
      text: "No workspace",
      size: TextSize.S,
      color: new vec4(1, 1, 1, 0.5),
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Left,
      verticalAlignment: VerticalAlignment.Center,
    });

    this.suggestionBarObj = global.scene.createSceneObject(
      "SuggestionBarContainer",
    );
    this.suggestionBarObj.setParent(this.contentObj);
    this.suggestionBarObj
      .getTransform()
      .setLocalPosition(new vec3(0, 0, CONTENT_Z_OFFSET));
    this.suggestionBar = this.suggestionBarObj.createComponent(
      SuggestionBar.getTypeName(),
    ) as SuggestionBar;
    this.suggestionBar.onSuggestionTapped.add((text: string) => {
      this.onSuggestionTapped.invoke(text);
    });

    this.cliButtonObj = global.scene.createSceneObject("OpenInCliBtn");
    this.cliButtonObj.setParent(panelObj);

    const cliBtn = this.cliButtonObj.createComponent(
      CapsuleButton.getTypeName(),
    ) as CapsuleButton;
    cliBtn.size = new vec3(CLI_BTN_WIDTH, CLI_BTN_HEIGHT, CLI_BTN_DEPTH);
    cliBtn.initialize();

    const cliIconX =
      -CLI_BTN_WIDTH / 2 + CLI_BTN_H_PADDING + CLI_BTN_ICON_SIZE / 2;
    createImage(TERMINAL_TEXTURE, {
      parent: this.cliButtonObj,
      name: "CliBtnIcon",
      position: new vec3(cliIconX, 0, ICON_Z_OFFSET),
      size: CLI_BTN_ICON_SIZE,
    });

    const cliTextLeft = cliIconX + CLI_BTN_ICON_SIZE / 2 + CLI_BTN_ICON_GAP;
    const cliTextRight = CLI_BTN_WIDTH / 2 - CLI_BTN_H_PADDING;
    const cliTextCenterX = (cliTextLeft + cliTextRight) / 2;
    const cliTextHalfW = (cliTextRight - cliTextLeft) / 2;

    createText({
      parent: this.cliButtonObj,
      name: "CliBtnLabel",
      text: "Open in CLI",
      size: TextSize.M,
      font: TextFont.Medium,
      color: new vec4(1, 1, 1, 0.9),
      position: new vec3(cliTextCenterX, 0, ICON_Z_OFFSET),
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Center,
      verticalAlignment: VerticalAlignment.Center,
      worldSpaceRect: Rect.create(
        -cliTextHalfW,
        cliTextHalfW,
        -CLI_BTN_HEIGHT / 2,
        CLI_BTN_HEIGHT / 2,
      ),
    });

    createTooltip(this.cliButtonObj, "Continue in terminal", {
      hoverSource: cliBtn,
    });
    cliBtn.onTriggerUp.add(() => this.onOpenInCliRequested.invoke());
    this.cliButtonObj.enabled = false;

    this.audioComponent = createAudioComponent(root);

    this.permissionView = new PermissionRequestView(
      this.audioComponent,
      this.animCancels,
      this,
    );
    this.permissionView.onDecision.add((decision) => {
      this.onPermissionDecision.invoke(decision);
      this.onPermissionHidden();
    });
    this.permissionView.onLayoutReady.add(() => {
      if (this.mode === "chat") {
        this.markPanelDirty();
      } else {
        this.repositionPermissionContainer();
      }
    });

    this.repositionFooterButtons();

    root.enabled = false;
  }

  setStore(store: AgentStore): void {
    this.store = store;
    this.settingsPanel = new ChatSettingsPanel(
      this.contentObj,
      store,
      PANEL_INNER_SIZE.x,
      CONTENT_Z_OFFSET,
      this,
    );
    this.wireSettingsEvents();
  }

  private getAgentId(): string | null {
    return this.trackAgent?.getAgent()?.id ?? null;
  }

  private wireSettingsEvents(): void {
    this.settingsPanel.onSelectionComplete.add(() => {
      this.updateWorkspaceLabel();
      this.setMode("chat");
    });
    this.settingsPanel.onDisconnectTilePressed.add(() => {
      this.pendingConfirmAction = "disconnect";
      this.dialogueObj.enabled = true;
      this.dialogue.showConfirmation(
        "Disconnect",
        "Are you sure you want to disconnect this agent?",
      );
      this.repositionDialogue();
    });
    this.settingsPanel.onClearConversationsPressed.add(() => {
      this.pendingConfirmAction = "clearConversations";
      this.dialogueObj.enabled = true;
      this.dialogue.showConfirmation(
        "Clear Conversations",
        "Are you sure you want to clear all conversations for this agent?",
      );
      this.repositionDialogue();
    });
    this.settingsPanel.onRepoChanged.add(() => {
      this.updateWorkspaceLabel();
    });
    this.settingsPanel.onAddWorkspaceRequested.add(() =>
      this.onAddWorkspaceRequested.invoke(undefined),
    );
    this.settingsPanel.onDiscoveredWorkspaceSelected.add((ws) =>
      this.onDiscoveredWorkspaceSelected.invoke(ws),
    );
    this.settingsPanel.onThemeChanged.add((theme) =>
      this.onThemeChanged.invoke(theme),
    );
    this.settingsPanel.onSmartFeatureChanged.add((e) =>
      this.onSmartFeatureChanged.invoke(e),
    );
    this.settingsPanel.onBackToChat.add(() => {
      this.setMode("chat");
    });
    this.settingsPanel.onSubtitleChanged.add((subtitle: string | null) => {
      this.settingsSubtitleText.text = subtitle ?? "";
      this.settingsSubtitleObj.enabled = subtitle !== null;
      this.repositionSettingsTitle();
    });
    this.settingsPanel.onContentHeightChanged.add((height: number) => {
      if (this.mode !== "settings") return;
      const prevHalfHeight = this._innerSize.y / 2;
      this.setInnerSize(new vec2(PANEL_INNER_SIZE.x, height));
      this.settingsPanel.setVerticalOffset(0);
      const newHalfHeight = this._innerSize.y / 2;
      const delta = newHalfHeight - prevHalfHeight;
      if (Math.abs(delta) > 0.001) {
        this.targetLocalPos = new vec3(
          this.targetLocalPos.x,
          this.targetLocalPos.y + delta,
          this.targetLocalPos.z,
        );
      }
      this.repositionTopicTitle(this.getTopicTitleHeight());
      this.repositionSettingsTitle();
    });
  }

  showDiscoveredWorkspaces(
    workspaces: Array<{ path: string; name: string }>,
  ): void {
    this.settingsPanel.showDiscoveredWorkspaces(workspaces);
  }

  show(agent: AgentObject): void {
    // If the panel is already open in settings, stay there — don't auto-switch to chat
    // (e.g. bridge reconnected while user was viewing settings)
    const wasShowingInSettings =
      this.trackAgent !== null && this.mode === "settings";

    this.trackAgent = agent;
    this.positionSettled = false;
    this._contentTopChangedUnsub?.();
    this._contentTopChangedUnsub = agent.onContentTopChanged.add(() => {
      this.positionSettled = false;
      this.setTracking(true);
    });
    this.setTracking(true);
    this.settingsPanel.setAgentId(agent.getAgent()?.id ?? null);
    this.animCancels.cancel();
    this.messageCancels.cancel();
    this.loadedTopicId = null;
    this.pendingShowAnimation = true;
    this.lastRobotLocalPos = agent.getRobotTransform().getLocalPosition();
    this.lastContentTopY = agent.getContentTopLocalY();
    this.updateWorkspaceLabel();
    if (!wasShowingInSettings) {
      this.setMode("chat");
    }

    this._minimizeUnsub?.();
    this._minimizeUnsub = agent
      .getChatSelector()
      .onMinimizeRequested.add(() => {
        this.onCloseRequested.invoke();
      });
    agent.getChatSelector().setMinimizeBtnVisible(!agent.isClone);

    const root = this.getSceneObject();
    root.setParent(agent.getSceneObject());
    root.enabled = true;

    if (this.pendingPermissionPayload !== null) {
      const payload = this.pendingPermissionPayload;
      this.pendingPermissionPayload = null;
      this.showPermissionRequest(payload);
    }

    if (wasShowingInSettings) return;

    const startPos = new vec3(
      this.targetLocalPos.x,
      this.lastContentTopY,
      this.targetLocalPos.z,
    );
    const startScale = new vec3(MIN_SCALE, MIN_SCALE, MIN_SCALE);

    this.rootTransform.setLocalPosition(startPos);
    this.rootTransform.setLocalRotation(quat.quatIdentity());
    this.rootTransform.setLocalScale(startScale);

    animate({
      duration: ANIM_DURATION,
      easing: "ease-out-back",
      cancelSet: this.animCancels,
      update: (t: number) => {
        this.rootTransform.setLocalScale(
          vec3.lerp(startScale, this.fullScale, t),
        );
        this.rootTransform.setLocalPosition(
          vec3.lerp(startPos, this.targetLocalPos, t),
        );
      },
      ended: () => {
        this.rootTransform.setLocalScale(this.fullScale);
        this.rootTransform.setLocalPosition(this.targetLocalPos);
      },
    });
  }

  hide(): void {
    this._minimizeUnsub?.();
    this._minimizeUnsub = null;
    if (this.trackAgent) {
      this.trackAgent.getChatSelector().setMinimizeBtnVisible(false);
    }
    this.animCancels.cancel();
    this.messageCancels.cancel();
    this.modeCancels.cancel();
    this.emptyCancels.cancel();
    this.hideThreadLoading();

    const root = this.getSceneObject();
    const startScale = this.rootTransform.getLocalScale();
    const endScale = new vec3(MIN_SCALE, MIN_SCALE, MIN_SCALE);

    const startPos = this.rootTransform.getLocalPosition();
    const endY = this.trackAgent
      ? this.trackAgent.getContentTopLocalY()
      : startPos.y;
    const endPos = new vec3(startPos.x, endY, startPos.z);

    animate({
      duration: ANIM_DURATION * 0.6,
      easing: "ease-in-cubic",
      cancelSet: this.animCancels,
      update: (t: number) => {
        if (isNull(root)) return;
        this.rootTransform.setLocalScale(vec3.lerp(startScale, endScale, t));
        this.rootTransform.setLocalPosition(vec3.lerp(startPos, endPos, t));
      },
      ended: () => {
        if (isNull(root)) {
          this._contentTopChangedUnsub?.();
          this._contentTopChangedUnsub = null;
          this.trackAgent = null;
          this.setTracking(false);
          this.settingsPanel.setAgentId(null);
          this.lastRobotLocalPos = null;
          this.lastContentTopY = null;
          this.loadedTopicId = null;
          this.mode = "chat";
          this.messageList.setScrollEnabled(false);
          this._scrollEnabled = false;
          return;
        }
        this.rootTransform.setLocalScale(endScale);
        this._contentTopChangedUnsub?.();
        this._contentTopChangedUnsub = null;
        this.trackAgent = null;
        this.setTracking(false);
        this.settingsPanel.setAgentId(null);
        this.lastRobotLocalPos = null;
        this.lastContentTopY = null;
        this.loadedTopicId = null;
        root.setParent(this.originalParent);
        this.messageList.setScrollEnabled(false);
        this._scrollEnabled = false;
        root.enabled = false;
        this.mode = "chat";
      },
    });
  }

  isShowing(): boolean {
    return this.trackAgent !== null;
  }

  getTrackAgent(): AgentObject | null {
    return this.trackAgent;
  }

  getMode(): PanelMode {
    return this.mode;
  }

  toggleSettings(): void {
    this.setMode(this.mode === "chat" ? "settings" : "chat", true);
  }

  private setMode(
    mode: PanelMode,
    highlightSettings = false,
    skipSettingsContent = false,
  ): void {
    this.modeCancels.cancel();
    this.emptyCancels.cancel();
    const prevMode = this.mode;
    this.mode = mode;

    // All per-element toggles remain instant
    this.folderRowObj.enabled = mode === "chat" && this.hasMessages;
    const isNewChat = this.topicTitleText.text === "New Chat";
    this.topicTitleObj.enabled =
      mode === "chat" && !isNewChat && this.hasMessages;
    this.suggestionBarObj.enabled = mode === "chat" && this._panelHovered;
    this.suggestionBar.setVisible(mode === "chat" && this._panelHovered);
    this.cliButtonObj.enabled =
      this.cliButtonEnabled && this.hasMessages && mode === "chat";

    this.dialogue.forceClose();
    this.dialogueObj.enabled = false;
    this.settingsPanel.resetDialogue();

    const deleteScale = mode === "chat" ? vec3.one() : vec3.zero();
    this.trashBtnObj.getTransform().setLocalScale(deleteScale);

    this.settingsTitleObj.enabled = mode === "settings";
    this.settingsSubtitleObj.enabled = false;
    this.settingsSubtitleText.text = "";
    if (mode === "settings") {
      const agentName = this.trackAgent?.getAgent()?.name ?? "Agent";
      this.settingsTitleText.text = `${agentName} Settings`;
    }

    // Empty-state decorations live outside chatContentObj so must be hidden explicitly
    if (mode === "settings") {
      this.emptyHeaderText.getSceneObject().enabled = false;
      this.emptySubText.getSceneObject().enabled = false;
      // Reset opacity so they look correct when returning to an empty chat
      this.emptyHeaderText.textFill.color = new vec4(1, 1, 1, 1);
      this.emptySubText.textFill.color = new vec4(1, 1, 1, 0.55);
    } else if (!this.hasMessages) {
      this.emptyHeaderText.getSceneObject().enabled = true;
      this.emptySubText.getSceneObject().enabled = true;
    }

    if (mode === "settings") {
      this.clearDirty();
      this.settingsPanel.ensureContent();
      this.settingsPanel.updateLabels();
      const contentHeight = this.settingsPanel.getContentHeight();
      this.setInnerSize(new vec2(PANEL_INNER_SIZE.x, contentHeight));
      this.settingsPanel.setVerticalOffset(0);
      this.repositionTopicTitle(this.getTopicTitleHeight());
      this.repositionSettingsTitle();
    } else {
      this.markPanelDirty();
    }

    if (this.trackAgent) {
      this.targetLocalPos = this.computeLocalTargetPos();
    }

    this.onModeChanged.invoke({ mode, highlightSettings });

    const MODE_SLIDE_Y = -3;
    const MODE_START_SCALE = 0.88;

    // No animation when mode hasn't changed (initial setup call)
    if (prevMode === mode) {
      this.chatContentObj.enabled = mode === "chat";
      this.chatContentObj.getTransform().setLocalPosition(vec3.zero());
      this.chatContentObj.getTransform().setLocalScale(vec3.one());
      this.threadLoadingObj.enabled = mode === "chat" && this.isThreadLoading;
      this.settingsPanel.sceneObject.enabled = mode === "settings";
      this.settingsPanel.sceneObject
        .getTransform()
        .setLocalPosition(vec3.zero());
      this.settingsPanel.sceneObject.getTransform().setLocalScale(vec3.one());
      if (mode === "settings" && !skipSettingsContent) {
        this.settingsPanel.showContent();
      }
      return;
    }

    if (mode === "settings") {
      this.chatContentObj.enabled = false;
      this.threadLoadingObj.enabled = false;
      if (!skipSettingsContent) this.settingsPanel.showContent();
      const inObj = this.settingsPanel.sceneObject;
      inObj.enabled = true;
      inObj.getTransform().setLocalPosition(vec3.zero());
      inObj.getTransform().setLocalScale(vec3.one());
    } else {
      this.settingsPanel.sceneObject.enabled = false;
      this.settingsPanel.sceneObject
        .getTransform()
        .setLocalPosition(vec3.zero());
      this.settingsPanel.sceneObject.getTransform().setLocalScale(vec3.one());
      this.threadLoadingObj.enabled = this.isThreadLoading;
      const inObj = this.chatContentObj;
      inObj.enabled = true;
      const inTransform = inObj.getTransform();
      inTransform.setLocalPosition(new vec3(0, MODE_SLIDE_Y, 0));
      inTransform.setLocalScale(
        new vec3(MODE_START_SCALE, MODE_START_SCALE, MODE_START_SCALE),
      );
      animate({
        duration: ANIM_DURATION,
        easing: "ease-out-cubic",
        cancelSet: this.modeCancels,
        update: (t: number) => {
          if (isNull(inObj)) return;
          inTransform.setLocalPosition(new vec3(0, MODE_SLIDE_Y * (1 - t), 0));
          const s = MODE_START_SCALE + (1 - MODE_START_SCALE) * t;
          inTransform.setLocalScale(new vec3(s, s, s));
        },
        ended: () => {
          if (isNull(inObj)) return;
          inTransform.setLocalPosition(vec3.zero());
          inTransform.setLocalScale(vec3.one());
        },
      });
    }
  }

  loadThread(
    topicId: string | null,
    agentName: string,
    messages: ChatMessage[],
  ): void {
    this.hideImageViewer();
    this.hideThreadLoading();
    // Enable scroll before loading so that ChatMessageBubble.updateLayout()'s
    // getBoundingBox() calls work correctly. Bubbles live inside scrollObj's
    // hierarchy, and a disabled ancestor returns stale/zero bounds.
    // updateEmptyState() below will disable scroll again if messages is empty.
    this.messageList.setScrollEnabled(true);
    const topicChanged = this.loadedTopicId !== topicId;
    const threadChanged = this.messageList.loadThread(agentName, messages);
    this.updateWorkspaceLabel();
    this.updateEmptyState();
    if (this.mode === "chat") {
      if (this.messageList.getMessageCount() === 0) {
        this.clearDirty();
        this.updatePanelSize();
        if (this.trackAgent) {
          this.targetLocalPos = this.computeLocalTargetPos();
          this.rootTransform.setLocalPosition(this.targetLocalPos);
        }
        this.animateEmptyStateIn();
      } else {
        this.markPanelDirty();
      }
    }
    this.pendingShowAnimation = false;
    this.messageCancels.cancel();
    if (topicChanged || threadChanged) {
      this.messageList.animateMessagesIn(this.messageCancels);
    }
    this.loadedTopicId = topicId;
    this.getSceneObject().getTransform().setLocalRotation(quat.quatIdentity());
  }

  addMessage(msg: ChatMessage, agentName: string): void {
    this.messageList.addMessage(msg, agentName);
    this.updateEmptyState();
    if (this.mode === "chat") {
      this.markPanelDirty();
    }
  }

  showPermissionRequest(payload: PermissionPayload): void {
    // If the panel isn't open, the UpdateEvent that drives permission-view text
    // measurement won't fire (it's owned by this disabled scene object).
    // Store the payload and show it lazily in show() once the panel opens.
    if (!this.getSceneObject().enabled) {
      this.pendingPermissionPayload = payload;
      return;
    }
    const agentId = this.getAgentId();
    const explainerEnabled =
      agentId != null && this.store.isPermissionExplainerEnabled(agentId);
    const agentName = this.trackAgent?.getAgent()?.name ?? "Agent";
    const topicId =
      agentId != null ? this.store.getActiveTopicId(agentId) : null;
    const recentMessages =
      topicId != null ? this.store.getMessagesForTopic(topicId) : [];
    this.permissionView.show(
      this.contentObj,
      payload,
      PANEL_INNER_SIZE.x,
      CONTENT_Z_OFFSET,
      explainerEnabled,
      agentName,
      recentMessages,
    );
    if (this.mode === "chat") {
      this.markPanelDirty();
    } else {
      this.repositionPermissionContainer();
    }
  }

  hidePermissionRequest(): void {
    this.pendingPermissionPayload = null;
    this.permissionView.hide();
    this.onPermissionHidden();
  }

  private onPermissionHidden(): void {
    if (this.mode === "chat") {
      this.markPanelDirty();
    }
  }

  private updatePanelSize(): void {
    const prevHeight = this._innerSize.y;
    const minHeight = this.hasMessages
      ? this.messageList.getEffectiveHeight()
      : EMPTY_STATE_HEIGHT;
    // Suggestion bar is an overlay outside the panel bounds — don't include it
    // in panel height so the footer never shifts when suggestions appear.
    const contentHeight = Math.max(minHeight, this.permissionView.getHeight());
    if (Math.abs(contentHeight - prevHeight) > 0.001) {
      this.setInnerSize(new vec2(PANEL_INNER_SIZE.x, contentHeight));
      const delta = (contentHeight - prevHeight) / 2;
      if (Math.abs(delta) > 0.001) {
        this.targetLocalPos = new vec3(
          this.targetLocalPos.x,
          this.targetLocalPos.y + delta,
          this.targetLocalPos.z,
        );
      }
    }
    const titleH = this.getTopicTitleHeight();
    this.repositionPermissionContainer();
    this.repositionFolderButton(titleH);
    this.repositionCliButton(titleH);
    this.repositionSuggestionBar();
    this.repositionTopicTitle(titleH);
  }

  private getTopicTitleHeight(): number {
    return this.cachedTopicTitleHeight;
  }

  private repositionTopicTitle(titleH: number): void {
    const halfH = this._innerSize.y / 2;
    const halfW = PANEL_INNER_SIZE.x / 2;
    const cliVisible = this.cliButtonObj.enabled;
    const reservedRight = cliVisible
      ? FOOTER_BTN_SIZE +
        FOOTER_BTN_CLI_GAP +
        CLI_BTN_WIDTH +
        FOOTER_LABEL_PADDING
      : FOOTER_BTN_SIZE + FOOTER_LABEL_PADDING;
    const labelWidth =
      PANEL_INNER_SIZE.x - FOOTER_LABEL_PADDING - reservedRight;
    this.topicTitleText.worldSpaceRect = Rect.create(0, labelWidth, -10, 10);
    const titleY = -halfH - FOOTER_TOP_GAP - titleH / 2;
    this.topicTitleObj
      .getTransform()
      .setLocalPosition(
        new vec3(-halfW + FOOTER_LABEL_PADDING, titleY, ICON_Z_OFFSET),
      );
  }

  private repositionFolderButton(titleH: number): void {
    const halfW = this._innerSize.x / 2;
    const halfH = this._innerSize.y / 2;
    const titleVisible = this.topicTitleObj.enabled;
    const titleSection = titleVisible
      ? FOOTER_TOP_GAP + titleH + FOOTER_GAP
      : 0;
    const rowY = -halfH - titleSection - FOOTER_LABEL_HEIGHT / 2;
    this.folderRowObj
      .getTransform()
      .setLocalPosition(new vec3(0, rowY, ICON_Z_OFFSET));

    const cliVisibleFolder = this.cliButtonObj.enabled;
    const reservedRightFolder = cliVisibleFolder
      ? FOOTER_BTN_SIZE +
        FOOTER_BTN_CLI_GAP +
        CLI_BTN_WIDTH +
        FOOTER_LABEL_PADDING
      : FOOTER_BTN_SIZE + FOOTER_LABEL_PADDING;
    const labelWidth =
      this._innerSize.x - FOOTER_LABEL_PADDING - reservedRightFolder;
    const labelObj = this.workspaceLabel.getSceneObject();
    labelObj
      .getTransform()
      .setLocalPosition(
        new vec3(-halfW + FOOTER_LABEL_PADDING, 0, ICON_Z_OFFSET),
      );
    this.workspaceLabel.worldSpaceRect = Rect.create(
      0,
      labelWidth,
      -FOOTER_LABEL_HEIGHT / 2,
      FOOTER_LABEL_HEIGHT / 2,
    );
  }

  private repositionCliButton(titleH: number): void {
    const halfW = this._innerSize.x / 2;
    const halfH = this._innerSize.y / 2;
    const titleVisible = this.topicTitleObj.enabled;
    const titleSection = titleVisible
      ? FOOTER_TOP_GAP + titleH + FOOTER_GAP
      : 0;
    const folderY = -halfH - titleSection - FOOTER_LABEL_HEIGHT / 2;
    const blockTop = titleVisible
      ? -halfH - FOOTER_TOP_GAP
      : folderY + FOOTER_LABEL_HEIGHT / 2;
    const blockBottom = folderY - FOOTER_LABEL_HEIGHT / 2;
    const midY = (blockTop + blockBottom) / 2;
    const trashX = halfW - FOOTER_LABEL_PADDING - FOOTER_BTN_SIZE / 2;
    this.trashBtnObj
      .getTransform()
      .setLocalPosition(new vec3(trashX, midY, ICON_Z_OFFSET));
    const x =
      trashX - FOOTER_BTN_SIZE / 2 - FOOTER_BTN_CLI_GAP - CLI_BTN_WIDTH / 2;
    this.cliButtonObj
      .getTransform()
      .setLocalPosition(new vec3(x, midY, ICON_Z_OFFSET));
  }

  private repositionSuggestionBar(): void {
    const halfH = this._innerSize.y / 2;
    const sugHeight = this.suggestionBar.getVisualHeight();
    if (sugHeight > 0) {
      // Inside the panel at the bottom edge, above the footer zone.
      this.suggestionBarObj
        .getTransform()
        .setLocalPosition(
          new vec3(0, -(halfH - sugHeight / 2), CONTENT_Z_OFFSET),
        );
    }
    this.suggestionBar.setWidth(PANEL_INNER_SIZE.x - 2);
  }

  private repositionSettingsTitle(): void {
    const halfH = this._innerSize.y / 2;
    const titleH = this.settingsTitleText
      ? this.settingsTitleText.getBoundingBox().getSize().y
      : FOOTER_SETTINGS_TITLE_HEIGHT;
    const titleY = halfH + FOOTER_TOP_GAP + titleH / 2;
    this.settingsTitleObj
      .getTransform()
      .setLocalPosition(new vec3(0, titleY, ICON_Z_OFFSET));

    const subY = titleY - titleH / 2 - FOOTER_GAP - FOOTER_LABEL_HEIGHT / 2;
    this.settingsSubtitleObj
      .getTransform()
      .setLocalPosition(new vec3(0, subY, ICON_Z_OFFSET));
    this.settingsSubtitleText.worldSpaceRect = Rect.create(
      -PANEL_INNER_SIZE.x / 2,
      PANEL_INNER_SIZE.x / 2,
      -FOOTER_LABEL_HEIGHT / 2,
      FOOTER_LABEL_HEIGHT / 2,
    );

    const spY = this.settingsPanel.sceneObject
      .getTransform()
      .getLocalPosition().y;
    this.settingsPanel.setBackButtonY(titleY - spY);
  }

  private updateWorkspaceLabel(): void {
    const agentId = this.getAgentId();
    const topic = agentId ? this.store.getActiveTopic(agentId) : undefined;
    const topicWorkspace = topic?.metadata?.workspace;
    const repo =
      topicWorkspace ??
      (agentId ? this.store.getSelectedRepo(agentId) : undefined);
    const label = repo ?? "No workspace";
    this.workspaceLabel.text = label;
    this.workspaceBtnLabel.text = label;
    this.workspaceBtnLabel.textFill.color = new vec4(1, 1, 1, 0.55);
  }

  private updateEmptyState(): void {
    const empty = this.messageList.getMessageCount() === 0;
    this.hasMessages = !empty;
    this.workspaceBtnObj.enabled = empty;
    this.emptyHeaderText.getSceneObject().enabled = empty;
    this.emptySubText.getSceneObject().enabled = empty;
    this.folderRowObj.enabled = !empty && this.mode === "chat";
    const isNewChat = this.topicTitleText.text === "New Chat";
    this.topicTitleObj.enabled = !isNewChat && !empty && this.mode === "chat";
    this.cliButtonObj.enabled =
      this.cliButtonEnabled && !empty && this.mode === "chat";
    const shouldEnableScroll = !empty;
    if (this._scrollEnabled !== shouldEnableScroll) {
      this._scrollEnabled = shouldEnableScroll;
      this.messageList.setScrollEnabled(shouldEnableScroll);
    }
  }

  private animateEmptyStateIn(): void {
    this.emptyCancels.cancel();

    const SLIDE_Y = -2;
    const START_SCALE = 0.88;
    const ELEM_DURATION = 0.35;
    const STAGGER_MS = 80;
    const INITIAL_DELAY_MS = 100;

    const headerObj = this.emptyHeaderText.getSceneObject();
    const subObj = this.emptySubText.getSceneObject();
    const wsObj = this.workspaceBtnObj;

    const headerFinalPos = headerObj.getTransform().getLocalPosition();
    const subFinalPos = subObj.getTransform().getLocalPosition();
    // Reset to the correct resting position before reading — a previously canceled
    // animation leaves the button at an intermediate offset, causing cumulative drift.
    const wsFinalPos = new vec3(0, 0, 0.5);
    wsObj.getTransform().setLocalPosition(wsFinalPos);

    // Set start state (offset below, scaled down, text faded)
    headerObj
      .getTransform()
      .setLocalPosition(
        new vec3(
          headerFinalPos.x,
          headerFinalPos.y + SLIDE_Y,
          headerFinalPos.z,
        ),
      );
    headerObj
      .getTransform()
      .setLocalScale(new vec3(START_SCALE, START_SCALE, START_SCALE));
    this.emptyHeaderText.textFill.color = new vec4(1, 1, 1, 0);

    subObj
      .getTransform()
      .setLocalPosition(
        new vec3(subFinalPos.x, subFinalPos.y + SLIDE_Y, subFinalPos.z),
      );
    subObj
      .getTransform()
      .setLocalScale(new vec3(START_SCALE, START_SCALE, START_SCALE));
    this.emptySubText.textFill.color = new vec4(1, 1, 1, 0);

    wsObj
      .getTransform()
      .setLocalPosition(
        new vec3(wsFinalPos.x, wsFinalPos.y + SLIDE_Y, wsFinalPos.z),
      );
    wsObj
      .getTransform()
      .setLocalScale(new vec3(START_SCALE, START_SCALE, START_SCALE));

    // bottom-to-top stagger: subText, headerText, workspaceBtn
    const elems: Array<{
      obj: SceneObject;
      finalPos: vec3;
      textOpacity?: { text: Text; alpha: number };
    }> = [
      {
        obj: subObj,
        finalPos: subFinalPos,
        textOpacity: { text: this.emptySubText, alpha: 0.55 },
      },
      {
        obj: headerObj,
        finalPos: headerFinalPos,
        textOpacity: { text: this.emptyHeaderText, alpha: 1 },
      },
      { obj: wsObj, finalPos: wsFinalPos },
    ];

    for (let i = 0; i < elems.length; i++) {
      const delay = INITIAL_DELAY_MS + i * STAGGER_MS;
      const el = elems[i];
      const finalPos = el.finalPos;
      const textOpacity = el.textOpacity;

      setTimeout(() => {
        const obj = el.obj;
        if (!obj) return;
        const transform = obj.getTransform();
        animate({
          duration: ELEM_DURATION,
          easing: "ease-out-cubic",
          cancelSet: this.emptyCancels,
          update: (t: number) => {
            if (isNull(obj)) return;
            transform.setLocalPosition(
              new vec3(finalPos.x, finalPos.y + SLIDE_Y * (1 - t), finalPos.z),
            );
            const s = START_SCALE + (1 - START_SCALE) * t;
            transform.setLocalScale(new vec3(s, s, s));
            if (textOpacity) {
              textOpacity.text.textFill.color = new vec4(
                1,
                1,
                1,
                textOpacity.alpha * t,
              );
            }
          },
          ended: () => {
            if (isNull(obj)) return;
            transform.setLocalPosition(finalPos);
            transform.setLocalScale(vec3.one());
            if (textOpacity) {
              textOpacity.text.textFill.color = new vec4(
                1,
                1,
                1,
                textOpacity.alpha,
              );
            }
          },
        });
      }, delay);
    }
  }

  refreshFooter(): void {
    this.updateWorkspaceLabel();
  }

  showThreadLoading(label: string = "Loading conversation..."): void {
    this.hideImageViewer();
    this.messageList.loadThread("", []);
    this.isThreadLoading = true;
    this.threadLoadingText.text = label;
    if (this._threadLoadingTimer !== null) {
      clearTimeout(this._threadLoadingTimer);
    }
    this._threadLoadingTimer = setTimeout(() => {
      this._threadLoadingTimer = null;
      if (!this.isThreadLoading || this.mode !== "chat") return;
      const obj = this.threadLoadingObj;
      const t = obj.getTransform();
      const SLIDE_Y = -3;
      const START_SCALE = 0.88;
      obj.enabled = true;
      t.setLocalPosition(new vec3(0, SLIDE_Y, 0));
      t.setLocalScale(new vec3(START_SCALE, START_SCALE, START_SCALE));
      this._threadLoadingAnimCancels.cancel();
      animate({
        duration: ANIM_DURATION,
        easing: "ease-out-cubic",
        cancelSet: this._threadLoadingAnimCancels,
        update: (t_: number) => {
          if (isNull(obj)) return;
          t.setLocalPosition(new vec3(0, SLIDE_Y * (1 - t_), 0));
          const s = START_SCALE + (1 - START_SCALE) * t_;
          t.setLocalScale(new vec3(s, s, s));
        },
        ended: () => {
          if (isNull(obj)) return;
          t.setLocalPosition(vec3.zero());
          t.setLocalScale(vec3.one());
        },
      });
    }, 2000);
  }

  setTopicTitle(title: string): void {
    const isNewChat = title === "New Chat";
    this.topicTitleText.text = title;
    this.topicTitleObj.enabled =
      !isNewChat && this.mode === "chat" && this.hasMessages;
    this.cachedTopicTitleHeight = this.topicTitleObj.enabled
      ? this.topicTitleText.getBoundingBox().getSize().y
      : 0;
    if (this.mode === "chat") {
      this.markPanelDirty();
    }
  }

  setSuggestions(suggestions: string[]): void {
    this.suggestionBar.setSuggestions(suggestions);
    if (this._panelHovered) {
      // Suggestions arrived while hovering — show and push message list up now.
      this.suggestionBar.setVisible(true);
      this._animateMsgOffset(true);
    } else {
      this.suggestionBar.setVisible(false);
    }
    if (this.mode === "chat") {
      this.markPanelDirty();
    }
  }

  clearSuggestions(): void {
    this.suggestionBar.clear();
    if (this._panelHovered) {
      this._animateMsgOffset(false);
    }
    if (this.mode === "chat") {
      this.markPanelDirty();
    }
  }

  private _animateMsgOffset(show: boolean): void {
    const sugH = this.suggestionBar.getVisualHeight();
    const targetOffset = show && sugH > 0 ? sugH + SUGGESTION_BAR_GAP : 0;
    const startOffset = this.messageList.getBottomOffset();
    if (Math.abs(targetOffset - startOffset) < 0.01) return;
    this._msgOffsetCancels.cancel();
    animate({
      duration: show ? 0.22 : 0.15,
      easing: show ? "ease-out-cubic" : "ease-in-cubic",
      cancelSet: this._msgOffsetCancels,
      update: (u) =>
        this.messageList.setBottomOffset(
          startOffset + (targetOffset - startOffset) * u,
        ),
      ended: () => this.messageList.setBottomOffset(targetOffset),
    });
  }

  setOpenInCliVisible(visible: boolean): void {
    this.cliButtonEnabled = visible;
    this.cliButtonObj.enabled =
      visible && this.hasMessages && this.mode === "chat";
  }

  private openRepoSelection(): void {
    const agentId = this.getAgentId();
    if (!agentId) return;
    const repos = this.store.getRepos(agentId);
    const agent = this.store.getAgent(agentId);
    const isBridge = agent?.provider === "bridge";
    if (repos.length === 0 && !isBridge) {
      this.workspaceBtnLabel.text = "Invalid Request";
      this.workspaceBtnLabel.textFill.color = new vec4(1, 0.4, 0.4, 0.8);
      return;
    }
    this.setMode("settings", false, true);
    this.settingsPanel.openRepoSelection();
  }

  private repositionPermissionContainer(): void {
    this.permissionView.reposition(this._innerSize.y / 2, CONTENT_Z_OFFSET);
  }

  private repositionDialogue(): void {
    const y = -this._innerSize.y / 2 + this.dialogue.getHeight() / 2;
    this.dialogueObj
      .getTransform()
      .setLocalPosition(new vec3(0, y, CONTENT_Z_OFFSET + 0.25));
  }

  private setInnerSize(size: vec2): void {
    this._innerSize = size;
    this.panelBg.size = size;
    if (this.threadLoadingBg) {
      this.threadLoadingBg.size = size;
    }
    if (this.threadLoadingShape) {
      this.threadLoadingShape.size = new vec3(size.x, size.y, 2);
    }
    this.repositionFooterButtons();
    if (this.threadLoadingSpinnerObj && this.threadLoadingText) {
      this.repositionThreadLoadingOverlay();
    }
    if (this.dialogue?.isShowing()) this.repositionDialogue();
  }

  private getFooterRowY(): number {
    const halfH = this._innerSize.y / 2;
    const stackHeight =
      FOOTER_EMPTY_HEADER_HEIGHT +
      FOOTER_EMPTY_TEXT_GAP +
      FOOTER_EMPTY_SUB_HEIGHT;
    return -halfH - stackHeight / 2;
  }

  private repositionFooterButtons(): void {
    const halfW = this._innerSize.x / 2;
    const halfH = this._innerSize.y / 2;
    const labelWidth = this._innerSize.x - FOOTER_LABEL_PADDING * 2;
    const textX = -halfW + FOOTER_LABEL_PADDING;
    const headerH = this.emptyHeaderText
      ? this.emptyHeaderText.getBoundingBox().getSize().y
      : FOOTER_LABEL_HEIGHT;
    const titleY = -halfH - FOOTER_TOP_GAP - headerH / 2;
    const subY =
      -halfH -
      (FOOTER_TOP_GAP + headerH + FOOTER_GAP) -
      FOOTER_LABEL_HEIGHT / 2;
    if (this.emptyHeaderText) {
      this.emptyHeaderText
        .getSceneObject()
        .getTransform()
        .setLocalPosition(new vec3(textX, titleY, ICON_Z_OFFSET));
      this.emptyHeaderText.worldSpaceRect = Rect.create(
        0,
        labelWidth,
        -headerH / 2,
        headerH / 2,
      );
    }
    if (this.emptySubText) {
      this.emptySubText
        .getSceneObject()
        .getTransform()
        .setLocalPosition(new vec3(textX, subY, ICON_Z_OFFSET));
      this.emptySubText.worldSpaceRect = Rect.create(
        0,
        labelWidth,
        -FOOTER_LABEL_HEIGHT / 2,
        FOOTER_LABEL_HEIGHT / 2,
      );
    }
  }

  private repositionThreadLoadingOverlay(): void {
    const spinnerY =
      (THREAD_LOADING_TEXT_HEIGHT + THREAD_LOADING_STACK_GAP) / 2;
    const textY =
      -(THREAD_LOADING_SPINNER_SIZE + THREAD_LOADING_STACK_GAP) / 2;
    this.threadLoadingSpinnerObj
      .getTransform()
      .setLocalPosition(new vec3(0, spinnerY, ICON_Z_OFFSET));
    this.threadLoadingText
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(0, textY, ICON_Z_OFFSET));
    this.threadLoadingText.worldSpaceRect = Rect.create(
      -this._innerSize.x / 2,
      this._innerSize.x / 2,
      -THREAD_LOADING_TEXT_HEIGHT / 2,
      THREAD_LOADING_TEXT_HEIGHT / 2,
    );
  }

  private hideThreadLoading(): void {
    if (this._threadLoadingTimer !== null) {
      clearTimeout(this._threadLoadingTimer);
      this._threadLoadingTimer = null;
    }
    this._threadLoadingAnimCancels.cancel();
    this.isThreadLoading = false;
    this.threadLoadingObj.enabled = false;
  }

  private markPanelDirty(): void {
    this.markDirty();
  }

  protected onFlush(_flags: number): void {
    this.updatePanelSize();
    if (this.trackAgent) {
      this.positionSettled = false;
      this.setTracking(true);
    }
  }

  protected onTrack(): void {
    if (!this.trackAgent) {
      this.setTracking(false);
      return;
    }

    // True self-idle: onContentTopChanged and onFlush re-enable tracking when needed.
    if (this.positionSettled) {
      this.setTracking(false);
      return;
    }

    // Actively lerping — read current values and update target if needed.
    const robotLocalPos = this.trackAgent
      .getRobotTransform()
      .getLocalPosition();
    const contentTopY = this.trackAgent.getContentTopLocalY();

    const robotMoved =
      !this.lastRobotLocalPos ||
      Math.abs(robotLocalPos.x - this.lastRobotLocalPos.x) >
        POSITION_THRESHOLD ||
      Math.abs(robotLocalPos.y - this.lastRobotLocalPos.y) >
        POSITION_THRESHOLD ||
      Math.abs(robotLocalPos.z - this.lastRobotLocalPos.z) > POSITION_THRESHOLD;
    const contentTopChanged =
      this.lastContentTopY === null ||
      Math.abs(contentTopY - this.lastContentTopY) > POSITION_THRESHOLD;

    if (robotMoved || contentTopChanged) {
      this.lastRobotLocalPos = robotLocalPos;
      this.lastContentTopY = contentTopY;
      this.targetLocalPos = this.computeLocalTargetPos();
    }

    const currentPos = this.rootTransform.getLocalPosition();
    const dx = currentPos.x - this.targetLocalPos.x;
    const dy = currentPos.y - this.targetLocalPos.y;
    const dz = currentPos.z - this.targetLocalPos.z;

    if (dx * dx + dy * dy + dz * dz > 0.0001) {
      const t = Math.min(POSITION_LERP_SPEED * getDeltaTime(), 1);
      this.rootTransform.setLocalPosition(
        vec3.lerp(currentPos, this.targetLocalPos, t),
      );
    } else {
      this.rootTransform.setLocalPosition(this.targetLocalPos);
      this.positionSettled = true;
      this.setTracking(false);
    }
  }

  private computeLocalTargetPos(): vec3 {
    if (!this.trackAgent) return this.targetLocalPos ?? vec3.zero();
    const robotPos = this.trackAgent.getRobotTransform().getLocalPosition();
    const topY = this.trackAgent.getContentTopLocalY();
    const panelHalfHeight = this._innerSize.y / 2;

    this._scratchTargetPos.x = robotPos.x;
    this._scratchTargetPos.y =
      this.mode === "settings"
        ? topY + panelHalfHeight
        : topY + PADDING_ABOVE_VISUAL + panelHalfHeight;
    this._scratchTargetPos.z = robotPos.z - PADDING_BACK;
    return this._scratchTargetPos;
  }

  private spawnDetachedImageFrame(
    texture: Texture,
    worldPosition: vec3,
    worldRotation: quat,
  ): void {
    const frameHost = spawnDetachedImageFrame(
      texture,
      worldPosition,
      worldRotation,
      this.originalParent,
      (host) => {
        const idx = this.detachedImageFrames.indexOf(host);
        if (idx >= 0) this.detachedImageFrames.splice(idx, 1);
        host.destroy();
      },
    );
    this.detachedImageFrames.push(frameHost);
  }

  private createImageViewer(): void {
    const BACK_BTN_SIZE = 3;
    const BACK_BTN_MARGIN = 1;
    const BACK_ICON_SIZE = 1.4;


    this.imageViewerObj = global.scene.createSceneObject("ImageViewer");
    this.imageViewerObj.setParent(this.contentObj);
    this.imageViewerObj
      .getTransform()
      .setLocalPosition(new vec3(0, 0, VIEWER_Z));

    const imgObj = global.scene.createSceneObject("ViewerImage");
    imgObj.setParent(this.imageViewerObj);
    imgObj.getTransform().setLocalPosition(new vec3(0, 0, 0.1));
    this.imageViewerImage = imgObj.createComponent("Image") as Image;
    const ICON_MATERIAL: Material = requireAsset(
      "../../../Visuals/Materials/Image.mat",
    ) as Material;
    this.imageViewerImage.mainMaterial = ICON_MATERIAL.clone();
    this.imageViewerImage.mainPass.depthTest = true;
    this.imageViewerImage.mainPass.depthWrite = true;

    // Collider + Interactable + Manipulation for drag-to-detach
    const viewerCollider = this.imageViewerObj.createComponent(
      "ColliderComponent",
    ) as ColliderComponent;
    viewerCollider.fitVisual = false;
    //viewerCollider.debugDrawEnabled = true;
    this.imageViewerShape = Shape.createBoxShape();
    this.imageViewerShape.size = new vec3(
      PANEL_INNER_SIZE.x - VIEWER_PADDING,
      PANEL_INNER_SIZE.y - VIEWER_PADDING,
      6,
    );
    viewerCollider.shape = this.imageViewerShape;
    const viewerInteractable = this.imageViewerObj.createComponent(
      Interactable.getTypeName(),
    ) as Interactable;

    const HOVER_Z_OFFSET = 1.5;
    viewerInteractable.onHoverEnter.add(() => {
      this.imageViewerHoverCancels.cancel();
      const t = this.imageViewerObj.getTransform();
      const startPos = t.getLocalPosition();
      const endPos = new vec3(
        startPos.x,
        startPos.y,
        startPos.z + HOVER_Z_OFFSET,
      );
      animate({
        duration: 0.12,
        easing: "ease-out-cubic",
        cancelSet: this.imageViewerHoverCancels,
        update: (u) => t.setLocalPosition(vec3.lerp(startPos, endPos, u)),
      });
    });
    viewerInteractable.onHoverExit.add(() => {
      this.imageViewerHoverCancels.cancel();
      const t = this.imageViewerObj.getTransform();
      const startPos = t.getLocalPosition();
      const endPos = new vec3(
        startPos.x,
        startPos.y,
        startPos.z - HOVER_Z_OFFSET,
      );
      animate({
        duration: 0.12,
        easing: "ease-out-cubic",
        cancelSet: this.imageViewerHoverCancels,
        update: (u) => t.setLocalPosition(vec3.lerp(startPos, endPos, u)),
      });
    });
    const viewerManipulation = this.imageViewerObj.createComponent(
      InteractableManipulation.getTypeName(),
    ) as InteractableManipulation;
    viewerManipulation.setCanRotate(false);
    viewerManipulation.setCanScale(false);

    const VIEWER_DRAG_THRESHOLD = 2;
    const VIEWER_DETACH_THRESHOLD = 20;
    let viewerTotalDist = 0;
    let viewerLastWorldPos = vec3.zero();
    let viewerOriginalLocalPos = vec3.zero();

    viewerManipulation.onTranslationStart.add(() => {
      viewerTotalDist = 0;
      viewerOriginalLocalPos = this.imageViewerObj
        .getTransform()
        .getLocalPosition();
      viewerLastWorldPos = this.imageViewerObj
        .getTransform()
        .getWorldPosition();
      this.imageViewerBillboard.enabled = true;
    });

    viewerManipulation.onTranslationUpdate.add((event: TranslateEventArg) => {
      const seg = event.currentPosition.sub(viewerLastWorldPos).length;
      viewerTotalDist += seg;
      viewerLastWorldPos = event.currentPosition;
    });

    viewerManipulation.onTranslationEnd.add(() => {
      if (!this.imageViewerObj.enabled) return;
      if (viewerTotalDist > VIEWER_DETACH_THRESHOLD) {
        const texture = this.imageViewerImage.mainPass.baseTex;
        const worldRot = this.imageViewerObj.getTransform().getWorldRotation();
        this.hideImageViewer();
        if (texture) {
          this.spawnDetachedImageFrame(texture, viewerLastWorldPos, worldRot);
        }
      } else if (viewerTotalDist < VIEWER_DRAG_THRESHOLD) {
        this.hideImageViewer();
      } else {
        this.imageViewerBillboard.enabled = false;
        this.imageViewerObj
          .getTransform()
          .setLocalPosition(viewerOriginalLocalPos);
      }
    });

    this.imageViewerBackBtnObj =
      global.scene.createSceneObject("ViewerBackBtn");
    this.imageViewerBackBtnObj.setParent(this.imageViewerObj);
    const backBtnObj = this.imageViewerBackBtnObj;
    const backBtn = backBtnObj.createComponent(
      RectangleButton.getTypeName(),
    ) as RectangleButton;
    backBtn.size = new vec3(BACK_BTN_SIZE, BACK_BTN_SIZE, 0.3);
    backBtn.initialize();

    createImage(CHEVRON_LEFT_TEXTURE, {
      parent: backBtnObj,
      name: "BackIcon",
      size: BACK_ICON_SIZE,
      position: new vec3(0, 0, 0.15),
    });

    createTooltip(backBtnObj, "Back", { hoverSource: backBtn });
    backBtn.onTriggerUp.add(() => this.dismissImageViewer());

    createTooltip(this.imageViewerObj, "Drag to detach", {
      hoverSource: viewerInteractable,
    });

    this.imageViewerBillboard = this.imageViewerObj.createComponent(
      Billboard.getTypeName(),
    ) as Billboard;
    this.imageViewerBillboard.xAxisEnabled = true;
    this.imageViewerBillboard.yAxisEnabled = true;
    this.imageViewerBillboard.enabled = false;

    this.imageViewerObj.enabled = false;
  }

  private showImageViewer(
    texture: Texture,
    sourceObj: SceneObject,
    srcWidth: number,
    srcHeight: number,
  ): void {
    this.imageViewerCancels.cancel();

    this.imageViewerImage.mainPass.baseTex = texture;

    const tw = texture.getWidth();
    const th = texture.getHeight();
    const aspect = th / Math.max(tw, 1);

    const maxW = PANEL_INNER_SIZE.x - 2;
    const maxH = PANEL_INNER_SIZE.y - 4;

    let imgW = maxW;
    let imgH = imgW * aspect;
    if (imgH > maxH) {
      imgH = maxH;
      imgW = imgH / aspect;
    }

    // Set image to its final resting state — only the viewer container animates
    const imgTransform = this.imageViewerImage.getSceneObject().getTransform();
    imgTransform.setLocalPosition(new vec3(0, 0, 0.1));
    imgTransform.setLocalScale(new vec3(imgW, imgH, 1));

    // Resize the drag collider to match this image
    this.imageViewerShape.size = new vec3(imgW, imgH, 2);

    this.imageViewerObj.enabled = true;

    // Snap the viewer container to the source button's world position, then read
    // back as local to get the animation start position in frame.content space.
    const viewerTransform = this.imageViewerObj.getTransform();
    viewerTransform.setWorldPosition(
      sourceObj.getTransform().getWorldPosition(),
    );
    const startLocalPos = viewerTransform.getLocalPosition();
    const endLocalPos = new vec3(
      0,
      -PANEL_INNER_SIZE.y / 2 + imgH / 2,
      VIEWER_Z,
    );

    // Position back button just above the image
    const BACK_BTN_SIZE = 3;
    const BACK_BTN_MARGIN = 1;
    this.imageViewerBackBtnObj
      .getTransform()
      .setLocalPosition(
        new vec3(
          -imgW / 2 + BACK_BTN_SIZE / 2 + BACK_BTN_MARGIN,
          imgH / 2 + BACK_BTN_SIZE / 2 + BACK_BTN_MARGIN,
          0.2,
        ),
      );

    const startScaleU = Math.min(srcWidth / imgW, srcHeight / imgH);
    const startScale = new vec3(startScaleU, startScaleU, 1);
    const endScale = vec3.one();

    // Store dismiss targets for the reverse animation
    this.imageViewerSourceLocalPos = startLocalPos;
    this.imageViewerSourceScale = startScaleU;

    // Hide source thumbnail and chat thread while viewer is shown
    this.imageViewerSourceBtn = sourceObj;
    sourceObj.enabled = false;
    this.chatContentObj.enabled = false;

    viewerTransform.setLocalPosition(startLocalPos);
    viewerTransform.setLocalScale(startScale);
    this.imageViewerImage.mainPass.baseColor = new vec4(1, 1, 1, 0);

    animate({
      duration: ANIM_DURATION,
      easing: "ease-out-cubic",
      cancelSet: this.imageViewerCancels,
      update: (t: number) => {
        viewerTransform.setLocalPosition(
          vec3.lerp(startLocalPos, endLocalPos, t),
        );
        viewerTransform.setLocalScale(vec3.lerp(startScale, endScale, t));
        this.imageViewerImage.mainPass.baseColor = new vec4(1, 1, 1, t);
      },
      ended: () => {
        viewerTransform.setLocalPosition(endLocalPos);
        viewerTransform.setLocalScale(endScale);
        this.imageViewerImage.mainPass.baseColor = new vec4(1, 1, 1, 1);
      },
    });
  }

  private dismissImageViewer(): void {
    this.imageViewerCancels.cancel();
    this.imageViewerHoverCancels.cancel();
    const viewerTransform = this.imageViewerObj.getTransform();
    const startPos = viewerTransform.getLocalPosition();
    const endPos = this.imageViewerSourceLocalPos;
    const startScale = vec3.one();
    const endScale = new vec3(
      this.imageViewerSourceScale,
      this.imageViewerSourceScale,
      1,
    );
    animate({
      duration: ANIM_DURATION,
      easing: "ease-in-cubic",
      cancelSet: this.imageViewerCancels,
      update: (t: number) => {
        viewerTransform.setLocalPosition(vec3.lerp(startPos, endPos, t));
        viewerTransform.setLocalScale(vec3.lerp(startScale, endScale, t));
        this.imageViewerImage.mainPass.baseColor = new vec4(1, 1, 1, 1 - t);
      },
      ended: () => this.hideImageViewer(),
    });
  }

  private hideImageViewer(): void {
    this.imageViewerCancels.cancel();
    this.imageViewerHoverCancels.cancel();
    this.imageViewerBillboard.enabled = false;
    const viewerTransform = this.imageViewerObj.getTransform();
    viewerTransform.setLocalPosition(new vec3(0, 0, VIEWER_Z));
    viewerTransform.setLocalScale(vec3.one());
    viewerTransform.setLocalRotation(quat.quatIdentity());
    this.imageViewerImage.mainPass.baseColor = new vec4(1, 1, 1, 1);
    this.imageViewerObj.enabled = false;
    if (this.mode === "chat") {
      this.chatContentObj.enabled = true;
    }
    if (this.imageViewerSourceBtn) {
      this.imageViewerSourceBtn.enabled = true;
      this.imageViewerSourceBtn = null;
    }
  }
}
