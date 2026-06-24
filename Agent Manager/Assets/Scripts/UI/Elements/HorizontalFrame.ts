import { Frame } from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame";
import { RoundButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton";
import { Tooltip } from "SpectaclesUIKit.lspkg/Scripts/Tooltip";
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";
import { createImage } from "../Shared/ImageFactory";
import {
  ICON_Z_OFFSET,
  CLOSE_TEXTURE,
  CONTENT_TILT_DEG,
} from "../Shared/UIConstants";
import { createTooltip } from "../Shared/UIBuilders";

// Grab-collider depth around the (nearly flat) frame plate. Keep this thin:
// the plate's InteractableManipulation wins any ray hit inside this slab, so a
// thick value swallows taps/drags meant for content floating just in front of
// the plate (input bar at FRAME_INTERSECT_Z=4, lower rows of scroll lists) and
// turns them into whole-panel drags.
const COLLIDER_Z_THICKNESS = 2;

const PLATE_TILT_RAD = CONTENT_TILT_DEG * (Math.PI / 180);

const CLOSE_BUTTON_WIDTH = 2;
const CLOSE_BUTTON_Z = CLOSE_BUTTON_WIDTH / 2 + 1;
const CLOSE_BUTTON_MARGIN = 0.5;

type ManagedEntry = {
  obj: SceneObject;
  setAlpha: (alpha: number) => void;
  suppressed: boolean;
};

@component
export class HorizontalFrame extends BaseScriptComponent {
  private frame: Frame;
  private _contentRoot: SceneObject;
  private _frameInitialized = false;
  private _pendingInnerSize: vec2 | null = null;
  private _showCloseButton = true;
  private _useBillboarding = false;
  private lastPosition: vec3 | null = null;
  private _yawRotation = quat.quatIdentity();
  private _managedEntries: ManagedEntry[] = [];
  private lastManagedAlpha = Infinity;
  private _frameHoverDirect = false;
  private _forceShow = false;
  private triggerStartPos: vec3 | null = null;
  private cameraTransform: Transform;
  private billboardCancels = new CancelSet();
  private readonly _scratchFlatDir = new vec3(0, 0, 0);

  public readonly onCloseRequested = new Event<void>();
  public readonly onRepositioned = new Event<void>();
  public readonly onFrameHoverEnter = new Event<void>();
  public readonly onFrameHoverExit = new Event<void>();

  get yawRotation(): quat {
    return this._yawRotation;
  }

  get showCloseButton(): boolean {
    return this._showCloseButton;
  }

  set showCloseButton(value: boolean) {
    this._showCloseButton = value;
  }

  get content(): SceneObject {
    return this._contentRoot;
  }

  get innerSize(): vec2 {
    return this._pendingInnerSize ?? this.frame.innerSize;
  }

  set innerSize(size: vec2) {
    // The underlying Frame applies size via scaleFrame(), which is only valid
    // once it has initialized. Buffer until onInitialized if needed.
    if (!this._frameInitialized) {
      this._pendingInnerSize = size;
      return;
    }
    this.frame.innerSize = size;
    this.inflateColliderZ();
  }

  get allowScaling(): boolean {
    return this.frame.allowScaling;
  }

  set allowScaling(value: boolean) {
    this.frame.allowScaling = value;
  }

  onAwake(): void {
    this.cameraTransform =
      WorldCameraFinderProvider.getInstance().getTransform();
    const root = this.getSceneObject();

    this.frame = root.createComponent(Frame.getTypeName()) as Frame;
    this.frame.autoShowHide = false;
    this.frame.allowScaling = false;
    this.frame.autoScaleContent = false;

    const frameRecord = this.frame as unknown as Record<string, boolean>;
    frameRecord["useBillboarding"] = false;
    // The Frame's auto-created InteractionPlane lies in the plate's plane —
    // pitched CONTENT_TILT_DEG (-75°), nearly horizontal. SIK projects the
    // far-field cursor onto that plane during drags over the panel, so scroll
    // drags read as depth (z) motion. The plane only aids the frame's own
    // buttons (hidden here), so disable it; vertical content keeps its own
    // correctly-oriented planes (BackPlates etc.).
    frameRecord["_enableInteractionPlane"] = false;

    // The Frame creates its `content` SceneObject lazily on its OnStartEvent,
    // so frame.content is null until then. To give consumers a stable parent
    // synchronously, create our own content container now as a child of the
    // frame's SceneObject. Frame.initializeContent() sweeps existing children
    // into frame.content on init (and we reparent explicitly below as a
    // safeguard), so this ends up nested under frame.content with an identity
    // local transform — matching the previous behavior of parenting directly
    // to frame.content.
    this._contentRoot = global.scene.createSceneObject("HorizontalFrameContent");
    this._contentRoot.setParent(root);

    // Frame now self-initializes on its OnStartEvent; access members that
    // depend on initialization (buttons, hover behavior, collider, content)
    // via onInitialized. It is a ReplayEvent, so this fires immediately if
    // the frame is already initialized, or once init completes otherwise.
    this.frame.onInitialized.add(() => {
      this._frameInitialized = true;

      // Ensure our content container lives under the frame's content with an
      // identity local transform, whether or not the frame's child-sweep
      // already moved it.
      if (this._contentRoot.getParent() !== this.frame.content) {
        this._contentRoot.setParent(this.frame.content);
      }
      const contentT = this._contentRoot.getTransform();
      contentT.setLocalPosition(new vec3(0, 0, 0));
      contentT.setLocalRotation(quat.quatIdentity());
      contentT.setLocalScale(new vec3(1, 1, 1));

      if (this._pendingInnerSize !== null) {
        this.frame.innerSize = this._pendingInnerSize;
        this._pendingInnerSize = null;
      }

      this.frame.showCloseButton = false;
      this.frame.showFollowButton = false;
      this.frame.hideVisual();

      this.frame.hoverBehavior.onHoverStart.add((e: any) => {
        if (!this._forceShow && e?.target?.sceneObject === root) {
          this._frameHoverDirect = true;
          this.frame.showVisual();
        }
      });
      this.frame.hoverBehavior.onHoverUpdate.add((e: any) => {
        if (this._forceShow) return;
        const isDirect = e?.target?.sceneObject === root;
        if (isDirect && !this._frameHoverDirect) {
          this._frameHoverDirect = true;
          this.frame.showVisual();
        } else if (!isDirect && this._frameHoverDirect) {
          this._frameHoverDirect = false;
          this.frame.hideVisual();
        }
      });
      this.frame.hoverBehavior.onHoverEnd.add(() => {
        this._frameHoverDirect = false;
        if (!this._forceShow) {
          this.frame.hideVisual();
        }
      });

      this.inflateColliderZ();
      if (this._showCloseButton) {
        this.initializeCloseButton();
      }
    });

    this.createEvent("UpdateEvent").bind(() => {
      this.onUpdate();
      this.updateManagedAlpha();
    });

    const interactable = this.getSceneObject().getComponent(
      Interactable.getTypeName(),
    ) as Interactable;
    interactable.onTriggerStart.add(() => {
      this.triggerStartPos = this.getSceneObject()
        .getTransform()
        .getWorldPosition();
    });
    interactable.onTriggerEnd.add(() => {
      const endPos = this.getSceneObject().getTransform().getWorldPosition();
      if (
        this.triggerStartPos &&
        endPos.sub(this.triggerStartPos).length > 0.001
      ) {
        this.onRepositioned.invoke();
      }
      this.triggerStartPos = null;
    });

    interactable.onHoverEnter.add(() => this.onFrameHoverEnter.invoke());
    interactable.onHoverExit.add(() => this.onFrameHoverExit.invoke());
  }

  recalculateRotation(transform?: Transform): void {
    const t = transform ?? this.getSceneObject().getTransform();
    const currentPos = t.getWorldPosition();
    this.lastPosition = currentPos;

    const camPos = this.cameraTransform.getWorldPosition();
    const dir = camPos.sub(currentPos);
    this._scratchFlatDir.x = dir.x;
    this._scratchFlatDir.y = 0;
    this._scratchFlatDir.z = dir.z;
    if (this._scratchFlatDir.length > 0.001) {
      this._yawRotation = quat.lookAt(
        this._scratchFlatDir.normalize(),
        vec3.up(),
      );
      const tiltRot = quat.fromEulerAngles(PLATE_TILT_RAD, 0, 0);
      t.setWorldRotation(this._yawRotation.multiply(tiltRot));
    }
  }

  lerpToCamera(duration: number = 0.3): void {
    const t = this.getSceneObject().getTransform();
    const currentPos = t.getWorldPosition();
    this.lastPosition = currentPos;

    const camPos = this.cameraTransform.getWorldPosition();
    const dir = camPos.sub(currentPos);
    this._scratchFlatDir.x = dir.x;
    this._scratchFlatDir.y = 0;
    this._scratchFlatDir.z = dir.z;
    if (this._scratchFlatDir.length <= 0.001) return;

    this._yawRotation = quat.lookAt(
      this._scratchFlatDir.normalize(),
      vec3.up(),
    );
    const tiltRot = quat.fromEulerAngles(PLATE_TILT_RAD, 0, 0);
    const targetRot = this._yawRotation.multiply(tiltRot);
    const startRot = t.getWorldRotation();

    this.billboardCancels.cancel();
    animate({
      duration,
      easing: "ease-out-cubic",
      cancelSet: this.billboardCancels,
      update: (p: number) => {
        t.setWorldRotation(quat.slerp(startRot, targetRot, p));
      },
    });
  }

  private onUpdate(): void {
    const transform = this.getSceneObject().getTransform();
    const currentPos = transform.getWorldPosition();

    if (this.lastPosition && currentPos.sub(this.lastPosition).length < 0.001) {
      return;
    }

    this.recalculateRotation(transform);
  }

  registerManagedObject(
    obj: SceneObject,
    setAlpha: (alpha: number) => void,
  ): void {
    this._managedEntries.push({ obj, setAlpha, suppressed: false });
    const alpha = this.frame.opacity;
    setAlpha(alpha);
    obj.enabled = alpha > 0;
  }

  suppressManagedObject(obj: SceneObject): void {
    for (const entry of this._managedEntries) {
      if (entry.obj === obj) {
        entry.suppressed = true;
        entry.setAlpha(0);
        entry.obj.enabled = false;
        break;
      }
    }
  }

  unsuppressManagedObject(obj: SceneObject): void {
    for (const entry of this._managedEntries) {
      if (entry.obj === obj) {
        entry.suppressed = false;
        const alpha = this.frame.opacity;
        entry.setAlpha(alpha);
        entry.obj.enabled = alpha > 0;
        this.lastManagedAlpha = Infinity;
        break;
      }
    }
  }

  private updateManagedAlpha(): void {
    if (this._managedEntries.length === 0) return;
    const alpha = this.frame.opacity;
    if (Math.abs(alpha - this.lastManagedAlpha) < 0.001) return;
    this.lastManagedAlpha = alpha;
    for (const entry of this._managedEntries) {
      if (entry.suppressed) continue;
      if (alpha > 0) {
        entry.obj.enabled = true;
        entry.setAlpha(alpha);
      } else if (entry.obj.enabled) {
        entry.setAlpha(0);
        entry.obj.enabled = false;
      }
    }
  }

  setForceShow(force: boolean): void {
    this._forceShow = force;
    if (force) {
      this.frame.showVisual();
    } else {
      this.frame.hideVisual();
    }
  }

  private inflateColliderZ(): void {
    const collider = this.frame.collider;
    const shape = collider.shape as BoxShape;
    const size = shape.size;
    shape.size = new vec3(size.x, size.y, COLLIDER_Z_THICKNESS);
    collider.shape = shape;
    //collider.debugDrawEnabled = true;
  }

  private initializeCloseButton(): void {
    const closeObj = global.scene.createSceneObject("CloseButton");
    closeObj.setParent(this.frame.content);

    const halfW = this.frame.innerSize.x / 2;
    const halfH = this.frame.innerSize.y / 2;
    const framePosX = -halfW + CLOSE_BUTTON_WIDTH / 2 + CLOSE_BUTTON_MARGIN;
    const framePosY = -halfH - CLOSE_BUTTON_WIDTH / 2 - CLOSE_BUTTON_MARGIN;
    const framePosZ = CLOSE_BUTTON_Z;
    const contentInvRot = this.frame.content
      .getTransform()
      .getLocalRotation()
      .invert();
    const localPos = contentInvRot.multiplyVec3(
      new vec3(framePosX, framePosY, framePosZ),
    );
    closeObj.getTransform().setLocalPosition(localPos);
    const btn = closeObj.createComponent(
      RoundButton.getTypeName(),
    ) as RoundButton;
    btn.width = CLOSE_BUTTON_WIDTH;
    btn.initialize();

    const iconSize = CLOSE_BUTTON_WIDTH / 2;
    createImage(CLOSE_TEXTURE, {
      parent: closeObj,
      name: "CloseIcon",
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: iconSize,
    });

    const closeTooltip = createTooltip(closeObj, "Close", {
      hoverSource: btn,
    });

    btn.onTriggerUp.add(() => this.onCloseRequested.invoke());
  }
}
