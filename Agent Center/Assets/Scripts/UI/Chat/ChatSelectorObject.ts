import { ChatTopic } from "../../Types";
import {
  DirtyComponent,
  LAYOUT_DIRTY,
  STATE_DIRTY,
} from "../Shared/DirtyComponent";
import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate";
import { ScrollWindow } from "SpectaclesUIKit.lspkg/Scripts/Components/ScrollWindow/ScrollWindow";
import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import {
  setTimeout,
  clearTimeout,
  CancelToken,
} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import animate, { CancelSet } from "SpectaclesInteractionKit.lspkg/Utils/animate";
import { TextSize, TextFont } from "../Shared/TextSizes";
import { createImage } from "../Shared/ImageFactory";
import { LoadingSpinner } from "../../../Visuals/LoadingSpinner/LoadingSpinner";
import { ICON_Z_OFFSET } from "../Shared/UIConstants";
import { createTooltip, createText, initializeScrollWindow } from "../Shared/UIBuilders";
import { TAB_BAR_WIDTH } from "../Elements/TabBar";

const ADD_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/Add.png",
) as Texture;
const BELL_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/Bell.png",
) as Texture;
const QUESTION_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/Question-mark-circle.png",
) as Texture;
const MINIMIZE_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/Arrows-minimize.png",
) as Texture;

const BUTTON_WIDTH = 8;
const BUTTON_HEIGHT = TAB_BAR_WIDTH / 2;
const BUTTON_SPACING = 0.5;
const NEW_CHAT_WIDTH = 4;
const NEW_CHAT_GAP = 1;
const SCROLL_WINDOW_WIDTH = 20;
const TOTAL_CONTENT_WIDTH = NEW_CHAT_WIDTH + NEW_CHAT_GAP + SCROLL_WINDOW_WIDTH;
const PADDING = new vec2(1.5, 0.8);
const COLLAPSED_TOPIC_WIDTH = 10;
const COLLAPSED_GAP = 1;
const CLONE_TOPIC_WIDTH =
  NEW_CHAT_WIDTH + COLLAPSED_GAP + COLLAPSED_TOPIC_WIDTH;
const PADDING_ABOVE_VISUAL = 1.5;
const Z_CONTENT = 0.15;
const NEW_CHAT_ICON_SIZE = BUTTON_HEIGHT * 0.375;
const BELL_ICON_SIZE = BUTTON_HEIGHT * 0.3;
const SPINNER_SIZE = BELL_ICON_SIZE;
const ACTIVE_STATUSES = new Set(["CREATING", "RUNNING"]);
const AWAITING_STATUS = "AWAITING_ACTION";
const TOPICS_CHANGED = 1 << 2;
const MAX_PREBUILT_SLOTS = 12;
const LOADING_FADE_DURATION = 0.5;
const CONTENT_SLIDE_DURATION = 0.5;
const CONTENT_SLIDE_DELAY_MS = 250;
const CONTENT_SLIDE_Y = -1.0;
const MINIMIZE_BTN_SIZE = 3;
const MINIMIZE_BTN_ICON_SIZE = 1.5;
const MINIMIZE_BTN_OUTSET = 1.5;

interface TrackedTopicButton {
  topicId: string;
  sceneObject: SceneObject;
  button: RectangleButton;
  label: Text;
  bellObj: SceneObject;
  spinnerObj: SceneObject;
  questionObj: SceneObject;
}

@component
export class ChatSelectorObject extends DirtyComponent {
  private backPlate: BackPlate;

  private collapsedContainer: SceneObject;
  private collapsedNewChatObj: SceneObject;
  private collapsedTopicObj: SceneObject;
  private collapsedTopicBtn: RectangleButton;
  private collapsedTopicText: Text;
  private collapsedBellObj: SceneObject;
  private collapsedSpinnerObj: SceneObject;
  private collapsedQuestionObj: SceneObject;

  private scrollContainer: SceneObject | null = null;
  private scrollWindow: ScrollWindow | null = null;
  private scrollViewInitialized = false;

  private trackedButtons: TrackedTopicButton[] = [];
  private lastSortedTopicIds: string[] = [];
  private lastScrolledTopicId = "";

  private topics: ChatTopic[] = [];
  private activeTopicId = "";
  private unreadTopicIds: Set<string> = new Set();
  private expanded = false;
  private hovered = false;
  private selected = false;
  private _cloneMode = false;

  private cloneTitleObj: SceneObject;
  private cloneTitleText: Text;
  private cloneBellObj: SceneObject;
  private cloneSpinnerObj: SceneObject;
  private cloneQuestionObj: SceneObject;

  private offlineLabelObj: SceneObject;
  private offlineSubtextObj: SceneObject;
  private _offline = false;

  private loadingLabelObj: SceneObject;
  private loadingSpinnerObj: SceneObject;
  private loadingSpinner: LoadingSpinner;
  private loadingLabelText: Text;
  private _loading = true;

  private collapseTimer: CancelToken | null = null;
  private _animatedPlateWidth: number | null = null;
  private readonly _plateAnimCancels = new CancelSet();
  private readonly _loadingTransitionCancels = new CancelSet();
  private _backPlateHoverHooked = false;

  private trackTarget: Transform | null = null;
  private getVisualTopY: (() => number) | null = null;
  private getPushOffset: (() => number) | null = null;
  private currentPlateHeight = 0;
  private selectorHovered = false;
  private _settingsActive = false;
  private lastTrackX = Infinity;
  private lastTrackZ = Infinity;
  private lastAnchorY = Infinity;
  private cachedTopicMap: Map<string, ChatTopic> = new Map();
  private readonly _scratchLocalPos = new vec3(0, 0, 0);

