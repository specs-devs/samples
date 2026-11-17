/**
 * SPECS Inc. 2027
 * Snap To Line TS component for the Essentials Glasses lens.
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
  @hint("Color while snapped to the line")
  snappedColor: vec4 = new vec4(0.2, 0.9, 0.4, 1)

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private closestPointOnLine: vec3
  private snapped: boolean | null = null
  private colorMaterial: Material | null = null
  private logger: Logger

  onAwake() {
    this.logger = new Logger("SnapToLineTS", this.enableLogging || this.enableLoggingLifecycle, true)
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
      this.setSnapped(true)
      objectToSnap.getTransform().setWorldPosition(this.closestPointOnLine)
      this.logger.debug(`Snapped to line at distance ${distance.toFixed(3)}`)
    } else {
      this.setSnapped(false)
      if (this.followWhenFar && objectForDistance !== objectToSnap) {
        objectToSnap.getTransform().setWorldPosition(distanceObjectPosition.add(this.followOffset))
      }
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
