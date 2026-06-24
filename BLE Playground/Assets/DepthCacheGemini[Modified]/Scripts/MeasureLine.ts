/**
 * Specs Inc. 2026
 * Measure Line component for the BLE Playground Spectacles lens.
 */
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class MeasureLine extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MeasureLine – world-space measurement line renderer</span><br/><span style="color: #94A3B8; font-size: 11px;">Draws a line between two world-space points and displays the distance in the provided label.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("RenderMeshVisual that represents the line segment between two points")
  lineRenderer: RenderMeshVisual

  @input
  @hint("Text component that shows the measured distance between the two points")
  label: Text

  @input
  @hint("Scale factor applied to the line mesh height to match the world-space length")
  lineScale: number = 1.0

  @input
  @hint("Whether the measurement widget should be visible on start")
  startVisible: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private pointA: vec3 = vec3.zero()
  private pointB: vec3 = vec3.zero()

  onAwake() {
    this.logger = new Logger("MeasureLine", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.setVisible(this.startVisible)
  }

  setVisible(visible: boolean) {
    this.sceneObject.enabled = visible
  }

  setPoints(pointA: vec3, pointB: vec3) {
    this.pointA = pointA
    this.pointB = pointB
    this.updateVisual()
  }

  private updateVisual() {
    const midPoint = this.pointA.add(this.pointB).uniformScale(0.5)
    const direction = this.pointB.sub(this.pointA)
    const distance = direction.length
    const normalizedDir = direction.normalize()
    const rotation = quat.rotationFromTo(vec3.up(), normalizedDir)

    this.getTransform().setWorldPosition(midPoint)
    this.getTransform().setWorldRotation(rotation)
    this.getTransform().setWorldScale(new vec3(1, distance * this.lineScale, 1))

    const distanceCm = distance * 100
    this.logger.debug("Distance: " + distanceCm.toFixed(1) + "cm")
    this.label.text = distanceCm.toFixed(1) + "cm"
  }
}
