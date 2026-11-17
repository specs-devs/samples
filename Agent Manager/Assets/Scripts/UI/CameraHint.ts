import WorldCameraFinderProvider from "InteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import animate, { CancelSet } from "./Shared/MotionAnimate";
import { DropShadow } from "UIKit.lspkg/Scripts/DropShadow";
import { createText } from "./Shared/UIBuilders";
import { TextStyle } from "./Shared/UIStyle";

const HEADLOCK_DISTANCE = 65;
const HEADLOCK_EASING = 0.2;
const TEXT_Y_OFFSET = -6;
const HINT_TEXT = "Pinch with both hands and drag\napart to take a picture";
const FADE_IN_DURATION = 0.35;
const FADE_OUT_DURATION = 0.5;
const VISIBLE_SECONDS = 6;
const SHADOW_SIZE = new vec2(26, 7);
const SHADOW_CORNER_RADIUS = 3.5;
const SHADOW_Z_OFFSET = -1;
const SHADOW_COLOR = new vec4(0, 0, 0, 1);
const SHADOW_OPACITY = 0.45;

/**
 * Head-locked text hint shown when the camera is toggled on. Fades in, stays
 * for a few seconds (or until a capture starts / the camera is toggled off),
 * then fades out and destroys itself.
 */
export class CameraHint {
  private root: SceneObject | null = null;
  private text: Text | null = null;
  private shadow: DropShadow | null = null;
  private updateEvent: SceneEvent | null = null;
  private hideTimer: DelayedCallbackEvent | null = null;
  private animCancels = new CancelSet();
  private currentRot: quat = quat.quatIdentity();
  private isShowing = false;

  show(parent: SceneObject): void {
    if (this.isShowing) return;
    this.isShowing = true;

    this.root = global.scene.createSceneObject("CameraHintRoot");
    this.root.setParent(parent);
    this.snapToCamera();

    this.text = createText({
      parent: this.root,
      name: "HintText",
      text: HINT_TEXT,
      style: TextStyle.Label,
      color: new vec4(1, 1, 1, 0),
      position: new vec3(0, TEXT_Y_OFFSET, 0),
      horizontalAlignment: HorizontalAlignment.Center,
      verticalAlignment: VerticalAlignment.Center,
    });

    const shadowObj = global.scene.createSceneObject("HintShadow");
    shadowObj.setParent(this.root);
    shadowObj
      .getTransform()
      .setLocalPosition(new vec3(0, TEXT_Y_OFFSET, SHADOW_Z_OFFSET));
    this.shadow = shadowObj.createComponent(
      DropShadow.getTypeName(),
    ) as DropShadow;
    this.shadow.size = SHADOW_SIZE;
    this.shadow.cornerRadius = SHADOW_CORNER_RADIUS;
    this.shadow.color = SHADOW_COLOR;
    this.shadow.spread = 0.6;
    this.setAlpha(0);

    // Host the per-frame and timer events on a bare script on the root (not
    // the shadow, which gets disabled while invisible) so they die with it.
    const host = this.root.createComponent(
      "Component.ScriptComponent",
    ) as ScriptComponent;
    this.updateEvent = host.createEvent("UpdateEvent");
    this.updateEvent.bind(() => this.updateHeadlock());

    this.hideTimer = host.createEvent("DelayedCallbackEvent");
    this.hideTimer.bind(() => this.fadeOut());
    this.hideTimer.reset(VISIBLE_SECONDS);

    animate({
      duration: FADE_IN_DURATION,
      easing: "ease-out-quad",
      cancelSet: this.animCancels,
      update: (t: number) => this.setAlpha(t),
    });
  }

  hide(): void {
    if (!this.isShowing && !this.root) return;
    this.cleanup();
  }

  private setAlpha(alpha: number): void {
    if (this.text && !isNull(this.text)) {
      this.text.textFill.color = new vec4(1, 1, 1, alpha);
    }
    if (this.shadow && !isNull(this.shadow)) {
      // The shadow material doesn't reliably honor opacityFactor, so fade the
      // color alpha too, and switch it off entirely once invisible.
      const a = SHADOW_OPACITY * alpha;
      this.shadow.opacity = a;
      this.shadow.color = new vec4(SHADOW_COLOR.x, SHADOW_COLOR.y, SHADOW_COLOR.z, a);
      this.shadow.getSceneObject().enabled = alpha > 0.01;
    }
  }

  private fadeOut(): void {
    if (!this.isShowing) return;
    this.animCancels.cancel();
    animate({
      duration: FADE_OUT_DURATION,
      easing: "ease-in-quad",
      cancelSet: this.animCancels,
      update: (t: number) => this.setAlpha(1 - t),
      ended: () => this.cleanup(),
    });
  }

  private snapToCamera(): void {
    const camTrans = WorldCameraFinderProvider.getInstance().getTransform();
    const camPos = camTrans.getWorldPosition();
    const pos = camPos.add(camTrans.forward.uniformScale(-HEADLOCK_DISTANCE));
    this.root.getTransform().setWorldPosition(pos);

    const dir = camPos.sub(pos);
    if (dir.length > 0.001) {
      this.currentRot = quat.lookAt(dir.normalize(), vec3.up());
      this.root.getTransform().setWorldRotation(this.currentRot);
    }
  }

  private updateHeadlock(): void {
    if (!this.root || isNull(this.root)) return;
    const camTrans = WorldCameraFinderProvider.getInstance().getTransform();
    const camPos = camTrans.getWorldPosition();
    const targetPos = camPos.add(
      camTrans.forward.uniformScale(-HEADLOCK_DISTANCE),
    );
    this.root.getTransform().setWorldPosition(targetPos);

    const dir = camPos.sub(targetPos);
    if (dir.length > 0.001) {
      const targetRot = quat.lookAt(dir.normalize(), vec3.up());
      this.currentRot = quat.slerp(this.currentRot, targetRot, HEADLOCK_EASING);
      this.root.getTransform().setWorldRotation(this.currentRot);
    }
  }

  private cleanup(): void {
    this.isShowing = false;
    this.animCancels.cancel();
    if (this.updateEvent) {
      this.updateEvent.enabled = false;
      this.updateEvent = null;
    }
    if (this.hideTimer) {
      this.hideTimer.enabled = false;
      this.hideTimer = null;
    }
    if (this.root && !isNull(this.root)) this.root.destroy();
    this.root = null;
    this.text = null;
    this.shadow = null;
  }
}
