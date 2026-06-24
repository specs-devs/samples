import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate";
import { ScrollWindow } from "SpectaclesUIKit.lspkg/Scripts/Components/ScrollWindow/ScrollWindow";
import { AgentButton } from "./AgentButton";
import { Agent, AgentStatus } from "../../Types";
import { THEME_KEYS } from "../Shared/UIConstants";
import { RobotState, RobotTheme, STATUS_TO_ROBOT_STATE, toTitleCase } from "../Shared/RobotTypes";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";
import { setTimeout, clearTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import { DirtyComponent } from "../Shared/DirtyComponent";
import { initializeScrollWindow } from "../Shared/UIBuilders";

const BUTTON_SIZE = 4.5;
const BUTTON_SPACING = 1;
const MAX_VISIBLE_BUTTONS = 3;
const SCROLL_WINDOW_WIDTH = 28;
const PADDING = new vec2(1, 0.5);
const Z_CONTENT = 0.15;
const FADE_DURATION = 0.25;
const SHOW_DELAY_MS = 150;

interface TrackedButton {
  agentId: string;
  sceneObject: SceneObject;
  agentButton: AgentButton;
}

@component
export class AgentButtonBar extends DirtyComponent {
  private content: SceneObject;
  private backPlate: BackPlate;
  private scrollWindow: ScrollWindow;
  private scrollAnchor: SceneObject;
  private trackedButtons: TrackedButton[] = [];
  private buttonMap: Map<string, TrackedButton> = new Map();
  private activeAgentId = "";
  private maxWidth = SCROLL_WINDOW_WIDTH;
  private pendingAgents: Agent[] = [];
  private animCancels = new CancelSet();
  private themeMap: Map<string, string> = new Map();
  private _interactionEnabled = true;
  private _isVisible = false;
  private _currentAlpha = 0;
  private _plateRmv: RenderMeshVisual | null = null;
  private _showDelayHandle: ReturnType<typeof setTimeout> | null = null;
  private _cachedWorldPositions: { agentId: string; worldPos: vec3 }[] = [];
  private _worldPositionsDirty = true;

  public readonly onAgentSelected = new Event<string>();

  onAwake(): void {
    super.onAwake();
    const root = this.getSceneObject();

    this.content = global.scene.createSceneObject("AgentBarContent");
    this.content.setParent(root);
    this.content.getTransform().setLocalPosition(vec3.zero());
    this.content.enabled = false;

    const plateObj = global.scene.createSceneObject("AgentBarBackPlate");
    plateObj.setParent(this.content);
    plateObj.getTransform().setLocalPosition(vec3.zero());
    this.backPlate = plateObj.createComponent(
      BackPlate.getTypeName(),
    ) as BackPlate;
    this.backPlate.style = "dark";

    this.scrollAnchor = global.scene.createSceneObject("AgentBarScrollAnchor");
    this.scrollAnchor.setParent(this.content);
    this.scrollAnchor.getTransform().setLocalPosition(vec3.zero());

    const scrollObj = global.scene.createSceneObject("AgentBarScrollWindow");
    scrollObj.setParent(this.scrollAnchor);
    scrollObj.getTransform().setLocalPosition(vec3.zero());

    this.scrollWindow = scrollObj.createComponent(
      ScrollWindow.getTypeName(),
    ) as ScrollWindow;
    this.scrollWindow.vertical = false;
    this.scrollWindow.horizontal = true;
    const defaultHeight = BUTTON_SIZE + PADDING.y * 2;
    this.scrollWindow.windowSize = new vec2(SCROLL_WINDOW_WIDTH, defaultHeight);
    this.scrollWindow.scrollDimensions = new vec2(
      SCROLL_WINDOW_WIDTH,
      defaultHeight,
    );
    initializeScrollWindow(this.scrollWindow);
  }

  syncAgents(agents: Agent[], themeIndexFn: (agentId: string) => number): void {
    this.pendingAgents = agents;
    for (const agent of agents) {
      const idx = themeIndexFn(agent.id);
      this.themeMap.set(agent.id, THEME_KEYS[idx] ?? "robot");
    }
    this.scheduleLayout();
  }

  setActiveAgent(agentId: string): void {
    if (agentId === this.activeAgentId) return;
    const prev = this.buttonMap.get(this.activeAgentId);
    if (prev) prev.agentButton.setToggled(false);
    this.activeAgentId = agentId;
    const next = this.buttonMap.get(agentId);
    if (next) next.agentButton.setToggled(true);
  }

  setAgentStatus(agentId: string, status: AgentStatus): void {
    const tracked = this.buttonMap.get(agentId);
    if (tracked) {
      tracked.agentButton.setStatus(STATUS_TO_ROBOT_STATE[status]);
    }
  }

  setAgentRobotState(agentId: string, state: RobotState): void {
    const tracked = this.buttonMap.get(agentId);
    if (tracked) {
      tracked.agentButton.setStatus(state);
    }
  }

  setAgentTheme(agentId: string, themeKey: string): void {
    this.themeMap.set(agentId, themeKey);
    const tracked = this.buttonMap.get(agentId);
    if (tracked) {
      tracked.agentButton.setStyling(themeKey as RobotTheme);
    }
  }

  setMaxWidth(width: number): void {
    if (width === this.maxWidth) return;
    this.maxWidth = width;
    this.scheduleLayout();
  }

  getVisualHeight(): number {
    if (this.pendingAgents.length === 0) return 0;
    return BUTTON_SIZE + PADDING.y * 2;
  }

  getVisualWidth(): number {
    if (this.pendingAgents.length === 0) return 0;
    const visibleCount = Math.min(this.pendingAgents.length, MAX_VISIBLE_BUTTONS);
    const visibleContentWidth =
      visibleCount * BUTTON_SIZE + (visibleCount - 1) * BUTTON_SPACING;
    return Math.min(visibleContentWidth + PADDING.x * 2, this.maxWidth);
  }

  getButtonWorldPositions(): { agentId: string; worldPos: vec3 }[] {
    if (this._worldPositionsDirty || this._cachedWorldPositions.length !== this.trackedButtons.length) {
      this._cachedWorldPositions = this.trackedButtons.map((tb) => ({
        agentId: tb.agentId,
        worldPos: tb.sceneObject.getTransform().getWorldPosition(),
      }));
      this._worldPositionsDirty = false;
    } else {
      for (let i = 0; i < this.trackedButtons.length; i++) {
        this._cachedWorldPositions[i].worldPos =
          this.trackedButtons[i].sceneObject.getTransform().getWorldPosition();
      }
    }
    return this._cachedWorldPositions;
  }

  setHoveredAgent(agentId: string | null): void {
    for (const tracked of this.trackedButtons) {
      tracked.agentButton.setHovered(tracked.agentId === agentId);
    }
  }

  setInteractionEnabled(enabled: boolean): void {
    this._interactionEnabled = enabled;
    for (const tracked of this.trackedButtons) {
      tracked.agentButton.setInteractionEnabled(enabled);
    }
  }

  show(): void {
    this._isVisible = true;
    this.animCancels.cancel();

    if (this._showDelayHandle !== null) {
      clearTimeout(this._showDelayHandle);
      this._showDelayHandle = null;
    }

    this._showDelayHandle = setTimeout(() => {
      this._showDelayHandle = null;
      if (!this._isVisible) return;
      this.content.enabled = true;
      this.scrollWindow.getSceneObject().enabled = true;

      const startAlpha = this._currentAlpha;
      animate({
        duration: FADE_DURATION,
        easing: "ease-out-cubic",
        cancelSet: this.animCancels,
        update: (t: number) => {
          this._currentAlpha = startAlpha + (1 - startAlpha) * t;
          this.setContentAlpha(this._currentAlpha);
        },
      });
    }, SHOW_DELAY_MS);
  }

  hide(): void {
    this._isVisible = false;

    if (this._showDelayHandle !== null) {
      clearTimeout(this._showDelayHandle);
      this._showDelayHandle = null;
    }

    this.animCancels.cancel();

    const startAlpha = this._currentAlpha;
    animate({
      duration: FADE_DURATION,
      easing: "ease-in-cubic",
      cancelSet: this.animCancels,
      update: (t: number) => {
        this._currentAlpha = startAlpha * (1 - t);
        this.setContentAlpha(this._currentAlpha);
      },
      ended: () => {
        this.content.enabled = false;
        this.scrollWindow.getSceneObject().enabled = false;
      },
    });
  }

  private setContentAlpha(alpha: number): void {
    if (!this._plateRmv) {
      this._plateRmv = this.backPlate
        .getSceneObject()
        .getComponent("RenderMeshVisual") as RenderMeshVisual | null;
    }
    if (this._plateRmv) {
      this._plateRmv.mainPass.opacityFactor = alpha;
    }

    for (const tracked of this.trackedButtons) {
      tracked.agentButton.setAlpha(alpha);
    }
  }

  private scheduleLayout(): void {
    this.markDirty();
  }

  protected onFlush(_flags: number): void {
    this.rebuildButtons();
  }

  private rebuildButtons(): void {
    this._worldPositionsDirty = true;

    const hasAgents = this.pendingAgents.length > 0;
    const active = hasAgents && this._isVisible;
    this.content.enabled = active;
    this.scrollWindow.getSceneObject().enabled = active;
    if (!hasAgents) {
      for (const tracked of this.trackedButtons) {
        tracked.sceneObject.destroy();
      }
      this.trackedButtons = [];
      this.buttonMap.clear();
      return;
    }

    const count = this.pendingAgents.length;
    const totalContentWidth =
      count * BUTTON_SIZE + (count - 1) * BUTTON_SPACING;
    const scrollDimWidth = totalContentWidth + PADDING.x * 2;

    const pendingIds = new Set(this.pendingAgents.map((a) => a.id));

    for (let i = this.trackedButtons.length - 1; i >= 0; i--) {
      const tracked = this.trackedButtons[i];
      if (!pendingIds.has(tracked.agentId)) {
        tracked.sceneObject.destroy();
        this.buttonMap.delete(tracked.agentId);
        this.trackedButtons.splice(i, 1);
      }
    }

    const newTracked: TrackedButton[] = [];
    const newMap = new Map<string, TrackedButton>();

    for (let i = 0; i < count; i++) {
      const agent = this.pendingAgents[i];
      const existing = this.buttonMap.get(agent.id);

      const startX = -(totalContentWidth / 2) + BUTTON_SIZE / 2;
      const x = startX + i * (BUTTON_SIZE + BUTTON_SPACING);

      if (existing) {
        existing.agentButton.setLabel(toTitleCase(agent.name));
        const themeKey = this.themeMap.get(agent.id) ?? "robot";
        existing.agentButton.setStyling(themeKey as RobotTheme);
        existing.agentButton.setStatus(STATUS_TO_ROBOT_STATE[agent.status]);
        existing.agentButton.setToggled(agent.id === this.activeAgentId);
        existing.agentButton.setInteractionEnabled(this._interactionEnabled);
        existing.sceneObject.getTransform().setLocalPosition(new vec3(x, 0, 0));
        newTracked.push(existing);
        newMap.set(agent.id, existing);
      } else {
        const btnObj = global.scene.createSceneObject(`AgentBarBtn_${agent.id}`);
        this.scrollWindow.addObject(btnObj);

        const agentButton = btnObj.createComponent(
          AgentButton.getTypeName(),
        ) as AgentButton;

        agentButton.setAgentId(agent.id);
        agentButton.setLabel(toTitleCase(agent.name));

        const themeKey = this.themeMap.get(agent.id) ?? "robot";
        agentButton.setStyling(themeKey as RobotTheme);
        agentButton.setStatus(STATUS_TO_ROBOT_STATE[agent.status]);
        agentButton.setToggled(agent.id === this.activeAgentId);
        agentButton.setInteractionEnabled(this._interactionEnabled);
        btnObj.getTransform().setLocalPosition(new vec3(x, 0, 0));

        const capturedId = agent.id;
        agentButton.onTapped.add(() => {
          if (capturedId === this.activeAgentId) {
            agentButton.setToggled(true);
            return;
          }
          this.onAgentSelected.invoke(capturedId);
        });

        const entry: TrackedButton = {
          agentId: agent.id,
          sceneObject: btnObj,
          agentButton,
        };
        newTracked.push(entry);
        newMap.set(agent.id, entry);
      }
    }

    this.trackedButtons = newTracked;
    this.buttonMap = newMap;

    const visibleCount = Math.min(count, MAX_VISIBLE_BUTTONS);
    const visibleContentWidth =
      visibleCount * BUTTON_SIZE + (visibleCount - 1) * BUTTON_SPACING;
    const plateWidth = Math.min(
      visibleContentWidth + PADDING.x * 2,
      this.maxWidth,
    );
    const plateHeight = BUTTON_SIZE + PADDING.y * 2;

    this.scrollWindow.windowSize = new vec2(plateWidth, plateHeight);
    this.scrollWindow.scrollDimensions = new vec2(scrollDimWidth, plateHeight);

    this.backPlate.size = new vec2(plateWidth, plateHeight);

    const centerY = -plateHeight / 2;

    this.backPlate
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(0, centerY, 0));

    this.scrollAnchor
      .getTransform()
      .setLocalPosition(new vec3(0, centerY, Z_CONTENT));
  }
}
