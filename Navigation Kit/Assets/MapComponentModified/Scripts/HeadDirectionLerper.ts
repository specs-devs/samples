import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindUpdateEvent} from "SnapDecorators.lspkg/decorators"

/**
 * This script smooths out the heading direction of the provided camera.
 */
@component
export class HeadDirectionLerper extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input private camera: Camera
  @input private maxOffset = 1

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
  private camTransform: Transform
  private currentRotation: quat

  private onAwake(): void {
    this.logger = new Logger("HeadDirectionLerper", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.transform = this.getSceneObject().getTransform()
    this.camTransform = this.camera.getTransform()
    this.currentRotation = this.transform.getWorldRotation()
  }

  @bindUpdateEvent
  private update(): void {
    let fwd = this.camTransform.forward
    fwd = fwd.normalize()

    const up = this.camTransform.up
    const newRot = quat.lookAt(fwd, up)
    const lerpT = 1 - Math.pow(0.05, getDeltaTime())

    const change = quat.angleBetween(this.currentRotation, newRot)
    if (change > this.maxOffset) {
      this.currentRotation = quat.slerp(this.currentRotation, newRot, 1 - this.maxOffset / change)
    }

    this.currentRotation = quat.slerp(this.currentRotation, newRot, lerpT)
    this.transform.setWorldRotation(this.currentRotation)
  }

  public setCurrent(): void {
    this.currentRotation = this.transform.getWorldRotation()
  }
}
