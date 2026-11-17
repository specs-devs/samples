/**
 * SPECS Inc. 2027
 * Snap To Plane TS component for the Essentials Glasses lens.
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

  @input
  @hint("When the distance object is farther than snapDistance, the snapping object follows it, so you see where it is before it snaps")
  followWhenFar: boolean = true

  @input
  @hint("World offset (cm) from the distance object while following, so the snapping object stays visible next to it")
  followOffset: vec3 = new vec3(0, 0, 0)

  @input
  @allowUndefined
  @hint("Optional visual that changes color when snapped (its material is cloned)")
  snapColorVisual: RenderMeshVisual

  @input
  @widget(new ColorWidget())
  @hint("Color while free")
  freeColor: vec4 = new vec4(1, 1, 1, 1)

  @input
  @widget(new ColorWidget())
  @hint("Color while snapped to the plane")
  snappedColor: vec4 = new vec4(0.2, 0.9, 0.4, 1)

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private closestPointOnPlane: vec3
  private snapped: boolean | null = null
  private colorMaterial: Material | null = null
  private logger: Logger

  onAwake() {
    this.logger = new Logger("SnapToPlaneTS", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    if (this.snapColorVisual && this.snapColorVisual.mainMaterial) {
      this.colorMaterial = this.snapColorVisual.mainMaterial.clone()
      this.snapColorVisual.mainMaterial = this.colorMaterial
    }
  }

  private setSnapped(snapped: boolean) {
    if (snapped === this.snapped) return
    this.snapped = snapped
    if (this.colorMaterial) {
      this.colorMaterial.mainPass.baseColor = snapped ? this.snappedColor : this.freeColor
    }
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
      this.setSnapped(true)
      objectToSnap.getTransform().setWorldPosition(this.closestPointOnPlane)
      this.logger.debug(`Snapped to plane at distance ${distance.toFixed(3)}`)
    } else {
      this.setSnapped(false)
      if (this.followWhenFar && objectForDistance !== objectToSnap) {
        objectToSnap.getTransform().setWorldPosition(distanceObjectPosition.add(this.followOffset))
      }
    }
  }

  private getClosestPointOnPlane(point: vec3, planePoint: vec3, planeNormal: vec3): vec3 {
    const pointToPlane = point.sub(planePoint)
    const distanceToPlane = pointToPlane.dot(planeNormal)
    return point.sub(planeNormal.scale(new vec3(distanceToPlane, distanceToPlane, distanceToPlane)))
  }
}
