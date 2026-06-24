import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import { RobotMeshController } from "../../../Visuals/Scripts/RobotMeshController";
import { TextSize, TextFont } from "../Shared/TextSizes";
import { ICON_Z_OFFSET } from "../Shared/UIConstants";
import { createText } from "../Shared/UIBuilders";
import { RobotState, RobotTheme } from "../Shared/RobotTypes";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";

const MESH_PREFAB: ObjectPrefab = requireAsset(
  "../../../Prefabs/AgentMesh.prefab",
) as ObjectPrefab;

const BUTTON_SIZE = 4.5;
const MESH_SCALE = BUTTON_SIZE * 0.5;
const MESH_TILT_RAD = MathUtils.DegToRad * 30;
const TEXT_PADDING_BOTTOM = -1.65;

@component
export class AgentButton extends BaseScriptComponent {
  private button: RectangleButton;
  private btnObj: SceneObject;
  private robotController: RobotMeshController;
  private labelText: Text;
  private meshContainer: SceneObject;
  private meshObj: SceneObject;
  private _agentId = "";
  private _pendingLabel: string | null = null;
  private _pendingTheme: RobotTheme | null = null;
  private _pendingState: RobotState | null = null;
  private _pendingToggle: boolean | null = null;
  private _isToggled = false;
  private _lastAlpha = 1;
  private readonly _scratchScale = new vec3(1, 1, 1);
  private readonly _scratchColor = new vec4(1, 1, 1, 1);

  public readonly onTapped = new Event<void>();

  onAwake(): void {
    const root = this.getSceneObject();

    this.btnObj = global.scene.createSceneObject("AgentButtonRect");
    this.btnObj.setParent(root);

    this.button = this.btnObj.createComponent(
      RectangleButton.getTypeName(),
    ) as RectangleButton;

    const btnRecord = this.button as unknown as Record<string, string>;
    this.button.style;
    btnRecord["_style"] = "Ghost";

    this.button.setIsToggleable(true);
    this.button.size = new vec3(BUTTON_SIZE, BUTTON_SIZE, 2);
    this.button.initialize();

    this.meshContainer = global.scene.createSceneObject("AgentButtonMeshTilt");
    this.meshContainer.setParent(this.btnObj);
    this.meshContainer
      .getTransform()
      .setLocalPosition(new vec3(0, 0.4, ICON_Z_OFFSET));
    this.meshContainer
      .getTransform()
      .setLocalRotation(quat.fromEulerAngles(MESH_TILT_RAD, 0, 0));

    this.meshObj = MESH_PREFAB.instantiate(this.meshContainer);
    this.meshObj.name = "AgentButtonMesh";
    this.meshObj
      .getTransform()
      .setLocalScale(vec3.one().uniformScale(MESH_SCALE));

    this.robotController = this.meshObj.getComponent(
      RobotMeshController.getTypeName(),
    ) as RobotMeshController;
    this.robotController.setBaseScale(vec3.one().uniformScale(MESH_SCALE));

    this.labelText = createText({
      parent: this.btnObj,
      name: "AgentButtonLabel",
      text: "Agent",
      size: TextSize.S,
      font: TextFont.Medium,
      color: new vec4(1, 1, 1, 1),
      position: new vec3(0, TEXT_PADDING_BOTTOM, ICON_Z_OFFSET * 2),
      horizontalAlignment: HorizontalAlignment.Center,
      horizontalOverflow: HorizontalOverflow.Truncate,
      worldSpaceRect: Rect.create(
        -BUTTON_SIZE / 2 + 0.3,
        BUTTON_SIZE / 2 - 0.3,
        -0.5,
        0.5,
      ),
    });

    this.button.onTriggerUp.add(() => {
      this.onTapped.invoke(undefined);
    });

    if (this._pendingLabel !== null) {
      this.labelText.text = this._pendingLabel;
      this._pendingLabel = null;
    }
    if (this._pendingTheme !== null) {
      this.robotController.setTheme(this._pendingTheme);
      this._pendingTheme = null;
    }
    if (this._pendingState !== null) {
      this.robotController.setRobotState(this._pendingState);
      this._pendingState = null;
    }
    if (this._pendingToggle !== null) {
      this._isToggled = this._pendingToggle;
      this.button.toggle(this._pendingToggle);
      this._pendingToggle = null;
    }
  }

  setStyling(theme: RobotTheme): void {
    if (!this.robotController) {
      this._pendingTheme = theme;
      return;
    }
    this.robotController.setTheme(theme);
  }

  setStatus(state: RobotState): void {
    if (!this.robotController) {
      this._pendingState = state;
      return;
    }
    this.robotController.setRobotState(state);
  }

  setLabel(text: string): void {
    if (!this.labelText) {
      this._pendingLabel = text;
      return;
    }
    this.labelText.text = text;
  }

  setHovered(hovered: boolean): void {
    if (this.button) {
      // Drive through _interactableStateMachine.state directly so the event chain
      // (state → Element.onInteractableHovered/Default → visual.setState) fires correctly.
      // We cannot use button.toggle() here: the transition table maps hovered+toggleOff → hovered,
      // so toggle(false) on a hovered button leaves it stuck in the hovered visual state.
      const sm = (this.button as unknown as { _interactableStateMachine?: { state: string } })
        ._interactableStateMachine;
      if (sm) {
        sm.state = hovered
          ? "hovered"
          : this._isToggled
            ? "toggledDefault"
            : "default";
      }
    }
  }

  setInteractionEnabled(enabled: boolean): void {
    if (this.button?.interactable) {
      this.button.interactable.enabled = enabled;
    }
  }

  setToggled(active: boolean): void {
    this._isToggled = active;
    if (!this.button) {
      this._pendingToggle = active;
      return;
    }
    this.button.toggle(active);
  }

  setAgentId(id: string): void {
    this._agentId = id;
  }

  getAgentId(): string {
    return this._agentId;
  }

  getButton(): RectangleButton {
    return this.button;
  }

  getRobotController(): RobotMeshController {
    return this.robotController;
  }

  setAlpha(alpha: number): void {
    if (!this.meshObj || !this.labelText || !this.button) return;
    if (Math.abs(alpha - this._lastAlpha) < 0.001) return;
    this._lastAlpha = alpha;

    const s = MESH_SCALE * alpha;
    this._scratchScale.x = s;
    this._scratchScale.y = s;
    this._scratchScale.z = s;
    this.meshObj.getTransform().setLocalScale(this._scratchScale);

    this.button.visual.renderMeshVisual.mainPass.opacityFactor = alpha;
    const c = this.labelText.textFill.color;
    this._scratchColor.r = c.r;
    this._scratchColor.g = c.g;
    this._scratchColor.b = c.b;
    this._scratchColor.a = alpha;
    this.labelText.textFill.color = this._scratchColor;
  }
}
