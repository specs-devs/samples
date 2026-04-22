/**
 * Specs Inc. 2026
 * Snap To Plane TS component for the Essentials Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"

@component
export class SnapToPlaneTS extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SnapToPlaneTS – snap an object to the closest point on a plane</span><br/><span style="color: #94A3B8; font-size: 11px;">Projects the distance object onto a plane and snaps the target when within snapDistance.</span>')
  @ui.separator

  @input
  @hint("The reference for the plane's position and normal")
  planeTransform: SceneObject

  @input
  @allowUndefined
  @hint("The object that will snap to the plane (defaults to this SceneObject)")
  snappingObject: SceneObject

  @input
  @allowUndefined
  @hint("The object used to measure distance to the plane for snap detection")
  distanceObject: SceneObject

  @input
  @hint("How close the object needs to be to snap to the plane")
  snapDistance: number = 1.0

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private closestPointOnPlane: vec3
  private logger: Logger

  onAwake() {
    this.logger = new Logger("SnapToPlaneTS", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindUpdateEvent
  update() {
    if (!this.planeTransform) {
      this.logger.warn("Plane Transform is not assigned!")
      return
    }

    const objectToSnap = this.snappingObject || this.sceneObject
    const objectForDistance = this.distanceObject || objectToSnap

    const planeTransformObj = this.planeTransform.getTransform()

    const planeRight = planeTransformObj.right
    const planeForward = planeTransformObj.forward

    const planeNormal = planeRight.cross(planeForward).normalize()

    const distanceObjectPosition = objectForDistance.getTransform().getWorldPosition()
    const planePosition = this.planeTransform.getTransform().getWorldPosition()

    this.closestPointOnPlane = this.getClosestPointOnPlane(distanceObjectPosition, planePosition, planeNormal)

    const distance = distanceObjectPosition.distance(this.closestPointOnPlane)

    if (distance <= this.snapDistance) {
      objectToSnap.getTransform().setWorldPosition(this.closestPointOnPlane)
      this.logger.debug(`Snapped to plane at distance ${distance.toFixed(3)}`)
    }
  }

  private getClosestPointOnPlane(point: vec3, planePoint: vec3, planeNormal: vec3): vec3 {
    const pointToPlane = point.sub(planePoint)
    const distanceToPlane = pointToPlane.dot(planeNormal)
    return point.sub(planeNormal.scale(new vec3(distanceToPlane, distanceToPlane, distanceToPlane)))
  }
}
