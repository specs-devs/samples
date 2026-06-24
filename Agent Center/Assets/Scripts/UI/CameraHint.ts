import {
  InteractionHintController,
  HandMode,
  HandAnimationsLibrary,
} from "Spectacles3DHandHints.lspkg/Scripts/InteractionHintController";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";
import { DropShadow } from "SpectaclesUIKit.lspkg/Scripts/DropShadow";
import { TextSize, TextFont } from "./Shared/TextSizes";
import { createText } from "./Shared/UIBuilders";

const HAND_HINTS_PREFAB: ObjectPrefab = requireAsset(
  "Spectacles3DHandHints.lspkg/Spectacles3DHandHints__PLACE_IN_SCENE.prefab",
) as ObjectPrefab;

const HEADLOCK_DISTANCE = 65;
const Z_TILT_DEG = 25;
const HINT_SCALE = 0.5;
const EASING = 0.2;
const TEXT_FADE_DURATION = 0.5;
const HINT_TEXT = "Pinch and drag your fingers\napart to take a picture";
const TEXT_Y_OFFSET = -8;
const SHADOW_SIZE = new vec2(30, 25);
const SHADOW_CORNER_RADIUS = 4;
const SHADOW_Z_OFFSET = -5;
const SHADOW_COLOR = new vec4(0, 0, 0, 0.4);
const Z_HINT = 5;
export class CameraHint {
  private root: SceneObject | null = null;
  private hintObj: SceneObject | null = null;
  private textObj: SceneObject | null = null;
  private shadowObj: SceneObject | null = null;
  private hintController: InteractionHintController | null = null;
  private updateEvent: SceneEvent | null = null;
  private animCancels = new CancelSet();
  private currentRot: quat = quat.quatIdentity();
  private isShowing = false;

  show(parent: SceneObject): void {
    if (this.isShowing) return;
    this.isShowing = true;

    this.root = global.scene.createSceneObject("CameraHintRoot");
    this.root.setParent(parent);
    this.snapToCamera();

    this.hintObj = HAND_HINTS_PREFAB.instantiate(this.root);
    const hintTrans = this.hintObj.getTransform();
    hintTrans.setLocalRotation(
      quat.fromEulerAngles(0, 0, MathUtils.DegToRad * Z_TILT_DEG),
    );
    hintTrans.setLocalScale(new vec3(HINT_SCALE, HINT_SCALE, HINT_SCALE));
    hintTrans.setLocalPosition(new vec3(0, 0, Z_HINT));

    this.disableChild(this.hintObj, "GUIDE_ReadAndDisable");

    this.hintController = this.hintObj.getComponent(
      InteractionHintController.getTypeName(),
    ) as InteractionHintController;

    const animPlayer = this.hintController.handHints.getComponent(
      "AnimationPlayer",
    ) as AnimationPlayer;
    if (this.hintController.animationPlayerClipEndEvent) {
      animPlayer.onEvent.remove(
        this.hintController.animationPlayerClipEndEvent,
      );
    }

    this.hintController.playHintAnimation(
      HandMode.Both,
      HandAnimationsLibrary.Both.TwoHandsPinchScale,
      200,
      0.35,
    );

    this.buildHintText();
    this.createShadow();

    this.hintController.animationEndEvent.bind(() => {
      this.fadeOutAndDestroy();
    });

    this.updateEvent = this.hintController.createEvent("UpdateEvent");
    this.updateEvent.bind(() => this.updateHeadlock());
  }

  hide(): void {
    if (!this.isShowing) return;
    this.isShowing = false;
    this.animCancels.cancel();
    this.cleanup();
  }

  private snapToCamera(): void {
    const camTrans = WorldCameraFinderProvider.getInstance().getTransform();
    const camPos = camTrans.getWorldPosition();
    const camFwd = camTrans.forward;
    const pos = camPos.add(camFwd.uniformScale(-HEADLOCK_DISTANCE));
    this.root.getTransform().setWorldPosition(pos);

    const dir = camPos.sub(pos);
    if (dir.length > 0.001) {
      this.currentRot = quat.lookAt(dir.normalize(), vec3.up());
      this.root.getTransform().setWorldRotation(this.currentRot);
    }
  }

  private updateHeadlock(): void {
    if (!this.root) return;

    const camTrans = WorldCameraFinderProvider.getInstance().getTransform();
    const camPos = camTrans.getWorldPosition();
    const camFwd = camTrans.forward;

    const targetPos = camPos.add(camFwd.uniformScale(-HEADLOCK_DISTANCE));
    this.root.getTransform().setWorldPosition(targetPos);

    const dir = camPos.sub(targetPos);
    if (dir.length > 0.001) {
      const targetRot = quat.lookAt(dir.normalize(), vec3.up());
      this.currentRot = quat.slerp(this.currentRot, targetRot, EASING);
      this.root.getTransform().setWorldRotation(this.currentRot);
    }
  }

  private buildHintText(): void {
    const hintText = createText({
      parent: this.root,
      name: "HintText",
      text: HINT_TEXT,
      size: TextSize.M,
      font: TextFont.Medium,
      color: new vec4(1, 1, 1, 1),
      position: new vec3(0, TEXT_Y_OFFSET, 0),
      horizontalAlignment: HorizontalAlignment.Center,
      verticalAlignment: VerticalAlignment.Center,
    });
    this.textObj = hintText.getSceneObject();
  }

  private createShadow(): void {
    this.shadowObj = global.scene.createSceneObject("HintShadow");
    this.shadowObj.setParent(this.root);
    this.shadowObj
      .getTransform()
      .setLocalPosition(new vec3(0, 0, SHADOW_Z_OFFSET));
    const shadow = this.shadowObj.createComponent(
      DropShadow.getTypeName(),
    ) as DropShadow;
    shadow.size = SHADOW_SIZE;
    shadow.cornerRadius = SHADOW_CORNER_RADIUS;
    shadow.color = SHADOW_COLOR;
    shadow.spread = 0.6;
  }

  private fadeOutAndDestroy(): void {
    if (!this.textObj) {
      this.cleanup();
      return;
    }

    const textComp = this.textObj.getComponent("Text") as Text;
    if (!textComp) {
      this.cleanup();
      return;
    }

    animate({
      duration: TEXT_FADE_DURATION,
      easing: "ease-out-quad",
      cancelSet: this.animCancels,
      update: (t: number) => {
        textComp.textFill.color = new vec4(1, 1, 1, 1 - t);
      },
      ended: () => {
        this.cleanup();
      },
    });
  }

  private disableChild(parent: SceneObject, name: string): void {
    for (let i = 0; i < parent.getChildrenCount(); i++) {
      const child = parent.getChild(i);
      if (child.name === name) {
        child.enabled = false;
        return;
      }
      this.disableChild(child, name);
    }
  }

  private cleanup(): void {
    this.isShowing = false;
    if (this.updateEvent) {
      this.updateEvent.enabled = false;
      this.updateEvent = null;
    }
    if (this.root) {
      this.root.destroy();
      this.root = null;
    }
    this.hintObj = null;
    this.textObj = null;
    this.shadowObj = null;
    this.hintController = null;
  }
}