  private get shouldHighlightActiveTopic(): boolean {
    return this.activeTopicId !== "" && !this._settingsActive;
  }

  public readonly onTopicClicked = new Event<string>();
  public readonly onNewChatRequested = new Event<void>();
  readonly onMinimizeRequested = new Event<void>();
  private minimizeBtnObj: SceneObject;

  onAwake(): void {
    super.onAwake();
    const root = this.getSceneObject();

    const plateObj = global.scene.createSceneObject("SelectorBackPlate");
    plateObj.setParent(root);
    plateObj.getTransform().setLocalPosition(vec3.zero());
    this.backPlate = plateObj.createComponent(
      BackPlate.getTypeName(),
    ) as BackPlate;
    this.backPlate.style = "dark";


    const collapsedTotalWidth =
      NEW_CHAT_WIDTH + COLLAPSED_GAP + COLLAPSED_TOPIC_WIDTH;

    this.collapsedContainer =
      global.scene.createSceneObject("CollapsedContainer");
    this.collapsedContainer.setParent(root);
    this.collapsedContainer.getTransform().setLocalPosition(vec3.zero());
    this.collapsedContainer.enabled = false;

    this.collapsedNewChatObj =
      global.scene.createSceneObject("CollapsedNewChat");
    this.collapsedNewChatObj.setParent(this.collapsedContainer);
    const collNewX = -collapsedTotalWidth / 2 + NEW_CHAT_WIDTH / 2;
    this.collapsedNewChatObj
      .getTransform()
      .setLocalPosition(new vec3(collNewX, 0, 0.3));

    const collNewBtn = this.collapsedNewChatObj.createComponent(
      RectangleButton.getTypeName(),
    ) as RectangleButton;
    collNewBtn.size = new vec3(NEW_CHAT_WIDTH, BUTTON_HEIGHT, 0.5);
    collNewBtn.initialize();

    createImage(ADD_TEXTURE, {
      parent: this.collapsedNewChatObj,
      name: "CollNewIcon",
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: NEW_CHAT_ICON_SIZE,
    });

    const collNewTooltip = createTooltip(this.collapsedNewChatObj, "New Chat", {
      hoverSource: collNewBtn,
    });

    collNewBtn.onTriggerUp.add(() => {
      this.onNewChatRequested.invoke(undefined);
    });
    collNewBtn.interactable.onHoverEnter.add(() => {
      this.selectorHovered = true;
      this.updateExpansionState();
    });
    collNewBtn.interactable.onHoverExit.add(() => {
      this.selectorHovered = false;
      this.updateExpansionState();
    });
    collNewBtn.onHoverExit.add(() => collNewTooltip.setOn(false));

    this.collapsedTopicObj = global.scene.createSceneObject("CollapsedTopic");
    this.collapsedTopicObj.setParent(this.collapsedContainer);
    const collTopicX =
      -collapsedTotalWidth / 2 +
      NEW_CHAT_WIDTH +
      COLLAPSED_GAP +
      COLLAPSED_TOPIC_WIDTH / 2;
    this.collapsedTopicObj
      .getTransform()
      .setLocalPosition(new vec3(collTopicX, 0, 0));

    this.collapsedTopicBtn = this.collapsedTopicObj.createComponent(
      RectangleButton.getTypeName(),
    ) as RectangleButton;
    this.collapsedTopicBtn.size = new vec3(
      COLLAPSED_TOPIC_WIDTH,
      BUTTON_HEIGHT,
      0.5,
    );
    this.collapsedTopicBtn.setIsToggleable(true);
    this.collapsedTopicBtn.initialize();
    this.collapsedTopicBtn.toggle(this.shouldHighlightActiveTopic);

    this.collapsedTopicText = createText({
      parent: this.collapsedTopicObj,
      name: "CollTopicLabel",
      text: "No Chats",
      size: TextSize.L,
      font: TextFont.Medium,
      position: new vec3(0, 0, ICON_Z_OFFSET),
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Center,
      worldSpaceRect: Rect.create(
        -COLLAPSED_TOPIC_WIDTH / 2 + 0.3,
        COLLAPSED_TOPIC_WIDTH / 2 - 0.3,
        -BUTTON_HEIGHT / 2,
        BUTTON_HEIGHT / 2,
      ),
    });

    this.collapsedBellObj = global.scene.createSceneObject("CollapsedBell");
    this.collapsedBellObj.setParent(this.collapsedTopicObj);
    this.collapsedBellObj
      .getTransform()
      .setLocalPosition(
        new vec3(
          -COLLAPSED_TOPIC_WIDTH / 2 + BELL_ICON_SIZE / 2 + 0.3,
          0,
          ICON_Z_OFFSET,
        ),
      );
    createImage(BELL_TEXTURE, {
      parent: this.collapsedBellObj,
      name: "CollapsedBellIcon",
      size: BELL_ICON_SIZE,
    });
    this.collapsedBellObj.enabled = false;

    this.collapsedSpinnerObj =
      global.scene.createSceneObject("CollapsedSpinner");
    this.collapsedSpinnerObj.setParent(this.collapsedTopicObj);
    this.collapsedSpinnerObj
      .getTransform()
      .setLocalPosition(
        new vec3(
          -COLLAPSED_TOPIC_WIDTH / 2 + SPINNER_SIZE / 2 + 0.3,
          0,
          ICON_Z_OFFSET,
        ),
      );
    this.collapsedSpinnerObj
      .getTransform()
      .setLocalScale(new vec3(SPINNER_SIZE, SPINNER_SIZE, 1));
    this.collapsedSpinnerObj.createComponent(LoadingSpinner.getTypeName());
    this.collapsedSpinnerObj.enabled = false;

    this.collapsedQuestionObj =
      global.scene.createSceneObject("CollapsedQuestion");
    this.collapsedQuestionObj.setParent(this.collapsedTopicObj);
    this.collapsedQuestionObj
      .getTransform()
      .setLocalPosition(
        new vec3(
          -COLLAPSED_TOPIC_WIDTH / 2 + BELL_ICON_SIZE / 2 + 0.3,
          0,
          ICON_Z_OFFSET,
        ),
      );
    createImage(QUESTION_TEXTURE, {
      parent: this.collapsedQuestionObj,
      name: "CollapsedQuestionIcon",
      size: BELL_ICON_SIZE,
    });
    this.collapsedQuestionObj.enabled = false;

    this.collapsedTopicBtn.onTriggerUp.add(() => {
      if (this.activeTopicId) {
        this.onTopicClicked.invoke(this.activeTopicId);
        this.collapsedTopicBtn.toggle(true);
      } else {
        this.onNewChatRequested.invoke(undefined);
      }
    });
    this.collapsedTopicBtn.interactable.onHoverEnter.add(() => {
      this.selectorHovered = true;
      this.updateExpansionState();
    });
    this.collapsedTopicBtn.interactable.onHoverExit.add(() => {
      this.selectorHovered = false;
      this.updateExpansionState();
    });

    this.cloneTitleObj = global.scene.createSceneObject("CloneTitle");
    this.cloneTitleObj.setParent(root);
    this.cloneTitleText = createText({
      parent: this.cloneTitleObj,
      name: "CloneTitleLabel",
      text: "",
      size: TextSize.L,
      font: TextFont.Medium,
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Center,
    });

    this.cloneBellObj = global.scene.createSceneObject("CloneBell");
    this.cloneBellObj.setParent(this.cloneTitleObj);
    this.cloneBellObj
      .getTransform()
      .setLocalPosition(
        new vec3(
          -CLONE_TOPIC_WIDTH / 2 + BELL_ICON_SIZE / 2 + 0.3,
          0,
          ICON_Z_OFFSET,
        ),
      );
    createImage(BELL_TEXTURE, {
      parent: this.cloneBellObj,
      name: "CloneBellIcon",
      size: BELL_ICON_SIZE,
    });
    this.cloneBellObj.enabled = false;

    this.cloneSpinnerObj = global.scene.createSceneObject("CloneSpinner");
    this.cloneSpinnerObj.setParent(this.cloneTitleObj);
    this.cloneSpinnerObj
      .getTransform()
      .setLocalPosition(
        new vec3(
          -CLONE_TOPIC_WIDTH / 2 + SPINNER_SIZE / 2 + 0.3,
          0,
          ICON_Z_OFFSET,
        ),
      );
    this.cloneSpinnerObj
      .getTransform()
      .setLocalScale(new vec3(SPINNER_SIZE, SPINNER_SIZE, 1));
    this.cloneSpinnerObj.createComponent(LoadingSpinner.getTypeName());
    this.cloneSpinnerObj.enabled = false;

    this.cloneQuestionObj = global.scene.createSceneObject("CloneQuestion");
    this.cloneQuestionObj.setParent(this.cloneTitleObj);
    this.cloneQuestionObj
      .getTransform()
      .setLocalPosition(
        new vec3(
          -CLONE_TOPIC_WIDTH / 2 + BELL_ICON_SIZE / 2 + 0.3,
          0,
          ICON_Z_OFFSET,
        ),
      );
    createImage(QUESTION_TEXTURE, {
      parent: this.cloneQuestionObj,
      name: "CloneQuestionIcon",
      size: BELL_ICON_SIZE,
    });
    this.cloneQuestionObj.enabled = false;

    this.cloneTitleObj.enabled = false;

    const offlineText = createText({
      parent: root,
      name: "OfflineLabel",
      text: "Agent Unavailable",
      size: TextSize.M,
      font: TextFont.Medium,
      color: new vec4(1, 1, 1, 0.5),
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Center,
    });
    this.offlineLabelObj = offlineText.getSceneObject();
    this.offlineLabelObj.enabled = false;

    const offlineSubtext = createText({
      parent: root,
      name: "OfflineSubtext",
      text: "Waiting for connection",
      size: TextSize.XS,
      color: new vec4(1, 1, 1, 0.35),
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Center,
    });
    this.offlineSubtextObj = offlineSubtext.getSceneObject();
    this.offlineSubtextObj.enabled = false;

    const loadingLabel = createText({
      parent: root,
      name: "LoadingLabel",
      text: "Fetching Conversations",
      size: TextSize.M,
      font: TextFont.Medium,
      color: new vec4(1, 1, 1, 0.5),
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Center,
    });
    this.loadingLabelText = loadingLabel;
    this.loadingLabelObj = loadingLabel.getSceneObject();
    this.loadingLabelObj.enabled = false;

    this.loadingSpinnerObj = global.scene.createSceneObject("LoadingStateSpinner");
    this.loadingSpinnerObj.setParent(root);
    this.loadingSpinnerObj
      .getTransform()
      .setLocalScale(new vec3(SPINNER_SIZE, SPINNER_SIZE, 1));
    this.loadingSpinner = this.loadingSpinnerObj.createComponent(
      LoadingSpinner.getTypeName(),
    ) as LoadingSpinner;
    this.loadingSpinnerObj.enabled = false;

    this.minimizeBtnObj = global.scene.createSceneObject("MinimizeBtn");
    this.minimizeBtnObj.setParent(root);
    const minimizeBtn = this.minimizeBtnObj.createComponent(
      RectangleButton.getTypeName(),
    ) as RectangleButton;
    minimizeBtn.size = new vec3(MINIMIZE_BTN_SIZE, MINIMIZE_BTN_SIZE, 0.5);
    minimizeBtn.initialize();
    createImage(MINIMIZE_TEXTURE, {
      parent: this.minimizeBtnObj,
      name: "MinimizeIcon",
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: MINIMIZE_BTN_ICON_SIZE,
    });
    createTooltip(this.minimizeBtnObj, "Minimize", {
      hoverSource: minimizeBtn,
    });
    minimizeBtn.onTriggerUp.add(() => this.onMinimizeRequested.invoke());
    minimizeBtn.interactable.onHoverEnter.add(() => {
      this.selectorHovered = true;
      this.updateExpansionState();
    });
    minimizeBtn.interactable.onHoverExit.add(() => {
      this.selectorHovered = false;
      this.updateExpansionState();
    });
    this.minimizeBtnObj.enabled = false;

    this.ensureScrollView();

    // Start in loading state so "No Chats" never flashes.
    // The first setLoading(false) from refreshAgentTopics transitions to normal.
    if (this.scrollContainer) {
      this.scrollContainer.enabled = false;
    }
    this.refreshLoading();
  }

