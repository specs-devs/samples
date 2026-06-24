import animate, { CancelSet } from "SpectaclesInteractionKit.lspkg/Utils/animate";
import { setTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { ScrollWindow } from "SpectaclesUIKit.lspkg/Scripts/Components/ScrollWindow/ScrollWindow";
import { AgentStore } from "../../State/AgentStore";
import {
  wipeTransition,
  collectOpacitySurfaces,
  applyOpacityMultiplier,
  OpacitySurface,
} from "../Shared/UIAnimations";
import {
  createSettingsTile,
  createVerticalScrollBar,
  initializeScrollWindow,
} from "../Shared/UIBuilders";
import {
  BOT_TEXTURE,
  UNLINK_TEXTURE,
  TRASH_TEXTURE,
  THEME_KEYS,
  SPARKLES_TEXTURE,
  SCROLLBAR_GAP,
  ANIM_DURATION,
} from "../Shared/UIConstants";
import {
  SettingsSelectionView,
  ToggleEntry,
} from "../Views/SettingsSelectionView";

const PAINT_ROLLER_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/paintRoller.png",
) as Texture;

const TILE_WIDTH = 12;
const TILE_HEIGHT = 10;
const TILE_GAP = 1.2;
const TILE_ICON_SIZE = 2.5;
const TILE_COLS = 2;
const TILE_ROWS = 3;
const VISIBLE_ROWS = 2;
const GRID_H_PADDING = 4;
const SLIDE_OFFSET = 5;
const STAGGER_MS = 60;
const TILE_SLIDE_Y = 2;
const TILE_ANIM_DURATION = 0.3;
const TILE_STAGGER_MS = 55;
const TILE_INITIAL_DELAY_MS = 120;

const SMART_FEATURE_ENTRIES: ToggleEntry[] = [
  {
    label: "Smart Summaries",
    description:
      "Summarize agent notifications with AI so you can quickly understand updates.",
    enabled: false,
  },
  {
    label: "Prompt Suggestions",
    description:
      "Get AI-suggested prompts based on your current context and history.",
    enabled: false,
  },
  {
    label: "Topic Renaming",
    description:
      "Automatically rename new topics with AI-generated titles based on your first message.",
    enabled: false,
  },
  {
    label: "Permission Explainer",
    description:
      "Get a plain-English summary of what the AI is trying to do when it asks for permission.",
    enabled: false,
  },
  {
    label: "Screen Sharing",
    description:
      "Allow the AI agent to send screenshots and images from your computer to your Spectacles.",
    enabled: false,
  },
];

export const SCREEN_SHARING_FEATURE_INDEX = 4;

const THEME_NAMES = ["Cat", "Owl", "Ghost", "Axolotl", "CRT TV", "Robot"];

export class ChatSettingsPanel {
  public readonly sceneObject: SceneObject;
  public readonly contentObject: SceneObject;

  private store: AgentStore;
  private selectionView: SettingsSelectionView;
  private animCancels = new CancelSet();
  private initialized = false;
  private agentId: string | null = null;
  private modelLabel: Text | null = null;
  private themeLabel: Text | null = null;
  private smartFeaturesLabel: Text | null = null;
  private smartFeatures = [false, false, false, false, false];
  private activeDialogue:
    | "model"
    | "repo"
    | "theme"
    | "discover"
    | "smartFeatures"
    | null = null;
  private discoveredWorkspaces: Array<{ path: string; name: string }> = [];
  private navStack: Array<"content" | "external" | "repo"> = [];
  private scrollWindowObj: SceneObject | null = null;
  private scrollWindow: ScrollWindow | null = null;
  private tileEntries: Array<{
    sceneObject: SceneObject;
    gridIndex: number;
    wrapperY: number;
    surfaces: OpacitySurface[];
    iconImage: Image;
  }> = [];

  public readonly onModelChanged = new Event<string>();
  public readonly onRepoChanged = new Event<string>();
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
  public readonly onDisconnectTilePressed = new Event<void>();
  public readonly onClearConversationsPressed = new Event<void>();
  public readonly onSelectionComplete = new Event<void>();
  public readonly onBackToChat = new Event<void>();
  public readonly onContentHeightChanged = new Event<number>();
  public readonly onSubtitleChanged = new Event<string | null>();

