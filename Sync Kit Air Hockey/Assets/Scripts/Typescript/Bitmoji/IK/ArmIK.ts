/**
 * Specs Inc. 2026
 * High-level arm controller using FABRIK IK to drive paddle-holding hand poses in the Air Hockey lens.
 */

import {FABRIK} from "./FABRIK"
import {JointNode} from "../BitmojiUtils"

export class ArmIK {
  private fabrik: FABRIK
  private wrist: JointNode
  private poleTransform: Transform
  private targetTransform: Transform
  private armType: "left" | "right"

  constructor(
    bitmojiRoot: SceneObject,
    shoulder: JointNode,
    elbow: JointNode,
    wrist: JointNode,
    poleObject: SceneObject,
    targetObject: SceneObject,
    armType: "left" | "right",
    responsiveness: number = 20
  ) {
    this.wrist = wrist
    this.armType = armType
    this.poleTransform = poleObject.getTransform()
    this.targetTransform = targetObject.getTransform()

    this.fabrik = new FABRIK(bitmojiRoot, wrist, elbow, shoulder, armType, responsiveness)
    this.fabrik.initArmPose(this.targetTransform)
  }

  updateTargetFromPaddle(
    paddleTransform: Transform,
    verticalOffset: number = 5.0,
    horizontalOffset: number = 0.0,
    depthOffset: number = 0.0
  ): void {
    const paddlePosition = paddleTransform.getWorldPosition()
    const offsetPosition = paddlePosition.add(new vec3(horizontalOffset, verticalOffset, depthOffset))
    this.targetTransform.setWorldPosition(offsetPosition)
  }

  private applyHandRotation(): void {
    if (!this.wrist) return

    const targetRotation = this.armType === "right"
      ? quat.fromEulerAngles(0, Math.PI, 0)
      : quat.fromEulerAngles(0, 0, 0)

    this.wrist.transform.setLocalRotation(targetRotation)
  }

  update(): void {
    this.fabrik.solve(this.targetTransform, this.poleTransform)
    this.applyHandRotation()
  }
}
