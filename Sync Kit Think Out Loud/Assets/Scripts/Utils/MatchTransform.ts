/**
 * Specs Inc. 2026
 * Match Transform component for the Think Out Loud Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { MathUtils } from "Utilities.lspkg/Scripts/Utils/MathUtils"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"

/**
 * MatchTransform - Smoothly follows the position and rotation of a target SceneObject
 * Used for positioning timer and menu objects
 */
@component
export class MatchTransform extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MatchTransform – smoothly follows position and rotation of a target SceneObject</span><br/><span style="color: #94A3B8; font-size: 11px;">Target must be set programmatically via setTarget(). Supports lerp for smooth transitions.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Position</span>')
  @input
  @hint("Position offset relative to the target's position")
  positionOffset: vec3 = new vec3(0, 0, 0)

  @input
  @hint("Use lerping for smooth position transitions")
  usePositionLerp: boolean = true

  @input
  @hint("Speed for moving towards the target's position (when lerping is enabled)")
  @widget(new SliderWidget(0.1, 20.0, 0.1))
  positionLerpSpeed: number = 8.0

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Rotation</span>')
  @input
  @hint("Use lerping for smooth rotation transitions")
  useRotationLerp: boolean = true

  @input
  @hint("Speed for rotating towards the target's rotation (when lerping is enabled)")
  @widget(new SliderWidget(0.1, 20.0, 0.1))
  rotationLerpSpeed: number = 6.0

  @input
  @hint("Whether to match the target's rotation")
  matchRotation: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Scale</span>')
  @input
  @hint("Whether to match the target's scale")
  matchScale: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  public target: SceneObject

  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("MatchTransform", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindUpdateEvent
  onUpdate(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onUpdate()")
    if (!this.target) {
      return
    }
    this.updateTransform()
  }

  private updateTransform(): void {
    const myTransform = this.getTransform()
    const targetTransform = this.target.getTransform()

    const targetPos = targetTransform.getWorldPosition()
    const targetRot = targetTransform.getWorldRotation()

    const rotatedOffset = targetRot.multiplyVec3(this.positionOffset)
    const finalPos = new vec3(
      targetPos.x + rotatedOffset.x,
      targetPos.y + rotatedOffset.y,
      targetPos.z + rotatedOffset.z
    )

    const currentPos = myTransform.getWorldPosition()
    const t = Math.min(1, this.positionLerpSpeed * getDeltaTime())
    const newPos = this.usePositionLerp ? vec3.lerp(currentPos, finalPos, t) : finalPos
    myTransform.setWorldPosition(newPos)

    if (this.matchRotation) {
      const currentRot = myTransform.getWorldRotation()
      const newRot = this.useRotationLerp
        ? MathUtils.interpolateRotation(currentRot, targetRot, this.rotationLerpSpeed)
        : targetRot
      myTransform.setWorldRotation(newRot)
    }

    if (this.matchScale) {
      const targetScale = targetTransform.getWorldScale()
      const currentScale = myTransform.getLocalScale()
      const tScale = Math.min(1, this.positionLerpSpeed * getDeltaTime())
      const newScale = vec3.lerp(currentScale, targetScale, tScale)
      myTransform.setLocalScale(newScale)
    }
  }

  /**
   * Set target programmatically
   */
  public setTarget(target: SceneObject): void {
    this.target = target
  }

  /**
   * Set position offset programmatically
   */
  public setPositionOffset(offset: vec3): void {
    this.positionOffset = offset
  }
}