  private ensureScrollView(): void {
    if (this.scrollViewInitialized) return;
    this.scrollViewInitialized = true;

    const root = this.getSceneObject();

    this.scrollContainer = global.scene.createSceneObject("ScrollContainer");
    this.scrollContainer.setParent(root);
    this.scrollContainer.getTransform().setLocalPosition(vec3.zero());

    const newChatObj = global.scene.createSceneObject("NewChatBtn");
    newChatObj.setParent(this.scrollContainer);
    const newChatX = -TOTAL_CONTENT_WIDTH / 2 + NEW_CHAT_WIDTH / 2;
    newChatObj.getTransform().setLocalPosition(new vec3(newChatX, 0, 0.3));

    const newChatBtn = newChatObj.createComponent(
      RectangleButton.getTypeName(),
    ) as RectangleButton;
    newChatBtn.size = new vec3(NEW_CHAT_WIDTH, BUTTON_HEIGHT, 0.5);
    newChatBtn.initialize();

    createImage(ADD_TEXTURE, {
      parent: newChatObj,
      name: "NewChatIcon",
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: NEW_CHAT_ICON_SIZE,
    });

    const newChatTooltip = createTooltip(newChatObj, "New Chat", {
      hoverSource: newChatBtn,
    });

    newChatBtn.onTriggerUp.add(() => {
      this.onNewChatRequested.invoke(undefined);
    });
    newChatBtn.interactable.onHoverEnter.add(() => {
      this.selectorHovered = true;
      this.updateExpansionState();
    });
    newChatBtn.interactable.onHoverExit.add(() => {
      this.selectorHovered = false;
      this.updateExpansionState();
    });

    const scrollOffsetX =
      -TOTAL_CONTENT_WIDTH / 2 +
      NEW_CHAT_WIDTH +
      NEW_CHAT_GAP +
      SCROLL_WINDOW_WIDTH / 2;

    const scrollAnchor = global.scene.createSceneObject("ScrollAnchor");
    scrollAnchor.setParent(this.scrollContainer);
    scrollAnchor.getTransform().setLocalPosition(new vec3(scrollOffsetX, 0, 0));

    const scrollObj = global.scene.createSceneObject("TopicScrollWindow");
    scrollObj.setParent(scrollAnchor);
    scrollObj.getTransform().setLocalPosition(vec3.zero());

    this.scrollWindow = scrollObj.createComponent(
      ScrollWindow.getTypeName(),
    ) as ScrollWindow;
    this.scrollWindow.vertical = false;
    this.scrollWindow.horizontal = true;
    this.scrollWindow.windowSize = new vec2(SCROLL_WINDOW_WIDTH, BUTTON_HEIGHT);
    this.scrollWindow.scrollDimensions = new vec2(
      SCROLL_WINDOW_WIDTH,
      BUTTON_HEIGHT,
    );
    initializeScrollWindow(this.scrollWindow);

    for (let i = 0; i < MAX_PREBUILT_SLOTS; i++) {
      const slot = this._createTopicSlot(i);
      slot.sceneObject.enabled = false;
      this.trackedButtons.push(slot);
    }
  }

