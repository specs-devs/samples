/**
 * Specs Inc. 2026
 * Rotate Target TS component for the Essentials Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent, bindUpdateEvent } from "SnapDecorators.lspkg/decorators"

@component
export class RotateTargetTS extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">RotateTargetTS – randomly rotate a target at regular intervals</span><br/><span style="color: #94A3B8; font-size: 11px;">Applies a random Y-axis rotation to the attached SceneObject on a configurable timer.</span>')
  @ui.separator

  @input
  @hint("The time between rotations in seconds")
  rotationInterval: number = 2.0

  @input
  @hint("The minimum rotation angle in degrees")
  minRotationAngle: number = -20.0

  @input
  @hint("The maximum rotation angle in degrees")
  maxRotationAngle: number = 20.0

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private nextRotationTime: number = 0
  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("RotateTargetTS", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.rotateTarget()
  }

  @bindUpdateEvent
  onUpdate(): void {
    const currentTime = getTime()
    if (currentTime >= this.nextRotationTime) {
      this.rotateTarget()
    }
  }

  private rotateTarget(): void {
    const rotationAngle = this.minRotationAngle + Math.random() * (this.maxRotationAngle - this.minRotationAngle)
    const radians = rotationAngle * (Math.PI / 180)
    const rotation = quat.angleAxis(radians, new vec3(0, 1, 0))
    const transform = this.getSceneObject().getTransform()
    transform.setLocalRotation(rotation)
    this.nextRotationTime = getTime() + this.rotationInterval
    this.logger.debug(`Rotated target to angle: ${rotationAngle.toFixed(2)}°`)
  }
}
