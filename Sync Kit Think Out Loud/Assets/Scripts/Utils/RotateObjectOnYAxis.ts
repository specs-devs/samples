/**
 * Specs Inc. 2026
 * Rotate Object On YAxis component for the Think Out Loud Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"

@component
export class RotateObjectOnYAxis extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">RotateObjectOnYAxis – rotates a SceneObject continuously around the Y axis</span><br/><span style="color: #94A3B8; font-size: 11px;">Add to any object to apply continuous Y-axis rotation each frame.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Rotation</span>')
  @input
  @hint("Rotation speed in degrees per second")
  @widget(new SliderWidget(10, 360, 1))
  rotationSpeed: number = 90

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private transform: Transform
  private currentRotation: number = 0

  onAwake(): void {
    this.logger = new Logger("RotateObjectOnYAxis", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.transform = this.getTransform()
  }

  @bindUpdateEvent
  onUpdate(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onUpdate()")
    const deltaTime = getDeltaTime()
    const rotationDelta = this.rotationSpeed * deltaTime
    this.currentRotation += rotationDelta
    const rotationRadians = this.currentRotation * MathUtils.DegToRad
    const rotationQuat = quat.angleAxis(rotationRadians, vec3.up())
    this.transform.setLocalRotation(rotationQuat)
  }
}
