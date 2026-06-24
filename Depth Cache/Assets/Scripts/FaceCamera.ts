/**
 * Specs Inc. 2026
 * Face Camera component for the Depth Cache Spectacles lens.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindUpdateEvent} from "SnapDecorators.lspkg/decorators"

@component
export class FaceCamera extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">FaceCamera – billboard rotation towards camera</span><br/><span style="color: #94A3B8; font-size: 11px;">Rotates the scene object to face the specified camera each frame.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Camera scene object this object should face each frame")
  camera: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private camTransform: Transform
  private transform: Transform

  onAwake() {
    this.logger = new Logger("FaceCamera", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.transform = this.getTransform()
    this.camTransform = this.camera.getTransform()
  }

  @bindUpdateEvent
  private onUpdate() {
    const worldCameraForward = this.camTransform.right.cross(vec3.up())
    const lookRot = quat.lookAt(worldCameraForward, vec3.up())
    this.transform.setWorldRotation(lookRot)
  }
}