  constructor(
    parent: SceneObject,
    store: AgentStore,
    panelWidth: number,
    contentZOffset: number,
    owner?: BaseScriptComponent,
  ) {
    this.store = store;

    this.sceneObject = global.scene.createSceneObject("SettingsRoot");
    this.sceneObject.setParent(parent);
    this.sceneObject
      .getTransform()
      .setLocalPosition(new vec3(0, 0, contentZOffset));
    this.sceneObject.enabled = false;

    this.contentObject = global.scene.createSceneObject("SettingsContent");
    this.contentObject.setParent(this.sceneObject);

    this.selectionView = new SettingsSelectionView(
      this.sceneObject,
      panelWidth,
      owner,
    );
    this.selectionView.onLayoutReady.add(() => {
      this.onContentHeightChanged.invoke(this.selectionView.getTotalHeight());
    });
    this.selectionView.onOptionSelected.add((index: number) => {
      const complete = this.handleSelection(index);
      if (complete) {
        this.onSelectionComplete.invoke(undefined);
      }
    });
    this.selectionView.onBackRequested.add(() => {
      this.activeDialogue = null;
      const origin = this.navStack.pop();
      if (origin === "content") {
        this.showContentTransition();
      } else if (origin === "repo") {
        this.openRepoSelectionView();
      } else {
        this.navStack.length = 0;
        this.onBackToChat.invoke(undefined);
      }
    });
    this.selectionView.onToggleChanged.add(
      (e: { index: number; enabled: boolean }) => {
        this.smartFeatures[e.index] = e.enabled;
        this.updateSmartFeaturesLabel();
        this.onSmartFeatureChanged.invoke(e);
      },
    );
  }

  setAgentId(agentId: string | null): void {
    this.agentId = agentId;
    if (agentId) {
      const stored = this.store.getSmartFeatures(agentId);
      for (let i = 0; i < this.smartFeatures.length; i++) {
        this.smartFeatures[i] = stored[i] ?? false;
      }
      this.updateSmartFeaturesLabel();
    }
  }

  ensureContent(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.initContent();
  }

  getContentHeight(): number {
    const fullRows = Math.floor(VISIBLE_ROWS);
    const fraction = VISIBLE_ROWS - fullRows;
    return (
      fullRows * TILE_HEIGHT +
      (fullRows - 1) * TILE_GAP +
      TILE_GAP +
      fraction * TILE_HEIGHT
    );
  }

  setVerticalOffset(offset: number): void {
    const pos = this.sceneObject.getTransform().getLocalPosition();
    this.sceneObject
      .getTransform()
      .setLocalPosition(new vec3(pos.x, offset, pos.z));
  }

  setBackButtonY(y: number): void {
    this.selectionView.setBackButtonY(y);
  }

  showContent(): void {
    this.animCancels.cancel();

    // All tiles start from the same absolute Y — just below the bottommost tile.
    const commonStartY = this.tileEntries.reduce(
      (min, e) => Math.min(min, e.wrapperY),
      Infinity,
    ) - TILE_SLIDE_Y;

    // Reset to start state while contentObject is still hidden (no flash).
    for (const { sceneObject, surfaces, iconImage, wrapperY } of this.tileEntries) {
      sceneObject
        .getTransform()
        .setLocalPosition(new vec3(0, commonStartY - wrapperY, 0));
      applyOpacityMultiplier(surfaces, 0);
      iconImage.mainPass.opacityFactor = 0;
    }
    this.contentObject.enabled = true;
    this.selectionView.sceneObject.enabled = false;
    this.onSubtitleChanged.invoke(null);
    if (this.scrollWindow) {
      this.scrollWindow.scrollPositionNormalized = new vec2(0, 1);
    }
    this.animateTilesIn(commonStartY);
  }

