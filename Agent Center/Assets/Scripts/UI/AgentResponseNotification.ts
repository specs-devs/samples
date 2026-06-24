import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import { Billboard } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Billboard/Billboard";
import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";
import { setTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import { TextSize, TextFont } from "./Shared/TextSizes";
import { createText } from "./Shared/UIBuilders";
import { RobotState, RobotTheme } from "./Shared/RobotTypes";
import { RobotMeshController } from "../../Visuals/Scripts/RobotMeshController";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";

const MESH_PREFAB: ObjectPrefab = requireAsset(
  "../../Prefabs/AgentMesh.prefab",
) as ObjectPrefab;

// --- Layout ---
const NOTIF_W = 24;
const NOTIF_H = 6.5;
const ICON_AREA_W = NOTIF_H; // square icon section (width == height)
const ICON_CENTER_X = -NOTIF_W / 2 + ICON_AREA_W / 2;

const TEXT_PAD = 0.6;
const TEXT_AREA_LEFT = -NOTIF_W / 2 + ICON_AREA_W + TEXT_PAD;
const TEXT_AREA_RIGHT = NOTIF_W / 2 - TEXT_PAD;
const TEXT_AREA_W = TEXT_AREA_RIGHT - TEXT_AREA_LEFT;
const TEXT_CENTER_X = (TEXT_AREA_LEFT + TEXT_AREA_RIGHT) / 2;
const LINE_HALF_H = 0.9;

const Z_CONTENT = 1.0;
const BODY_MAX_CHARS = 60;
const NOTIF_MESH_SCALE = ICON_AREA_W * 0.35 * 1.5;
const MESH_TILT_RAD = MathUtils.DegToRad * 30;

// --- Head-lock positioning ---
// Bottom ~1/4 of FOV: forward + downward tilt in camera space
const NOTIF_DISTANCE = 85; // cm
const NOTIF_DOWN_OFFSET = 14; // cm below camera forward axis

// --- Timing ---
const SHRINK_DELAY_MS = 8000;
const SHRINK_DURATION_S = 0.4;
const SHRINK_DISMISS_DELAY_MS = 2000;
const SHOW_DURATION_S = 0.35;
const DISMISS_DURATION_S = 0.35 * 0.6;
const SLIDE_IN_OFFSET = 8; // cm below target at start of show animation
const DISMISS_SLIDE_DIST = 25; // cm to slide down during dismiss
const MIN_SCALE = 0.001;
const CAM_FORWARD = new vec3(0, 0, -1);
const CAM_DOWN = new vec3(0, -1, 0);

@component
export class AgentResponseNotification extends BaseScriptComponent {
  private button: RectangleButton;
  private iconHolder: SceneObject;
  private robotController: RobotMeshController;
  private titleObj: SceneObject;
  private bodyObj: SceneObject;

  private cancels = new CancelSet();
  private shrinkCancels = new CancelSet();
  private dismissCancels = new CancelSet();

  private isDestroyed = false;
  private slideOffset = 0; // camera-space vertical offset in cm (positive = down)
  private cameraTransform: Transform;
  private readonly _scratchWorldPos = new vec3(0, 0, 0);

  public readonly onTapped = new Event<void>();
  public readonly onDismissed = new Event<void>();

  onAwake(): void {
    this.cameraTransform = WorldCameraFinderProvider.getInstance().getTransform();
    const root = this.getSceneObject();
    root
      .getTransform()
      .setLocalScale(new vec3(MIN_SCALE, MIN_SCALE, MIN_SCALE));
    root.enabled = false;

    // Billboard: face camera on both X (pitch) and Y (yaw) axes.
    // xAxisEnabled must be deferred — Billboard.controller is set in Billboard's
    // own onAwake, which is deferred when createComponent is called inside another
    // component's onAwake. yAxisEnabled defaults to true so no setter call needed.
    const billboard = root.createComponent(
      Billboard.getTypeName(),
    ) as Billboard;
    setTimeout(() => {
      billboard.xAxisEnabled = true;
    }, 0);

    // Click button covering full notification
    const btnObj = global.scene.createSceneObject("NotifBtn");
    btnObj.setParent(root);
    this.button = btnObj.createComponent(
      RectangleButton.getTypeName(),
    ) as RectangleButton;
    this.button.size = new vec3(NOTIF_W, NOTIF_H, 0.5);
    this.button.initialize();
    this.button.onTriggerUp.add(() => {
      if (!this.isDestroyed) {
        this.onTapped.invoke();
        this.dismiss();
      }
    });

    // Robot icon (mesh robot, matching the agent's theme)
    this.iconHolder = global.scene.createSceneObject("NotifIcon");
    this.iconHolder.setParent(btnObj);
    this.iconHolder
      .getTransform()
      .setLocalPosition(new vec3(ICON_CENTER_X, 0, Z_CONTENT));
    this.iconHolder
      .getTransform()
      .setLocalRotation(quat.fromEulerAngles(MESH_TILT_RAD, 0, 0));
    const meshObj = MESH_PREFAB.instantiate(this.iconHolder);
    meshObj.name = "NotifMesh";
    meshObj.getTransform().setLocalScale(vec3.one().uniformScale(NOTIF_MESH_SCALE));
    this.robotController = meshObj.getComponent(
      RobotMeshController.getTypeName(),
    ) as RobotMeshController;
    this.robotController.setBaseScale(vec3.one().uniformScale(NOTIF_MESH_SCALE));

    // Title text (upper line)
    const titleText = createText({
      parent: btnObj,
      name: "NotifTitle",
      text: "",
      size: TextSize.M,
      font: TextFont.SemiBold,
      color: new vec4(1, 1, 1, 1),
      position: new vec3(TEXT_CENTER_X, LINE_HALF_H, Z_CONTENT),
      horizontalAlignment: HorizontalAlignment.Left,
      horizontalOverflow: HorizontalOverflow.Truncate,
      worldSpaceRect: Rect.create(-TEXT_AREA_W / 2, TEXT_AREA_W / 2, -LINE_HALF_H, LINE_HALF_H),
    });
    this.titleObj = titleText.getSceneObject();

    // Body text (lower line)
    const bodyText = createText({
      parent: btnObj,
      name: "NotifBody",
      text: "",
      size: TextSize.S,
      color: new vec4(0.78, 0.78, 0.78, 1),
      position: new vec3(TEXT_CENTER_X, -LINE_HALF_H, Z_CONTENT),
      horizontalAlignment: HorizontalAlignment.Left,
      horizontalOverflow: HorizontalOverflow.Truncate,
      worldSpaceRect: Rect.create(-TEXT_AREA_W / 2, TEXT_AREA_W / 2, -LINE_HALF_H, LINE_HALF_H),
    });
    this.bodyObj = bodyText.getSceneObject();
    this.button.renderOrder = 3;
    titleText.renderOrder = 4;
    bodyText.renderOrder = 4;
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  setOverlayLayer(layer: LayerSet): void {
    const root = this.getSceneObject();
    const setRecursive = (obj: SceneObject): void => {
      obj.layer = layer;
      for (let i = 0; i < obj.getChildrenCount(); i++) {
        setRecursive(obj.getChild(i));
      }
    };
    setRecursive(root);
  }

  show(topicTitle: string, responseBody: string, theme?: RobotTheme, robotState?: RobotState): void {
    if (this.isDestroyed) return;

    if (theme) {
      this.robotController.setTheme(theme);
    }
    if (robotState) {
      this.robotController.setRobotState(robotState);
    }

    const titleText = this.titleObj.getComponent("Text") as Text;
    titleText.text = topicTitle;

    const truncated =
      responseBody.length > BODY_MAX_CHARS
        ? responseBody.substring(0, BODY_MAX_CHARS) + "…"
        : responseBody;
    const bodyText = this.bodyObj.getComponent("Text") as Text;
    bodyText.text = truncated;

    const root = this.getSceneObject();
    this.slideOffset = SLIDE_IN_OFFSET;
    this.positionNotification();
    root.enabled = true;

    const startScale = new vec3(MIN_SCALE, MIN_SCALE, MIN_SCALE);

    animate({
      duration: SHOW_DURATION_S,
      easing: "ease-out-back",
      cancelSet: this.cancels,
      update: (t: number) => {
        root.getTransform().setLocalScale(vec3.lerp(startScale, vec3.one(), t));
        this.slideOffset = MathUtils.lerp(SLIDE_IN_OFFSET, 0, t);
      },
      ended: () => {
        root.getTransform().setLocalScale(vec3.one());
        this.slideOffset = 0;
        setTimeout(() => {
          if (!this.isDestroyed) {
            this.shrinkToIcon();
          }
        }, SHRINK_DELAY_MS);
      },
    });
  }

  private shrinkToIcon(): void {
    this.titleObj.enabled = false;
    this.bodyObj.enabled = false;

    const startW = NOTIF_W;
    const endW = ICON_AREA_W;

    animate({
      duration: SHRINK_DURATION_S,
      easing: "ease-out-cubic",
      cancelSet: this.shrinkCancels,
      update: (t: number) => {
        const w = MathUtils.lerp(startW, endW, t);
        this.button.size = new vec3(w, NOTIF_H, 0.5);
        const iconX = MathUtils.lerp(ICON_CENTER_X, 0, t);
        this.iconHolder
          .getTransform()
          .setLocalPosition(new vec3(iconX, 0, Z_CONTENT));
      },
      ended: () => {
        this.button.size = new vec3(endW, NOTIF_H, 0.5);
        this.iconHolder
          .getTransform()
          .setLocalPosition(new vec3(0, 0, Z_CONTENT));
        setTimeout(() => {
          if (!this.isDestroyed) {
            this.startDismiss();
          }
        }, SHRINK_DISMISS_DELAY_MS);
      },
    });
  }

  dismiss(): void {
    if (this.isDestroyed) return;
    this.cancels.cancel();
    this.shrinkCancels.cancel();
    this.titleObj.enabled = false;
    this.bodyObj.enabled = false;
    this.startDismiss();
  }

  private startDismiss(): void {
    if (this.isDestroyed) return;

    const root = this.getSceneObject();
    const startScale = root.getTransform().getLocalScale();
    const endScale = new vec3(MIN_SCALE, MIN_SCALE, MIN_SCALE);
    const startSlide = this.slideOffset;

    animate({
      duration: DISMISS_DURATION_S,
      easing: "ease-in-cubic",
      cancelSet: this.dismissCancels,
      update: (t: number) => {
        root.getTransform().setLocalScale(vec3.lerp(startScale, endScale, t));
        this.slideOffset = MathUtils.lerp(
          startSlide,
          startSlide + DISMISS_SLIDE_DIST,
          t,
        );
      },
      ended: () => {
        this.destroySelf();
      },
    });
  }

  private onUpdate(): void {
    if (this.isDestroyed) return;
    if (this.getSceneObject().enabled) {
      this.positionNotification();
    }
  }

  private positionNotification(): void {
    const camPos = this.cameraTransform.getWorldPosition();
    const camRot = this.cameraTransform.getWorldRotation();

    const forward = camRot.multiplyVec3(CAM_FORWARD);
    const down = camRot.multiplyVec3(CAM_DOWN);

    const totalDown = NOTIF_DOWN_OFFSET + this.slideOffset;
    this._scratchWorldPos.x = camPos.x + forward.x * NOTIF_DISTANCE + down.x * totalDown;
    this._scratchWorldPos.y = camPos.y + forward.y * NOTIF_DISTANCE + down.y * totalDown;
    this._scratchWorldPos.z = camPos.z + forward.z * NOTIF_DISTANCE + down.z * totalDown;

    this.getSceneObject().getTransform().setWorldPosition(this._scratchWorldPos);
  }

  private destroySelf(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.cancels.cancel();
    this.shrinkCancels.cancel();
    this.dismissCancels.cancel();
    this.onDismissed.invoke();
    this.getSceneObject().destroy();
  }
}
