/**
 * Specs Inc. 2026
 * FABRIK (Forward And Backward Reaching IK) solver for three-joint arm chains in the Air Hockey lens.
 */

import {JointNode} from "../BitmojiUtils"

const ITERATIONS = 3
const TOLERANCE = 1.0

const LEFT_JOINT_DIRECTIONS: vec3[] = [vec3.left(), vec3.right(), vec3.left()]
const RIGHT_JOINT_DIRECTIONS: vec3[] = [vec3.right(), vec3.right(), vec3.right()]

export class FABRIK {
  private rootTransform: Transform
  private forwardPositions: vec3[] = []
  private backwardPositions: vec3[] = []
  private jointTransforms: Transform[] = []
  private jointCount: number = 0
  private jointDirections: vec3[] = []
  private linkLengths: number[] = []
  private maxLengthSquared: number = 0
  private armType: string
  private responsiveness: number = 20

  constructor(
    root: SceneObject,
    wrist: JointNode,
    elbow: JointNode,
    shoulder: JointNode,
    armType: "left" | "right",
    responsiveness: number = 20
  ) {
    this.responsiveness = responsiveness
    this.rootTransform = root.getTransform()
    this.jointTransforms = [shoulder.transform, elbow.transform, wrist.transform]
    this.armType = armType
    this.jointDirections = (armType === "left") ? LEFT_JOINT_DIRECTIONS : RIGHT_JOINT_DIRECTIONS
    this.jointCount = this.jointTransforms.length

    let maxLength = 0
    for (let i = 1; i < this.jointTransforms.length; i++) {
      const linkLength = this.jointTransforms[i].getWorldPosition().distance(
        this.jointTransforms[i - 1].getWorldPosition()
      )
      this.linkLengths.push(linkLength)
      maxLength += linkLength
    }
    this.maxLengthSquared = maxLength * maxLength

    if (this.armType === "right") {
      shoulder.sceneObject.getParent().getTransform().setLocalRotation(
        quat.fromEulerVec(new vec3(178, -25, -175).uniformScale(Math.PI / 180))
      )
    } else {
      shoulder.sceneObject.getParent().getTransform().setLocalRotation(
        quat.fromEulerVec(new vec3(2, 25, 5).uniformScale(Math.PI / 180))
      )
    }

    elbow.sceneObject.getParent().getTransform().setLocalRotation(quat.quatIdentity())
    this.jointTransforms[1].setLocalRotation(quat.quatIdentity())
    this.jointTransforms[2].setLocalRotation(quat.quatIdentity())

    for (let i = 0; i < this.jointCount; i++) {
      this.forwardPositions.push(this.jointTransforms[i].getWorldPosition())
      this.backwardPositions.push(this.jointTransforms[i].getWorldPosition())
    }
  }

  initArmPose(targetTransform: Transform): void {
    const worldDirection = this.jointTransforms[0].getWorldPosition()
      .sub(targetTransform.getWorldPosition())
      .normalize()
    const localDirection = this.rootTransform.getWorldRotation()
      .invert()
      .multiplyVec3(worldDirection)

    const angles = quat.rotationFromTo(this.jointDirections[0], localDirection).toEulerAngles()

    const targetRotation = this.armType === "right"
      ? quat.fromEulerAngles(-angles.x, angles.y, -angles.z)
      : quat.fromEulerAngles(angles.x, -angles.y, -angles.z)

    this.jointTransforms[0].setLocalRotation(targetRotation)

    for (let j = 1; j < this.jointTransforms.length - 1; j++) {
      this.jointTransforms[j].setLocalRotation(quat.quatIdentity())
    }
  }

  private backwardReach(targetPosition: vec3): void {
    this.backwardPositions[this.jointCount - 1] = targetPosition

    for (let i = this.jointCount - 1; i > 0; i--) {
      const jointPos = this.jointTransforms[i - 1].getWorldPosition()
      const dx = jointPos.x - this.backwardPositions[i].x
      const dy = jointPos.y - this.backwardPositions[i].y
      const dz = jointPos.z - this.backwardPositions[i].z

      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const scale = this.linkLengths[i - 1] / dist

      this.backwardPositions[i - 1] = new vec3(
        this.backwardPositions[i].x + dx * scale,
        this.backwardPositions[i].y + dy * scale,
        this.backwardPositions[i].z + dz * scale
      )
    }
  }