  private animateTilesIn(commonStartY: number): void {
    if (this.tileEntries.length === 0) return;

    const sorted = [...this.tileEntries].sort(
      (a, b) => a.gridIndex - b.gridIndex,
    );

    for (let i = 0; i < sorted.length; i++) {
      const { sceneObject, surfaces, iconImage, wrapperY } = sorted[i];
      const transform = sceneObject.getTransform();
      const startLocalY = commonStartY - wrapperY;

      setTimeout(() => {
        if (isNull(sceneObject)) return;
        animate({
          duration: TILE_ANIM_DURATION,
          easing: "ease-out-cubic",
          cancelSet: this.animCancels,
          update: (t: number) => {
            if (isNull(sceneObject)) return;
            transform.setLocalPosition(new vec3(0, startLocalY * (1 - t), 0));
            applyOpacityMultiplier(surfaces, t);
            iconImage.mainPass.opacityFactor = t;
          },
          ended: () => {
            if (isNull(sceneObject)) return;
            transform.setLocalPosition(vec3.zero());
            applyOpacityMultiplier(surfaces, 1);
            iconImage.mainPass.opacityFactor = 1;
          },
        });
      }, TILE_INITIAL_DELAY_MS + i * TILE_STAGGER_MS);
    }
  }

  updateLabels(): void {
    this.updateModelLabel();
    this.updateThemeLabel();
  }

  openRepoSelection(): void {
    if (!this.agentId) return;
    this.navStack.push("external");
    this.openRepoSelectionView(true);
  }

  private openRepoSelectionView(immediate = false): void {
    if (!this.agentId) return;
    const agent = this.store.getAgent(this.agentId);
    const isBridge = agent?.provider === "bridge";
    const repoNames = this.store.getRepoNames(this.agentId);
    const displayOptions = isBridge
      ? [...repoNames, "+ Add Workspace"]
      : repoNames;
    if (displayOptions.length === 0) return;
    this.activeDialogue = "repo";
    const config = this.store.getRepos(this.agentId);
    const selectedPath = this.store.getSelectedRepo(this.agentId);
    const selectedIdx = selectedPath
      ? config.findIndex((r) => r.path === selectedPath)
      : 0;
    const actionIndices = isBridge ? [displayOptions.length - 1] : [];
    this.selectionView.showSelection(
      "Select Repository",
      displayOptions,
      Math.max(selectedIdx, 0),
      actionIndices,
    );
    if (immediate) {
      this.animCancels.cancel();
      this.contentObject.enabled = false;
      this.selectionView.sceneObject.enabled = true;
      this.onContentHeightChanged.invoke(this.selectionView.getTotalHeight());
    } else {
      this.showSelectionTransition();
    }
  }

  showDiscoveredWorkspaces(
    workspaces: Array<{ path: string; name: string }>,
  ): void {
    this.navStack.push("repo");
    this.discoveredWorkspaces = workspaces;
    this.activeDialogue = "discover";
    const names = workspaces.map((w) => w.name);
    this.selectionView.showScrollableSelection("Add Workspace", names, -1);
    this.showSelectionTransition();
  }

  resetDialogue(): void {
    this.activeDialogue = null;
    this.navStack.length = 0;
  }

