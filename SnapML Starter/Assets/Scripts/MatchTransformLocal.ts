/**
 * Specs Inc. 2026
 * Match Transform Local component for the SnapML Starter Spectacles lens.
 */
import {bindStartEvent, bindUpdateEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

/**
 * Optionally matches the position, rotation, or scale of another object.
 * Works in-editor.
 */
@component
export class MatchTransformLocal extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MatchTransformLocal – local-space transform follower</span><br/><span style="color: #94A3B8; font-size: 11px;">Copies or lerps local position (per-axis targets), rotation, and scale of target objects each frame.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Targets</span>')
  @input
  @hint("Primary target whose local transform is matched")
  target!: SceneObject

  @input
  @hint("Target object providing the local Z position component")
  targetZ!: SceneObject

  @input
  @hint("Target object providing the local Y position component")
  targetY!: SceneObject

  @input
  @hint("Target object providing the local X position component")
  targetX!: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Position</span>')
  @input
  @hint("Local-space offset added to the blended target position")
  positionOffset: vec3 = new vec3(0, 0, 0)

  @input
  @hint("Use lerping for smooth position transitions")
  usePositionLerp: boolean = true

  @input
  @hint("Speed for moving towards the target position when lerping is enabled")
  positionLerpSpeed: number = 1.0

  @input
  @hint("Prevent matching on the X axis")
  constrainPositionX: boolean = false

  @input
  @hint("Prevent matching on the Y axis")
  constrainPositionY: boolean = false

  @input
  @hint("Prevent matching on the Z axis")
  constrainPositionZ: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Rotation</span>')
  @input
  @hint("Speed for rotating towards the target rotation")
  rotationLerpSpeed: number = 1.0

  @input
  @hint("Prevent matching rotation on the X axis")
  constrainRotationX: boolean = false

  @input
  @hint("Prevent matching rotation on the Y axis")
  constrainRotationY: boolean = false

  @input
  @hint("Prevent matching rotation on the Z axis")
  constrainRotationZ: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Scale</span>')
  @input
  @hint("Speed for scaling towards the target scale")
  scaleLerpSpeed: number = 1.0

  @input
  @hint("Prevent matching scale on the X axis")
  constrainScaleX: boolean = false

  @input
  @hint("Prevent matching scale on the Y axis")
  constrainScaleY: boolean = false

  @input
  @hint("Prevent matching scale on the Z axis")
  constrainScaleZ: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("MatchTransformLocal", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    if (!this.target) {
      this.logger.warn("No target set for MatchTransform - please set a target object")
    }
  }

  @bindUpdateEvent
  onUpdate(): void {
    if (!this.target) return
    this.updateTransform()
  }

  private updateTransform(): void {
    const myTransform = this.sceneObject.getTransform()
    const targetTransform = this.target.getTransform()

    this.updatePosition(myTransform, targetTransform)
    this.updateRotation(myTransform, targetTransform)
    this.updateScale(myTransform, targetTransform)
  }

  private updatePosition(myTransform: Transform, targetTransform: Transform): void {
    const targetPos = targetTransform.getLocalPosition()
    const targetZPos = this.targetZ.getTransform().getLocalPosition()
    const targetYPos = this.targetY.getTransform().getLocalPosition()
    const targetXPos = this.targetX.getTransform().getLocalPosition()

    const targetPosition = new vec3(
      targetXPos.x + this.positionOffset.x,
      targetYPos.y + this.positionOffset.y,
      targetZPos.z + this.positionOffset.z
    )

    const currentPosition = myTransform.getLocalPosition()

    let newPosition = new vec3(
      this.constrainPositionX ? currentPosition.x : targetPosition.x,
      this.constrainPositionY ? currentPosition.y : targetPosition.y,
      this.constrainPositionZ ? currentPosition.z : targetPosition.z
    )

    if (this.usePositionLerp) {
      newPosition = vec3.lerp(currentPosition, newPosition, this.positionLerpSpeed * getDeltaTime())
    }

    myTransform.setLocalPosition(newPosition)
  }

  private updateRotation(myTransform: Transform, targetTransform: Transform): void {
    const targetRotation = targetTransform.getLocalRotation()
    const currentRotation = myTransform.getLocalRotation()

    const targetEuler = this.quaternionToEuler(targetRotation)
    const currentEuler = this.quaternionToEuler(currentRotation)

    const newEuler = new vec3(
      this.constrainRotationX ? currentEuler.x : targetEuler.x,
      this.constrainRotationY ? currentEuler.y : targetEuler.y,
      this.constrainRotationZ ? currentEuler.z : targetEuler.z
    )

    const newRotation = quat.fromEulerAngles(newEuler.x, newEuler.y, newEuler.z)
    const lerpedRotation = quat.slerp(currentRotation, newRotation, this.rotationLerpSpeed * getDeltaTime())

    myTransform.setLocalRotation(lerpedRotation)
  }

  private updateScale(myTransform: Transform, targetTransform: Transform): void {
    const targetScale = targetTransform.getLocalScale()
    const currentScale = myTransform.getLocalScale()

    const newScale = new vec3(
      this.constrainScaleX ? currentScale.x : targetScale.x,
      this.constrainScaleY ? currentScale.y : targetScale.y,
      this.constrainScaleZ ? currentScale.z : targetScale.z
    )

    const lerpedScale = vec3.lerp(currentScale, newScale, this.scaleLerpSpeed * getDeltaTime())
    myTransform.setLocalScale(lerpedScale)
  }

  private quaternionToEuler(q: quat): vec3 {
    const x = q.x
    const y = q.y
    const z = q.z
    const w = q.w

    const sinr_cosp = 2 * (w * x + y * z)
    const cosr_cosp = 1 - 2 * (x * x + y * y)
    const roll = Math.atan2(sinr_cosp, cosr_cosp)

    const sinp = 2 * (w * y - z * x)
    let pitch
    if (Math.abs(sinp) >= 1) {
      pitch = (Math.sign(sinp) * Math.PI) / 2
    } else {
      pitch = Math.asin(sinp)
    }

    const siny_cosp = 2 * (w * z + x * y)
    const cosy_cosp = 1 - 2 * (y * y + z * z)
    const yaw = Math.atan2(siny_cosp, cosy_cosp)

    return new vec3(roll, pitch, yaw)
  }
}
