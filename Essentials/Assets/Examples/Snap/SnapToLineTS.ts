/**
 * Specs Inc. 2026
 * Snap To Line TS component for the Essentials Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"

@component
export class SnapToLineTS extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SnapToLineTS – snap an object to the closest point on a line</span><br/><span style="color: #94A3B8; font-size: 11px;">Projects the distance object onto the line and snaps the target when within snapDistance.</span>')
  @ui.separator

  @input
  @hint("The start point of the line")
  lineStart: SceneObject

  @input
  @hint("The end point of the line")
  lineEnd: SceneObject

  @input
  @allowUndefined
  @hint("The object that will snap to the line (defaults to this SceneObject)")
  snappingObject: SceneObject

  @input
  @allowUndefined
  @hint("The object used to measure distance to the line for snap detection")
  distanceObject: SceneObject

  @input
  @hint("How close the object needs to be to snap to the line")
  snapDistance: number = 1.0

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private closestPointOnLine: vec3
  private logger: Logger

  onAwake() {
    this.logger = new Logger("SnapToLineTS", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindUpdateEvent
  update() {
    if (!this.lineStart || !this.lineEnd) {
      this.logger.warn("Line Start or Line End is not assigned!")
      return
    }

    const objectToSnap = this.snappingObject || this.sceneObject
    const objectForDistance = this.distanceObject || objectToSnap

    const distanceObjectPosition = objectForDistance.getTransform().getWorldPosition()
    const lineStartPosition = this.lineStart.getTransform().getWorldPosition()
    const lineEndPosition = this.lineEnd.getTransform().getWorldPosition()

    this.closestPointOnLine = this.getClosestPointOnLine(distanceObjectPosition, lineStartPosition, lineEndPosition)

    const distance = distanceObjectPosition.distance(this.closestPointOnLine)

    if (distance <= this.snapDistance) {
      objectToSnap.getTransform().setWorldPosition(this.closestPointOnLine)
      this.logger.debug(`Snapped to line at distance ${distance.toFixed(3)}`)
    }
  }

  private getClosestPointOnLine(point: vec3, lineStart: vec3, lineEnd: vec3): vec3 {
    const lineDirection = lineEnd.sub(lineStart)
    const lineLength = lineDirection.length
    const normalizedDirection = lineDirection.normalize()

    const startToPoint = point.sub(lineStart)
    const projectionLength = startToPoint.dot(normalizedDirection)

    const clampedProjection = Math.max(0, Math.min(projectionLength, lineLength))

    return lineStart.add(normalizedDirection.scale(new vec3(clampedProjection, clampedProjection, clampedProjection)))
  }
}
