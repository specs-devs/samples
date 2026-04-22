/**
 * Specs Inc. 2026
 * Face Camera component for the BLE Playground Spectacles lens.
 */
import {bindUpdateEvent} from "SnapDecorators.lspkg/decorators"

@component
export class FaceCamera extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">FaceCamera – camera-facing billboard</span><br/><span style="color: #94A3B8; font-size: 11px;">Rotates this object every frame to face the provided camera using a lookAt rotation.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Camera scene object used as the look-at target")
  camera: SceneObject

  private camTransform: Transform
  private transform: Transform

  onAwake() {
    this.transform = this.getTransform()
    this.camTransform = this.camera.getTransform()
  }

  @bindUpdateEvent
  onUpdate() {
    const worldCameraForward = this.camTransform.right.cross(vec3.up())
    const lookRot = quat.lookAt(worldCameraForward, vec3.up())
    this.transform.setWorldRotation(lookRot)
  }
}