  private initContent(): void {
    const gridWidth = TILE_COLS * TILE_WIDTH + (TILE_COLS - 1) * TILE_GAP;
    const fullHeight = TILE_ROWS * TILE_HEIGHT + (TILE_ROWS - 1) * TILE_GAP;
    const visibleHeight = this.getContentHeight();

    this.scrollWindowObj = global.scene.createSceneObject(
      "SettingsScrollWindow",
    );
    this.scrollWindowObj.setParent(this.contentObject);
    this.scrollWindowObj
      .getTransform()
      .setLocalPosition(new vec3(-GRID_H_PADDING / 2, 0, 0));

    const windowWidth = gridWidth + GRID_H_PADDING;
    this.scrollWindow = this.scrollWindowObj.createComponent(
      ScrollWindow.getTypeName(),
    ) as ScrollWindow;
    this.scrollWindow.vertical = true;
    this.scrollWindow.horizontal = false;
    this.scrollWindow.windowSize = new vec2(windowWidth, visibleHeight);
    this.scrollWindow.scrollDimensions = new vec2(
      windowWidth,
      Math.max(fullHeight, visibleHeight),
    );

    const modelTile = this.createTile(
      "ModelTile",
      "Model",
      "\u2014",
      BOT_TEXTURE,
      0,
      TILE_ICON_SIZE,
    );
    this.modelLabel = modelTile.subtitleText;
    modelTile.button.onTriggerUp.add(() => {
      if (!this.agentId) return;
      const models = this.store.getModels(this.agentId);
      if (models.length === 0) return;
      this.navStack.push("content");
      this.activeDialogue = "model";
      const selectedModel = this.store.getSelectedModel(this.agentId);
      const selectedIdx = selectedModel ? models.indexOf(selectedModel) : 0;
      this.selectionView.showScrollableSelection(
        "Select Model",
        models,
        selectedIdx,
      );
      this.showSelectionTransition();
    });

    const smartFeaturesTile = this.createTile(
      "SmartFeaturesTile",
      "Smart Features",
      this.smartFeaturesSubtitle(),
      SPARKLES_TEXTURE,
      1,
      TILE_ICON_SIZE,
    );
    this.smartFeaturesLabel = smartFeaturesTile.subtitleText;
    smartFeaturesTile.button.onTriggerUp.add(() => {
      this.navStack.push("content");
      this.activeDialogue = "smartFeatures";
      const entries: ToggleEntry[] = SMART_FEATURE_ENTRIES.map((e, i) => ({
        ...e,
        enabled: this.smartFeatures[i],
      }));
      this.selectionView.showToggleList("Smart Features", entries);
      this.showSelectionTransition();
    });

    const themeTile = this.createTile(
      "ThemeTile",
      "Theme",
      "Robot",
      PAINT_ROLLER_TEXTURE,
      2,
    );
    this.themeLabel = themeTile.subtitleText;
    themeTile.button.onTriggerUp.add(() => {
      if (!this.agentId) return;
      this.navStack.push("content");
      this.activeDialogue = "theme";
      const selectedIdx = this.store.getThemeIndex(this.agentId);
      this.selectionView.showScrollableGridSelection(
        "Select Theme",
        THEME_NAMES,
        selectedIdx,
      );
      this.showSelectionTransition();
    });

    const disconnectTile = this.createTile(
      "DisconnectTile",
      "Disconnect",
      "Remove agent",
      UNLINK_TEXTURE,
      4,
    );
    disconnectTile.button.onTriggerUp.add(() => {
      this.activeDialogue = null;
      this.contentObject.enabled = false;
      this.onDisconnectTilePressed.invoke(undefined);
    });

    const clearConversationsTile = this.createTile(
      "ClearConversationsTile",
      "Clear Chats",
      "Remove all chats",
      TRASH_TEXTURE,
      3,
    );
    clearConversationsTile.button.onTriggerUp.add(() => {
      this.activeDialogue = null;
      this.contentObject.enabled = false;
      this.onClearConversationsPressed.invoke(undefined);
    });

    initializeScrollWindow(this.scrollWindow);
    this.scrollWindow.scrollPositionNormalized = new vec2(0, 1);

    createVerticalScrollBar(
      this.contentObject,
      this.scrollWindow,
      new vec3(gridWidth / 2 + SCROLLBAR_GAP, 0, 0),
    );
  }

  private createTile(
    name: string,
    title: string,
    subtitle: string,
    icon: Texture,
    index: number,
    iconSize: number = TILE_ICON_SIZE,
  ) {
    const pos = this.tilePosition(index);
    const wrapperObj = global.scene.createSceneObject(`${name}Wrapper`);
    this.scrollWindow!.addObject(wrapperObj);
    wrapperObj.getTransform().setLocalPosition(pos);

    const tile = createSettingsTile({
      parent: wrapperObj,
      name,
      width: TILE_WIDTH,
      height: TILE_HEIGHT,
      title,
      subtitle,
      icon,
      iconSize,
      position: vec3.zero(),
    });

    const surfaces: OpacitySurface[] = [];
    collectOpacitySurfaces(tile.sceneObject, surfaces);
    this.tileEntries.push({
      sceneObject: tile.sceneObject,
      gridIndex: index,
      wrapperY: pos.y,
      surfaces,
      iconImage: tile.iconImage,
    });

    return tile;
  }