  private forwardReach(shoulderPosition: vec3): void {
    this.forwardPositions[0] = shoulderPosition

    for (let i = 0; i < this.jointCount - 1; i++) {
      const dx = this.backwardPositions[i + 1].x - this.forwardPositions[i].x
      const dy = this.backwardPositions[i + 1].y - this.forwardPositions[i].y
      const dz = this.backwardPositions[i + 1].z - this.forwardPositions[i].z

      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const scale = this.linkLengths[i] / dist

      this.forwardPositions[i + 1] = new vec3(
        this.forwardPositions[i].x + dx * scale,
        this.forwardPositions[i].y + dy * scale,
        this.forwardPositions[i].z + dz * scale
      )
    }
  }

  private poleConstraint(shoulderPosition: vec3, poleTransform: Transform): void {
    const limbDirection = this.forwardPositions[2].sub(shoulderPosition).normalize()
    const poleDirection = poleTransform.getWorldPosition().sub(shoulderPosition).normalize()
    const boneDirection = this.forwardPositions[1].sub(shoulderPosition).normalize()

    vec3.orthonormalize(limbDirection, poleDirection)
    vec3.orthonormalize(limbDirection, boneDirection)

    const angle = quat.rotationFromTo(boneDirection, poleDirection)
    const rotationVector = this.forwardPositions[1].sub(shoulderPosition)
    this.forwardPositions[1] = angle.multiplyVec3(rotationVector).add(shoulderPosition)
  }

  private straighten(targetPosition: vec3, shoulderPosition: vec3, poleTransform: Transform): void {
    const directionToTarget = targetPosition.sub(shoulderPosition).normalize()
    const maxLength = Math.sqrt(this.maxLengthSquared)
    const reachableWristPosition = shoulderPosition.add(directionToTarget.uniformScale(maxLength))

    this.forwardPositions[0] = shoulderPosition
    this.forwardPositions[1] = shoulderPosition.add(directionToTarget.uniformScale(this.linkLengths[0]))
    this.forwardPositions[2] = reachableWristPosition

    this.poleConstraint(shoulderPosition, poleTransform)
    this.updateJoints()
  }

  private updateJoints(): void {
    const deltaTime = getDeltaTime()
    const slerpAmount = this.responsiveness * deltaTime

    const rootRotInv = this.rootTransform.getWorldRotation().invert()
    const shoulderToElbow = this.forwardPositions[0].sub(this.forwardPositions[1]).normalize()
    const localShoulderToElbow = rootRotInv.multiplyVec3(shoulderToElbow)
    const angles = quat.rotationFromTo(this.jointDirections[0], localShoulderToElbow).toEulerAngles()

    const nextRotation = this.armType === "right"
      ? quat.fromEulerAngles(-angles.x, angles.y, -angles.z)
      : quat.fromEulerAngles(angles.x, -angles.y, -angles.z)

    const currentRotation = this.jointTransforms[0].getLocalRotation()
    this.jointTransforms[0].setLocalRotation(quat.slerp(currentRotation, nextRotation, slerpAmount))

    const shoulderRotInv = this.jointTransforms[0].getWorldRotation().invert()
    const elbowToWrist = this.forwardPositions[2].sub(this.forwardPositions[1])
    const localElbowToWrist = shoulderRotInv.multiplyVec3(elbowToWrist)

    const elbowNextRotation = quat.rotationFromTo(this.jointDirections[1], localElbowToWrist)
    const elbowCurrentRotation = this.jointTransforms[1].getLocalRotation()
    this.jointTransforms[1].setLocalRotation(quat.slerp(elbowCurrentRotation, elbowNextRotation, slerpAmount))
  }

  solve(targetTransform: Transform, poleTransform: Transform): void {
    const targetPosition = targetTransform.getWorldPosition()
    const wristPosition = this.jointTransforms[2].getWorldPosition()

    const dx = targetPosition.x - wristPosition.x
    const dy = targetPosition.y - wristPosition.y
    const dz = targetPosition.z - wristPosition.z
    const distSq = dx * dx + dy * dy + dz * dz

    if (distSq < TOLERANCE * TOLERANCE) return

    const shoulderPosition = this.jointTransforms[0].getWorldPosition()

    for (let i = 0; i < ITERATIONS; i++) {
      this.backwardReach(targetPosition)
      this.forwardReach(shoulderPosition)
      this.poleConstraint(shoulderPosition, poleTransform)
      this.updateJoints()

      const wPos = this.jointTransforms[2].getWorldPosition()
      const ex = wPos.x - targetPosition.x
      const ey = wPos.y - targetPosition.y
      const ez = wPos.z - targetPosition.z
      const errorSq = ex * ex + ey * ey + ez * ez

      if (errorSq < TOLERANCE * TOLERANCE) break
    }
  }
}
