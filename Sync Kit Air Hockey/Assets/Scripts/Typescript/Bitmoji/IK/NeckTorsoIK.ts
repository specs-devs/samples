/**
 * Specs Inc. 2026
 * Neck and torso IK that smoothly rotates the head to track the puck with human-like constraints in the Air Hockey lens.
 */

import * as BitmojiConstants from "../BitmojiConstants"

const OFFSET: quat = quat.angleAxis(Math.PI / 2, new vec3(0, 0, 1))

export class NeckTorsoIK {
  private neckTransform: Transform
  private torsoTransform: Transform | null
  private shoulderTransforms: Transform[] = []
  private puckTransform: Transform
  private bitmojiTransform: Transform
  private previousNeckRotation: quat
  private previousTorsoRotation: quat
  private torsoBaseRotation: quat
  private isInitialized: boolean = false
  private readonly upVector = vec3.up()

  constructor(
    neckTransform: Transform,
    puckTransform: Transform,
    bitmojiTransform: Transform,
    torsoTransform: Transform | null = null,
    shoulderTransforms: Transform[] = []
  ) {
    this.neckTransform = neckTransform
    this.puckTransform = puckTransform
    this.bitmojiTransform = bitmojiTransform
    this.torsoTransform = torsoTransform
    this.shoulderTransforms = shoulderTransforms
    this.setInitialRotation()
  }

  setInitialRotation() {
    const rotation = this.calculateTargetRotation()
    this.neckTransform.setWorldRotation(rotation)
    this.previousNeckRotation = rotation

    if (this.torsoTransform) {
      this.torsoBaseRotation = this.torsoTransform.getWorldRotation()
      this.previousTorsoRotation = this.torsoBaseRotation
    }

    this.isInitialized = true
  }

  private calculateTargetRotation(): quat {
    if (!this.neckTransform || !this.puckTransform || !this.bitmojiTransform) {
      return this.previousNeckRotation || quat.quatIdentity()
    }

    const neckWorldPos = this.neckTransform.getWorldPosition()
    const puckWorldPos = this.puckTransform.getWorldPosition()

    const dx = neckWorldPos.x - puckWorldPos.x
    const dy = (neckWorldPos.y - puckWorldPos.y) * BitmojiConstants.VERTICAL_DAMPING
    const dz = neckWorldPos.z - puckWorldPos.z

    const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const invLen = 1.0 / len
    const dampedDirection = new vec3(dx * invLen, dy * invLen, dz * invLen)

    const bodyForward = this.bitmojiTransform.forward
    const dotProduct = dampedDirection.x * bodyForward.x +
                       dampedDirection.y * bodyForward.y +
                       dampedDirection.z * bodyForward.z

    let finalDirection = dampedDirection
    if (dotProduct > 0) {
      const bodyRight = this.bitmojiTransform.right
      const sideSign = Math.sign(dampedDirection.x * bodyRight.x +
                                 dampedDirection.y * bodyRight.y +
                                 dampedDirection.z * bodyRight.z)

      finalDirection = new vec3(
        bodyRight.x * sideSign,
        dy * invLen,
        bodyRight.z * sideSign
      )

      const fLen = Math.sqrt(finalDirection.x * finalDirection.x +
                             finalDirection.y * finalDirection.y +
                             finalDirection.z * finalDirection.z)
      finalDirection = new vec3(
        finalDirection.x / fLen,
        finalDirection.y / fLen,
        finalDirection.z / fLen
      )
    }

    return quat.lookAt(finalDirection, this.upVector).multiply(OFFSET)
  }

  update() {
    if (!this.isInitialized || !this.neckTransform || !this.puckTransform || !this.bitmojiTransform) return

    const targetRotation = this.calculateTargetRotation()
    const neckRotation = quat.slerp(
      this.previousNeckRotation,
      targetRotation,
      getDeltaTime() * BitmojiConstants.NECK_SLERP_FACTOR
    )
    this.neckTransform.setWorldRotation(neckRotation)
    this.previousNeckRotation = neckRotation

    if (this.torsoTransform && this.shoulderTransforms.length > 0) {
      const targetTorsoRotation = quat.slerp(
        this.torsoBaseRotation,
        neckRotation,
        BitmojiConstants.TORSO_FOLLOW_AMOUNT
      )

      const torsoRotation = quat.slerp(
        this.previousTorsoRotation,
        targetTorsoRotation,
        getDeltaTime() * BitmojiConstants.TORSO_SLERP_FACTOR
      )

      const torsoDelta = torsoRotation.multiply(this.previousTorsoRotation.invert())
      const counterRotation = torsoDelta.invert()

      const len = this.shoulderTransforms.length
      for (let i = 0; i < len; i++) {
        const currentRot = this.shoulderTransforms[i].getWorldRotation()
        this.shoulderTransforms[i].setWorldRotation(counterRotation.multiply(currentRot))
      }

      this.torsoTransform.setWorldRotation(torsoRotation)
      this.previousTorsoRotation = torsoRotation
    }
  }
}