  private tilePosition(index: number): vec3 {
    const gridWidth = TILE_COLS * TILE_WIDTH + (TILE_COLS - 1) * TILE_GAP;
    const fullHeight = TILE_ROWS * TILE_HEIGHT + (TILE_ROWS - 1) * TILE_GAP;
    const col = index % TILE_COLS;
    const row = Math.floor(index / TILE_COLS);
    const x = -gridWidth / 2 + TILE_WIDTH / 2 + col * (TILE_WIDTH + TILE_GAP);
    const y = fullHeight / 2 - TILE_HEIGHT / 2 - row * (TILE_HEIGHT + TILE_GAP);
    return new vec3(x, y, 0);
  }

  private smartFeaturesSubtitle(): string {
    const count = this.smartFeatures.filter(Boolean).length;
    if (count === 0) return "All off";
    return `${count} of ${this.smartFeatures.length} on`;
  }

  private updateSmartFeaturesLabel(): void {
    if (!this.smartFeaturesLabel) return;
    this.smartFeaturesLabel.text = this.smartFeaturesSubtitle();
  }

  private updateModelLabel(): void {
    if (!this.modelLabel) return;
    this.modelLabel.text = this.agentId
      ? (this.store.getSelectedModel(this.agentId) ?? "\u2014")
      : "\u2014";
  }

  private updateThemeLabel(): void {
    if (!this.themeLabel) return;
    const idx = this.agentId ? this.store.getThemeIndex(this.agentId) : 5;
    this.themeLabel.text = THEME_NAMES[idx] ?? "Robot";
  }

  private showSelectionTransition(): void {
    this.animCancels.cancel();
    this.onContentHeightChanged.invoke(this.selectionView.getTotalHeight());
    this.onSubtitleChanged.invoke(this.selectionView.getTitle());
    wipeTransition(this.contentObject, this.selectionView.sceneObject, {
      cancelSet: this.animCancels,
      slideOffset: SLIDE_OFFSET,
      duration: ANIM_DURATION,
      staggerMs: STAGGER_MS,
      direction: "forward",
    });
  }

  private showContentTransition(): void {
    this.animCancels.cancel();
    this.onContentHeightChanged.invoke(this.getContentHeight());
    this.onSubtitleChanged.invoke(null);
    wipeTransition(this.selectionView.sceneObject, this.contentObject, {
      cancelSet: this.animCancels,
      slideOffset: SLIDE_OFFSET,
      duration: ANIM_DURATION,
      staggerMs: STAGGER_MS,
      direction: "back",
    });
  }

  private handleSelection(index: number): boolean {
    if (!this.agentId) return true;

    if (this.activeDialogue === "model") {
      const models = this.store.getModels(this.agentId);
      if (index >= 0 && index < models.length) {
        this.store.setModelIndex(this.agentId, index);
        this.updateModelLabel();
        this.onModelChanged.invoke(models[index]);
      }
    } else if (this.activeDialogue === "repo") {
      const repos = this.store.getRepos(this.agentId);
      if (index >= 0 && index < repos.length) {
        this.store.setRepoIndex(this.agentId, index);
        this.onRepoChanged.invoke(repos[index].path);
      } else if (index === repos.length) {
        this.onAddWorkspaceRequested.invoke(undefined);
        return false;
      }
    } else if (this.activeDialogue === "discover") {
      if (index >= 0 && index < this.discoveredWorkspaces.length) {
        this.onDiscoveredWorkspaceSelected.invoke(
          this.discoveredWorkspaces[index],
        );
      }
    } else if (this.activeDialogue === "theme") {
      if (index >= 0 && index < THEME_KEYS.length) {
        this.store.setThemeIndex(this.agentId, index);
        this.updateThemeLabel();
        this.onThemeChanged.invoke(THEME_KEYS[index]);
      }
    }

    this.activeDialogue = null;
    return true;
  }
}