  private _createTopicSlot(index: number): TrackedTopicButton {
    const btnObj = global.scene.createSceneObject(`Topic_Slot_${index}`);
    this.scrollWindow!.addObject(btnObj);

    const btn = btnObj.createComponent(
      RectangleButton.getTypeName(),
    ) as RectangleButton;
    btn.size = new vec3(BUTTON_WIDTH, BUTTON_HEIGHT, 0.5);
    btn.setIsToggleable(true);
    btn.initialize();

    const spinnerObj = global.scene.createSceneObject("SpinnerIcon");
    spinnerObj.setParent(btnObj);
    spinnerObj
      .getTransform()
      .setLocalPosition(
        new vec3(-BUTTON_WIDTH / 2 + SPINNER_SIZE / 2 + 0.3, 0, ICON_Z_OFFSET),
      );
    spinnerObj
      .getTransform()
      .setLocalScale(new vec3(SPINNER_SIZE, SPINNER_SIZE, 1));
    spinnerObj.createComponent(LoadingSpinner.getTypeName());

    const bellObj = createImage(BELL_TEXTURE, {
      parent: btnObj,
      name: "BellIcon",
      position: new vec3(
        -BUTTON_WIDTH / 2 + BELL_ICON_SIZE / 2 + 0.3,
        0,
        ICON_Z_OFFSET,
      ),
      size: BELL_ICON_SIZE,
    }).getSceneObject();

    const questionObj = createImage(QUESTION_TEXTURE, {
      parent: btnObj,
      name: "QuestionIcon",
      position: new vec3(
        -BUTTON_WIDTH / 2 + BELL_ICON_SIZE / 2 + 0.3,
        0,
        ICON_Z_OFFSET,
      ),
      size: BELL_ICON_SIZE,
    }).getSceneObject();

    const label = createText({
      parent: btnObj,
      name: "BtnLabel",
      text: "",
      size: TextSize.M,
      font: TextFont.Medium,
      position: new vec3(0, 0, ICON_Z_OFFSET),
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Center,
      worldSpaceRect: Rect.create(
        -BUTTON_WIDTH / 2 + 0.3,
        BUTTON_WIDTH / 2 - 0.3,
        -BUTTON_HEIGHT / 2,
        BUTTON_HEIGHT / 2,
      ),
    });

    const tracked: TrackedTopicButton = {
      topicId: "",
      sceneObject: btnObj,
      button: btn,
      label,
      bellObj,
      spinnerObj,
      questionObj,
    };

    btn.onTriggerUp.add(() => {
      this.onTopicClicked.invoke(tracked.topicId);
      btn.toggle(true);
    });
    btn.interactable.onHoverEnter.add(() => {
      this.selectorHovered = true;
      this.updateExpansionState();
    });
    btn.interactable.onHoverExit.add(() => {
      this.selectorHovered = false;
      this.updateExpansionState();
    });

    return tracked;
  }

