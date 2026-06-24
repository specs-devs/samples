/**
 * Specs Inc. 2026
 * Match Transform component for the Throw Lab Spectacles lens.
 */
import {bindUpdateEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {MathUtils} from "Utilities.lspkg/Scripts/Utils/MathUtils"

/**
 * Matches the position and rotation of a target with smooth lerping.
 * Maintains offset from the initial grab point.
 * Works with position/rotation vectors (for hand tracking) instead of SceneObjects.
 */
@component
export class MatchTransform extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MatchTransform – Smooth position and rotation following with offset</span><br/><span style="color: #94A3B8; font-size: 11px;">Driven externally by GrabbableObject; call setTarget(), enableMatching(), and disableMatching().</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Motion Settings</span>')
  @input
  @hint("Speed for position lerping (higher = faster response)")
  positionLerpSpeed: number = 15.0

  @input
  @hint("Speed for rotation lerping (higher = faster response)")
  rotationLerpSpeed: number = 15.0

  @input
  @hint("Distance in front of finger tip to hold object (in cm)")
  holdDistance: number = 5.0

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private positionOffset: vec3 = vec3.zero()
  private startingPositionOffset: vec3 = vec3.zero()
  private desiredPositionOffset: vec3 = vec3.zero()
  private rotationOffset: quat = quat.quatIdentity()
  private hasInitializedOffset: boolean = false
  private isMatching: boolean = false
  private updateRotation: boolean = true

  private offsetTransitionProgress: number = 0
  private offsetTransitionSpeed: number = 2.0

  private targetPosition: vec3 = vec3.zero()
  private targetRotation: quat = quat.quatIdentity()

  onAwake() {
    this.logger = new Logger("MatchTransform", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  setTarget(position: vec3, rotation: quat) {
    this.targetPosition = position
    this.targetRotation = rotation

    if (!this.hasInitializedOffset) {
      this.initializeOffset()
    }
  }

  /**
   * @deprecated Use setTarget instead
   */
  setTargetPosition(position: vec3) {
    this.targetPosition = position

    if (!this.hasInitializedOffset) {
      this.initializeOffset()
    }
  }

  private initializeOffset() {
    const myTransform = this.getSceneObject().getTransform()
    const myWorldPos = myTransform.getWorldPosition()
    const myWorldRot = myTransform.getWorldRotation()

    this.startingPositionOffset = myWorldPos.sub(this.targetPosition)

    const indexTipForward = this.targetRotation.multiplyVec3(vec3.forward())
    this.desiredPositionOffset = indexTipForward.uniformScale(this.holdDistance)

    this.positionOffset = this.startingPositionOffset
    this.offsetTransitionProgress = 0

    this.rotationOffset = myWorldRot.multiply(this.targetRotation.invert())

    this.hasInitializedOffset = true

    this.logger.debug(`(${this.getSceneObject().name}): Starting offset: ${this.startingPositionOffset}`)
    this.logger.debug(`(${this.getSceneObject().name}): Desired offset: ${this.desiredPositionOffset}`)
    this.logger.debug(
      `(${this.getSceneObject().name}): Object world pos: ${myWorldPos}, Finger pos: ${this.targetPosition}`
    )
  }

  resetOffset() {
    this.hasInitializedOffset = false
    this.positionOffset = vec3.zero()
    this.startingPositionOffset = vec3.zero()
    this.desiredPositionOffset = vec3.zero()
    this.rotationOffset = quat.quatIdentity()
    this.offsetTransitionProgress = 0
  }

  private updateCounter = 0
  private debugCounter = 0

  enableMatching() {
    this.isMatching = true
    this.logger.info(`(${this.getSceneObject().name}): Matching ENABLED`)
  }

  disableMatching() {
    this.isMatching = false
    this.logger.info(`(${this.getSceneObject().name}): Matching DISABLED`)
  }

  disableRotationUpdates() {
    this.updateRotation = false
  }

  enableRotationUpdates() {
    this.updateRotation = true
  }

  @bindUpdateEvent
  onUpdate() {
    if (!this.enabled) {
      if (this.isMatching) {
        this.logger.warn(`(${this.getSceneObject().name}): isMatching=true but component is disabled!`)
      }
      return
    }

    if (!this.isMatching) {
      return
    }

    if (!this.hasInitializedOffset) {
      this.logger.warn(`(${this.getSceneObject().name}): isMatching=true but no offset initialized!`)
      return
    }

    this.debugCounter++
    if (this.debugCounter % 30 === 0) {
      this.logger.debug(`Actively matching (${this.getSceneObject().name})`)
    }

    this.updateTransform()
  }

  private updateTransform() {
    const myTransform = this.getSceneObject().getTransform()

    if (this.offsetTransitionProgress < 1.0) {
      this.offsetTransitionProgress += this.offsetTransitionSpeed * getDeltaTime()
      this.offsetTransitionProgress = Math.min(this.offsetTransitionProgress, 1.0)

      this.positionOffset = vec3.lerp(
        this.startingPositionOffset,
        this.desiredPositionOffset,
        this.offsetTransitionProgress
      )

      if (this.offsetTransitionProgress >= 1.0) {
        this.logger.debug(`(${this.getSceneObject().name}): Offset transition complete - object at hold distance`)
      }
    }

    const targetPosWithOffset = this.targetPosition.add(this.positionOffset)
    const targetRotWithOffset = this.targetRotation.multiply(this.rotationOffset)

    const currentPosition = myTransform.getWorldPosition()
    const currentRotation = myTransform.getWorldRotation()

    this.updateCounter++
    if (this.updateCounter % 10 === 0) {
      const dist = currentPosition.distance(targetPosWithOffset)
      this.logger.debug(
        `(${this.getSceneObject().name}): dist=${dist.toFixed(2)}cm, transition=${(this.offsetTransitionProgress * 100).toFixed(0)}%`
      )
    }

    const lerpT = Math.max(0, Math.min(1, this.positionLerpSpeed * getDeltaTime()))
    const newPosition = vec3.lerp(currentPosition, targetPosWithOffset, lerpT)

    myTransform.setWorldPosition(newPosition)

    if (this.updateRotation) {
      const newRotation = MathUtils.interpolateRotation(currentRotation, targetRotWithOffset, this.rotationLerpSpeed)

      myTransform.setWorldRotation(newRotation)
    }
  }
}
