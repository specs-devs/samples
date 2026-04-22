import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { RectCorners, RectPose } from "../Core/GestureRectUtils";

@component
export class CornerController extends BaseScriptComponent {
  public topLeftObj: SceneObject;
  public topRightObj: SceneObject;
  public bottomLeftObj: SceneObject;
  public bottomRightObj: SceneObject;

  private topLeftTrans: Transform;
  private topRightTrans: Transform;
  private bottomLeftTrans: Transform;
  private bottomRightTrans: Transform;

  public readonly onCornersChanged = new Event();

  public initializeTransforms() {
    this.topLeftTrans = this.topLeftObj.getTransform();
    this.topRightTrans = this.topRightObj.getTransform();
    this.bottomLeftTrans = this.bottomLeftObj.getTransform();
    this.bottomRightTrans = this.bottomRightObj.getTransform();
  }

  /**
   * Preferred initialization: CornerController instantiates and manages corner objects
   */
  createDebugCorners(size: number) {
    // Default square formation (can be adjusted by gestures)
    const center = vec3.zero();
    this.topLeftTrans.setLocalPosition(
      center.add(new vec3(-size / 2, size / 2, 0)),
    );
    this.topRightTrans.setLocalPosition(
      center.add(new vec3(size / 2, size / 2, 0)),
    );
    this.bottomRightTrans.setLocalPosition(
      center.add(new vec3(size / 2, -size / 2, 0)),
    );
    this.bottomLeftTrans.setLocalPosition(
      center.add(new vec3(-size / 2, -size / 2, 0)),
    );
  }

  public applyCorners(c: RectCorners) {
    this.topLeftTrans.setWorldPosition(c.topLeft);
    this.topRightTrans.setWorldPosition(c.topRight);
    this.bottomLeftTrans.setWorldPosition(c.bottomLeft);
    this.bottomRightTrans.setWorldPosition(c.bottomRight);
    this.onCornersChanged.invoke();
  }

  public applyPose(p: RectPose) {
    // Derive basis from rotation and apply half-extents from scale to set corners
    // Fallback-safe: if rotation application isn't available, skip.
    try {
      const right = p.rotation.multiplyVec3
        ? p.rotation.multiplyVec3(vec3.right())
        : vec3.right();
      const up = p.rotation.multiplyVec3
        ? p.rotation.multiplyVec3(vec3.up())
        : vec3.up();
      const halfRight = right.normalize().uniformScale(p.scale.x * 0.5);
      const halfUp = up.normalize().uniformScale(p.scale.y * 0.5);

      const topLeft = p.center.add(halfUp).add(halfRight.uniformScale(-1));
      const topRight = p.center.add(halfUp).add(halfRight);
      const bottomLeft = p.center
        .add(halfUp.uniformScale(-1))
        .add(halfRight.uniformScale(-1));
      const bottomRight = p.center.add(halfUp.uniformScale(-1)).add(halfRight);

      this.applyCorners({ topLeft, topRight, bottomLeft, bottomRight });
    } catch (e) {
      print(`[CornerController] applyPose error: ${e}`);
    }
  }

  public getTransforms(): {
    topLeft: Transform;
    topRight: Transform;
    bottomLeft: Transform;
    bottomRight: Transform;
  } {
    return {
      topLeft: this.topLeftTrans,
      topRight: this.topRightTrans,
      bottomLeft: this.bottomLeftTrans,
      bottomRight: this.bottomRightTrans,
    };
  }

  public meetsMinSize(minSize: number): boolean {
    if (!this.topLeftTrans || !this.bottomRightTrans) return false;
    const width = this.topLeftTrans
      .getWorldPosition()
      .distance(this.topRightTrans.getWorldPosition());
    const height = this.topLeftTrans
      .getWorldPosition()
      .distance(this.bottomLeftTrans.getWorldPosition());
    return width >= minSize && height >= minSize;
  }

  public setVisible(visible: boolean) {
    const scale = visible ? vec3.one() : vec3.zero();
    const targetParent = this.getSceneObject();
    targetParent.getTransform().setLocalScale(scale);
  }

  public resetToSquare(sizeCm: number) {
    if (!this.topLeftTrans) return;
    const center = this.topLeftTrans
      .getWorldPosition()
      .add(this.bottomRightTrans.getWorldPosition())
      .uniformScale(0.5);
    const right = vec3.right();
    const up = vec3.up();
    const halfRight = right.uniformScale(sizeCm * 0.5);
    const halfUp = up.uniformScale(sizeCm * 0.5);

    const topLeft = center.add(halfUp).add(halfRight.uniformScale(-1));
    const topRight = center.add(halfUp).add(halfRight);
    const bottomLeft = center
      .add(halfUp.uniformScale(-1))
      .add(halfRight.uniformScale(-1));
    const bottomRight = center.add(halfUp.uniformScale(-1)).add(halfRight);

    this.applyCorners({ topLeft, topRight, bottomLeft, bottomRight });
  }

  public getCornerObjects(): SceneObject[] {
    return [
      this.topLeftObj,
      this.topRightObj,
      this.bottomRightObj,
      this.bottomLeftObj,
    ];
  }
}