  setTrackTarget(
    target: Transform,
    getVisualTopY: () => number,
    getPushOffset?: () => number,
  ): void {
    this.trackTarget = target;
    this.getVisualTopY = getVisualTopY;
    this.getPushOffset = getPushOffset ?? null;
    this.setTracking(true);
  }

  requestRetrack(): void {
    this.setTracking(true);
  }

  setTopics(
    topics: ChatTopic[],
    activeTopicId: string,
    unreadTopicIds: Set<string>,
  ): void {
    this.topics = topics;
    this.activeTopicId = activeTopicId;
    this.unreadTopicIds = unreadTopicIds;
    this.cachedTopicMap = new Map(topics.map((t) => [t.id, t]));

    const sorted = this.sortTopics(topics);
    const sortedIds = sorted.map((t) => t.id);

    if (!this.idsMatch(sortedIds, this.lastSortedTopicIds)) {
      this.markDirty(LAYOUT_DIRTY | TOPICS_CHANGED);
    } else {
      this.markDirty(STATE_DIRTY);
    }
  }

  private sortTopics(topics: ChatTopic[]): ChatTopic[] {
    return [...topics].sort((a, b) => b.createdAt - a.createdAt);
  }

  private idsMatch(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  setExpanded(expanded: boolean): void {
    if (this._cloneMode) return;
    if (this.expanded !== expanded) {
      this.expanded = expanded;
      this.markDirty(LAYOUT_DIRTY);
    }
  }

  setCloneMode(cloneMode: boolean): void {
    if (this._cloneMode !== cloneMode) {
      this._cloneMode = cloneMode;
      this.markDirty(LAYOUT_DIRTY);
    }
  }

  setHovered(hovered: boolean): void {
    this.hovered = hovered;
    this.updateExpansionState();
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    if (!selected) {
      if (this.collapseTimer !== null) {
        clearTimeout(this.collapseTimer);
        this.collapseTimer = null;
      }
      this.setExpanded(false);
    } else {
      this.updateExpansionState();
    }
  }

  private updateExpansionState(): void {
    const shouldExpand = this.selectorHovered || this.hovered;
    if (shouldExpand) {
      if (this.collapseTimer !== null) {
        clearTimeout(this.collapseTimer);
        this.collapseTimer = null;
      }
      this.setExpanded(true);
    } else {
      if (this.collapseTimer === null) {
        this.collapseTimer = setTimeout(() => {
          this.collapseTimer = null;
          this.setExpanded(false);
        }, 1500);
      }
    }
  }

  destroyScrollWindow(): void {
    this.scrollWindow?.destroy();
    this.scrollWindow = null;
  }

  getPlateHeight(): number {
    return this.currentPlateHeight;
  }

  setMinimizeBtnVisible(visible: boolean): void {
    this.minimizeBtnObj.enabled = visible;
  }

  private repositionMinimizeBtn(plateWidth: number): void {
    const x = -plateWidth / 2 - MINIMIZE_BTN_OUTSET - MINIMIZE_BTN_SIZE / 2;
    const y = this.currentPlateHeight / 2;
    this.minimizeBtnObj
      .getTransform()
      .setLocalPosition(new vec3(x, y, ICON_Z_OFFSET));
  }

  setSettingsActive(active: boolean): void {
    if (this._settingsActive !== active) {
      this._settingsActive = active;
      this.markDirty(STATE_DIRTY);
    }
  }

  isConsumingInput(): boolean {
    return this.selectorHovered;
  }

  setOffline(offline: boolean): void {
    if (offline === this._offline) return;
    this._offline = offline;
    if (offline) {
      this._loading = false;
      this._loadingTransitionCancels.cancel();
      this.loadingLabelObj.enabled = false;
      this.loadingSpinnerObj.enabled = false;
      this.collapsedContainer.enabled = false;
      this.cloneTitleObj.enabled = false;
      if (this.scrollContainer) {
        this.scrollContainer.enabled = false;
      }
      this.selectorHovered = false;
      this.refreshOffline();
    } else {
      this.offlineLabelObj.enabled = false;
      this.offlineSubtextObj.enabled = false;
      this.markDirty(LAYOUT_DIRTY | TOPICS_CHANGED);
    }
  }

  setLoading(loading: boolean): void {
    if (loading === this._loading) return;
    this._loading = loading;
    if (this._offline) return;
    this._loadingTransitionCancels.cancel();
    if (loading) {
      this.collapsedContainer.enabled = false;
      this.cloneTitleObj.enabled = false;
      if (this.scrollContainer) {
        this.scrollContainer.enabled = false;
      }
      this.selectorHovered = false;
      this.refreshLoading();
    } else {
      this.animateLoadingOut();
    }
  }

  private animateLoadingOut(): void {
    // Consume any pending dirty flags so onFlush doesn't snap over the animation
    this.clearDirty();

    // 1. Fade out loading label + conceal spinner
    this.loadingSpinner.conceal();
    animate({
      duration: LOADING_FADE_DURATION,
      easing: "ease-in-cubic",
      cancelSet: this._loadingTransitionCancels,
      update: (t: number) => {
        this.loadingLabelText.textFill.color = new vec4(1, 1, 1, 0.5 * (1 - t));
      },
      ended: () => {
        this.loadingLabelObj.enabled = false;
        this.loadingSpinnerObj.enabled = false;
      },
    });

    // 2. After a short overlap, build the real layout and slide it in
    setTimeout(() => {
      if (this._loading || this._offline) return;
      this.clearDirty();
      this.applyLayout(true);

      // Collect the content container that applyLayout just enabled
      const contentObj = this.expanded
        ? this.scrollContainer
        : this._cloneMode
          ? this.cloneTitleObj
          : this.collapsedContainer;
      if (!contentObj) return;

      const transform = contentObj.getTransform();
      const finalPos = transform.getLocalPosition();
      const startY = finalPos.y + CONTENT_SLIDE_Y;
      const startScale = 0.85;
      transform.setLocalPosition(new vec3(finalPos.x, startY, finalPos.z));
      transform.setLocalScale(new vec3(startScale, startScale, 1));

      animate({
        duration: CONTENT_SLIDE_DURATION,
        easing: "ease-out-cubic",
        cancelSet: this._loadingTransitionCancels,
        update: (t: number) => {
          const y = MathUtils.lerp(startY, finalPos.y, t);
          transform.setLocalPosition(new vec3(finalPos.x, y, finalPos.z));
          const s = MathUtils.lerp(startScale, 1, t);
          transform.setLocalScale(new vec3(s, s, 1));
        },
        ended: () => {
          transform.setLocalPosition(finalPos);
          transform.setLocalScale(vec3.one());
        },
      });
    }, CONTENT_SLIDE_DELAY_MS);
  }

  private refreshOffline(): void {
    this.offlineLabelObj.enabled = true;
    this.offlineSubtextObj.enabled = true;

    const labelWidth = COLLAPSED_TOPIC_WIDTH;
    const plateWidth = labelWidth + PADDING.x * 2;
    const subtextGap = 0.4;
    const plateHeight = BUTTON_HEIGHT + subtextGap + 1 + PADDING.y * 2;
    this.currentPlateHeight = plateHeight;

    this.backPlate.size = new vec2(plateWidth, plateHeight);


    const centerY = plateHeight / 2;

    this.backPlate
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(0, centerY, 0));

    this.repositionMinimizeBtn(plateWidth);

    this.offlineLabelObj
      .getTransform()
      .setLocalPosition(new vec3(0, centerY + 0.5, Z_CONTENT));

    this.offlineSubtextObj
      .getTransform()
      .setLocalPosition(new vec3(0, centerY - 0.7, Z_CONTENT));
  }

