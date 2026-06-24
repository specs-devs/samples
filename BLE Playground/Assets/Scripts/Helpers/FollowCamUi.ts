/**
 * Specs Inc. 2026
 * Follow Cam Ui component for the BLE Playground Spectacles lens.
 */
import {bindUpdateEvent} from "SnapDecorators.lspkg/decorators"

@component
export class FollowCamUi extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">FollowCamUi – camera-following UI anchor</span><br/><span style="color: #94A3B8; font-size: 11px;">Smoothly lerps position and rotation to stay in front of and slightly below the camera.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Camera scene object used as the follow target")
  cam: SceneObject

  private tr: Transform
  private camTr: Transform

  private uiCamDistance = 50
  private uiCamHeight = -9

  onAwake() {
    this.tr = this.getTransform()
    this.camTr = this.cam.getTransform()
  }

  @bindUpdateEvent
  private onUpdate() {
    const camPos = this.camTr.getWorldPosition()
    let desiredPosition = camPos.add(this.camTr.forward.uniformScale(-this.uiCamDistance))
    desiredPosition = desiredPosition.add(this.camTr.up.uniformScale(this.uiCamHeight))
    this.tr.setWorldPosition(vec3.lerp(this.tr.getWorldPosition(), desiredPosition, getDeltaTime() * 10))
    const desiredRotation = quat.lookAt(this.camTr.forward, vec3.up())
    this.tr.setWorldRotation(quat.slerp(this.tr.getWorldRotation(), desiredRotation, getDeltaTime() * 10))
  }
}
