/**
 * Specs Inc. 2026
 * Rotate Screen Transform component for the BLE Playground Spectacles lens.
 */
@component
export class RotateScreenTransform extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">RotateScreenTransform – on-demand screen transform rotator</span><br/><span style="color: #94A3B8; font-size: 11px;">Rotates a ScreenTransform continuously only while startRotate() is active.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("ScreenTransform component to rotate")
  screenTransform: ScreenTransform

  private updateEvent: UpdateEvent
  private startRotateTime = 0

  onAwake() {
    this.updateEvent = this.createEvent("UpdateEvent")
    this.updateEvent.bind(() => this.onUpdate())
    this.updateEvent.enabled = false
  }

  onUpdate() {
    const rotation = quat.angleAxis(getTime() - this.startRotateTime, vec3.back())
    this.screenTransform.rotation = rotation
  }

  startRotate() {
    this.startRotateTime = getTime()
    this.updateEvent.enabled = true
  }

  endRotate() {
    this.updateEvent.enabled = false
    this.screenTransform.rotation = quat.quatIdentity()
  }
}