  private refreshLoading(): void {
    this.loadingLabelObj.enabled = true;
    this.loadingSpinnerObj.enabled = true;

    const labelWidth = COLLAPSED_TOPIC_WIDTH;
    const plateWidth = labelWidth + PADDING.x * 2;
    const plateHeight = BUTTON_HEIGHT + PADDING.y * 2;
    this.currentPlateHeight = plateHeight;

    this.backPlate.size = new vec2(plateWidth, plateHeight);

    const centerY = plateHeight / 2;

    this.backPlate
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(0, centerY, 0));

    this.repositionMinimizeBtn(plateWidth);

    const spinnerGap = 0.6;
    const spinnerX = -labelWidth / 2 + SPINNER_SIZE / 2 + 0.3;
    this.loadingSpinnerObj
      .getTransform()
      .setLocalPosition(new vec3(spinnerX, centerY, Z_CONTENT));

    const textInset = SPINNER_SIZE + 0.3 + spinnerGap;
    this.loadingLabelObj
      .getTransform()
      .setLocalPosition(new vec3(textInset / 2, centerY, Z_CONTENT));
  }

  private rebuildButtons(): void {
    if (this.topics.length === 0) {
      for (const tracked of this.trackedButtons) {
        tracked.sceneObject.enabled = false;
      }
      this.lastSortedTopicIds = [];
      return;
    }

    const sorted = this.sortTopics(this.topics);
    this.lastSortedTopicIds = sorted.map((t) => t.id);

    const totalContentWidth =
      sorted.length * BUTTON_WIDTH + (sorted.length - 1) * BUTTON_SPACING;
    const scrollDimWidth = Math.max(totalContentWidth, SCROLL_WINDOW_WIDTH);

    for (let i = 0; i < sorted.length; i++) {
      const topic = sorted[i];
      const x =
        -(scrollDimWidth / 2) +
        i * (BUTTON_WIDTH + BUTTON_SPACING) +
        BUTTON_WIDTH / 2;

      if (i < this.trackedButtons.length) {
        // Reuse existing button — update its topic binding and position
        const tracked = this.trackedButtons[i];
        tracked.topicId = topic.id;
        tracked.label.text = topic.title;
        tracked.sceneObject.enabled = true;
        tracked.sceneObject.getTransform().setLocalPosition(new vec3(x, 0, 0));
      } else {
        const tracked = this._createTopicSlot(i);
        tracked.topicId = topic.id;
        tracked.label.text = topic.title;
        tracked.sceneObject.getTransform().setLocalPosition(new vec3(x, 0, 0));
        this.trackedButtons.push(tracked);
      }
    }

    // Disable any excess buttons beyond the new count (preserve pool, don't destroy)
    for (let i = sorted.length; i < this.trackedButtons.length; i++) {
      this.trackedButtons[i].sceneObject.enabled = false;
    }

    this.scrollWindow!.scrollDimensions = new vec2(
      scrollDimWidth,
      BUTTON_HEIGHT,
    );

    // Sync visual state for all buttons (reused and new alike)
    this.updateExpandedButtonStates();
    this.scrollToActiveTopic();
  }

  private scrollToActiveTopic(): void {
    if (!this.scrollWindow || this.trackedButtons.length === 0) return;

    const activeIndex = this.trackedButtons.findIndex(
      (t) => t.topicId === this.activeTopicId,
    );
    if (activeIndex < 0) return;

    this.lastScrolledTopicId = this.activeTopicId;

    const scrollDimWidth = this.scrollWindow.scrollDimensions.x;
    const buttonX =
      -(scrollDimWidth / 2) +
      activeIndex * (BUTTON_WIDTH + BUTTON_SPACING) +
      BUTTON_WIDTH / 2;

    const maxScroll = Math.max(0, (scrollDimWidth - SCROLL_WINDOW_WIDTH) / 2);
    const targetX = Math.max(-maxScroll, Math.min(maxScroll, -buttonX));

    this.scrollWindow.scrollPosition = new vec2(targetX, 0);
  }

  private updateExpandedButtonStates(): void {
    if (this.activeTopicId !== this.lastScrolledTopicId) {
      this.scrollToActiveTopic();
    }
    for (const tracked of this.trackedButtons) {
      const topic = this.cachedTopicMap.get(tracked.topicId);
      if (!topic) continue;

      const isActive = topic.id === this.activeTopicId;
      const isUnread = this.unreadTopicIds.has(topic.id);
      const isRunning = ACTIVE_STATUSES.has(topic.metadata?.status ?? "");
      const isAwaiting = topic.metadata?.status === AWAITING_STATUS;

      tracked.label.text = topic.title;
      tracked.button.toggle(isActive && this.shouldHighlightActiveTopic);
      tracked.spinnerObj.enabled = isRunning && !isAwaiting;
      tracked.questionObj.enabled = isAwaiting;
      tracked.bellObj.enabled = isUnread && !isRunning && !isAwaiting;

      const hasLeftIcon = isRunning || isUnread || isAwaiting;
      const textInset = hasLeftIcon ? BELL_ICON_SIZE + 0.3 : 0;
      tracked.label.worldSpaceRect = Rect.create(
        -BUTTON_WIDTH / 2 + 0.3 + textInset,
        BUTTON_WIDTH / 2 - 0.3,
        -BUTTON_HEIGHT / 2,
        BUTTON_HEIGHT / 2,
      );
    }
  }

  private refreshCollapsed(): void {
    if (this.scrollContainer) {
      this.scrollContainer.enabled = false;
    }
    this.selectorHovered = false;

    const activeTopic = this.topics.find((t) => t.id === this.activeTopicId);
    const plateHeight = BUTTON_HEIGHT + PADDING.y * 2;
    this.currentPlateHeight = plateHeight;
    const centerY = plateHeight / 2;
    let plateWidth: number;

    if (this._cloneMode) {
      this.collapsedContainer.enabled = false;

      plateWidth = CLONE_TOPIC_WIDTH + PADDING.x * 2;

      const isRunning = ACTIVE_STATUSES.has(
        activeTopic?.metadata?.status ?? "",
      );
      const isAwaiting = activeTopic?.metadata?.status === AWAITING_STATUS;
      const isUnread = activeTopic
        ? this.unreadTopicIds.has(activeTopic.id)
        : false;

      this.cloneSpinnerObj.enabled = isRunning && !isAwaiting;
      this.cloneQuestionObj.enabled = isAwaiting;
      this.cloneBellObj.enabled = isUnread && !isRunning && !isAwaiting;

      const hasLeftIcon = isRunning || isUnread || isAwaiting;
      const textInset = hasLeftIcon ? BELL_ICON_SIZE + 0.3 : 0;

      this.cloneTitleText.text = activeTopic ? activeTopic.title : "No Chat";
      this.cloneTitleText.worldSpaceRect = Rect.create(
        -CLONE_TOPIC_WIDTH / 2 + 0.3 + textInset,
        CLONE_TOPIC_WIDTH / 2 - 0.3,
        -BUTTON_HEIGHT / 2,
        BUTTON_HEIGHT / 2,
      );
      this.cloneTitleObj.enabled = true;
      this.cloneTitleObj
        .getTransform()
        .setLocalPosition(new vec3(0, centerY, Z_CONTENT));
    } else {
      this.cloneTitleObj.enabled = false;
      this.collapsedContainer.enabled = true;

      const isRunning = ACTIVE_STATUSES.has(
        activeTopic?.metadata?.status ?? "",
      );
      const isAwaiting = activeTopic?.metadata?.status === AWAITING_STATUS;
      const isUnread = activeTopic
        ? this.unreadTopicIds.has(activeTopic.id)
        : false;

      this.collapsedTopicBtn.toggle(this.shouldHighlightActiveTopic);
      this.collapsedTopicText.text = activeTopic
        ? activeTopic.title
        : "No Chat";
      this.collapsedSpinnerObj.enabled = isRunning && !isAwaiting;
      this.collapsedQuestionObj.enabled = isAwaiting;
      this.collapsedBellObj.enabled = isUnread && !isRunning && !isAwaiting;

      const hasLeftIcon = isRunning || isUnread || isAwaiting;
      const textInset = hasLeftIcon ? BELL_ICON_SIZE + 0.3 : 0;
      this.collapsedTopicText.worldSpaceRect = Rect.create(
        -COLLAPSED_TOPIC_WIDTH / 2 + 0.3 + textInset,
        COLLAPSED_TOPIC_WIDTH / 2 - 0.3,
        -BUTTON_HEIGHT / 2,
        BUTTON_HEIGHT / 2,
      );

      this.collapsedNewChatObj.enabled = true;
      const collapsedTotalWidth =
        NEW_CHAT_WIDTH + COLLAPSED_GAP + COLLAPSED_TOPIC_WIDTH;
      const collTopicX =
        -collapsedTotalWidth / 2 +
        NEW_CHAT_WIDTH +
        COLLAPSED_GAP +
        COLLAPSED_TOPIC_WIDTH / 2;
      this.collapsedTopicObj
        .getTransform()
        .setLocalPosition(new vec3(collTopicX, 0, 0));

      plateWidth = collapsedTotalWidth + PADDING.x * 2;

      this.collapsedContainer
        .getTransform()
        .setLocalPosition(new vec3(0, centerY, Z_CONTENT));
    }

    this.backPlate
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(0, centerY, 0));

    this.animatePlateWidth(plateWidth, plateHeight);
  }

  private refreshExpanded(): void {
    this.ensureScrollView();
    this.collapsedContainer.enabled = false;
    this.scrollContainer!.enabled = true;

    const plateWidth = TOTAL_CONTENT_WIDTH + PADDING.x * 2;
    const plateHeight = BUTTON_HEIGHT + PADDING.y * 2;
    this.currentPlateHeight = plateHeight;

    const centerY = plateHeight / 2;

    this.backPlate
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(0, centerY, 0));

    this.scrollContainer!.getTransform().setLocalPosition(
      new vec3(0, centerY, Z_CONTENT),
    );

    this.animatePlateWidth(plateWidth, plateHeight);
  }

  private animatePlateWidth(targetWidth: number, plateHeight: number): void {
    if (this._animatedPlateWidth === null) {
      this._animatedPlateWidth = targetWidth;
      this.backPlate.size = new vec2(targetWidth, plateHeight);
      this.repositionMinimizeBtn(targetWidth);
      return;
    }
    const startWidth = this._animatedPlateWidth;
    animate({
      duration: 0.2,
      easing: "ease-out-cubic",
      cancelSet: this._plateAnimCancels,
      update: (t: number) => {
        const w = MathUtils.lerp(startWidth, targetWidth, t);
        this._animatedPlateWidth = w;
        this.backPlate.size = new vec2(w, plateHeight);
        this.repositionMinimizeBtn(w);
      },
    });
  }

  private applyLayout(topicsChanged: boolean): void {
    if (this._offline) {
      this.refreshOffline();
      return;
    }
    if (this._loading) {
      this.refreshLoading();
      return;
    }
    if (this.expanded) {
      this.ensureScrollView();
      if (topicsChanged || this.lastSortedTopicIds.length === 0) {
        this.rebuildButtons();
      } else {
        this.updateExpandedButtonStates();
      }
      this.refreshExpanded();
    } else {
      this.refreshCollapsed();
    }
  }

  protected onFlush(flags: number): void {
    if (!this._backPlateHoverHooked && this.backPlate.interactable) {
      this._backPlateHoverHooked = true;
      this.backPlate.interactable.onHoverEnter.add(() => {
        this.selectorHovered = true;
        this.updateExpansionState();
      });
      this.backPlate.interactable.onHoverExit.add(() => {
        this.selectorHovered = false;
        this.updateExpansionState();
      });
    }
    if (this._offline) return;
    if (flags & LAYOUT_DIRTY) {
      this.applyLayout(!!(flags & TOPICS_CHANGED));
    } else if (flags & STATE_DIRTY) {
      if (this._loading) return;
      if (this.expanded) {
        this.updateExpandedButtonStates();
      } else {
        this.refreshCollapsed();
      }
    }
  }

  protected onTrack(): void {
    if (!this.trackTarget || !this.getVisualTopY) {
      this.setTracking(false);
      return;
    }

    const pos = this.trackTarget.getLocalPosition();
    const pushOffset = this.getPushOffset ? this.getPushOffset() : 0;
    const anchorY =
      pos.y + this.getVisualTopY() + PADDING_ABOVE_VISUAL + pushOffset;

    if (
      Math.abs(pos.x - this.lastTrackX) > 0.0001 ||
      Math.abs(pos.z - this.lastTrackZ) > 0.0001 ||
      Math.abs(anchorY - this.lastAnchorY) > 0.0001
    ) {
      this.lastTrackX = pos.x;
      this.lastTrackZ = pos.z;
      this.lastAnchorY = anchorY;
      this._scratchLocalPos.x = pos.x;
      this._scratchLocalPos.y = anchorY;
      this._scratchLocalPos.z = pos.z;
      this.getSceneObject()
        .getTransform()
        .setLocalPosition(this._scratchLocalPos);
    } else {
      this.setTracking(false);
    }
  }
}
