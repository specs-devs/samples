import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";

export class BillboardBehavior {
  private baseLocalRot: quat;
  private snappedLocalRot: quat | null = null;
  private curWeight: number = 0;
  private readonly _scratchFlatDir = new vec3(0, 0, 0);

  constructor(baseLocalRot: quat) {
    this.baseLocalRot = baseLocalRot;
  }

  snapToCamera(transform: Transform, parentTransform: Transform): void {
    const camPos = WorldCameraFinderProvider.getInstance()
      .getTransform()
      .getWorldPosition();
    const objPos = transform.getWorldPosition();
    const dir = camPos.sub(objPos);
    this._scratchFlatDir.x = dir.x;
    this._scratchFlatDir.y = 0;
    this._scratchFlatDir.z = dir.z;
    const flatDir = this._scratchFlatDir;
    if (flatDir.length > 0.001) {
      const billboardWorldRot = quat.lookAt(flatDir.normalize(), vec3.up());
      this.snappedLocalRot = parentTransform
        .getWorldRotation()
        .invert()
        .multiply(billboardWorldRot);
    }
  }

  update(
    transform: Transform,
    parentTransform: Transform,
    hovered: boolean,
    lerpSpeed: number,
  ): void {
    const restingRot = this.snappedLocalRot ?? this.baseLocalRot;
    const targetWeight = hovered ? 1.0 : 0.0;
    this.curWeight = MathUtils.lerp(this.curWeight, targetWeight, lerpSpeed);

    if (this.curWeight > 0.001) {
      const camPos = WorldCameraFinderProvider.getInstance()
        .getTransform()
        .getWorldPosition();
      const objPos = transform.getWorldPosition();
      const dir = camPos.sub(objPos);
      this._scratchFlatDir.x = dir.x;
      this._scratchFlatDir.y = 0;
      this._scratchFlatDir.z = dir.z;
      if (this._scratchFlatDir.length > 0.001) {
        const billboardWorldRot = quat.lookAt(this._scratchFlatDir.normalize(), vec3.up());
        const billboardLocalRot = parentTransform
          .getWorldRotation()
          .invert()
          .multiply(billboardWorldRot);
        const blendedRot = quat.slerp(
          restingRot,
          billboardLocalRot,
          this.curWeight,
        );
        transform.setLocalRotation(blendedRot);
        return;
      }
    }

    transform.setLocalRotation(restingRot);
  }
}
