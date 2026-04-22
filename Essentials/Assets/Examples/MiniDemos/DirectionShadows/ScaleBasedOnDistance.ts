/**
 * Specs Inc. 2026
 * Scale Based On Distance component for the Essentials Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"

@component
export class ScaleBasedOnDistance extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ScaleBasedOnDistance – scale an object based on distance</span><br/><span style="color: #94A3B8; font-size: 11px;">Applies a uniform scale to the target object based on the distance between two reference objects.</span>')
  @ui.separator

  @input
  @hint("The first reference object used to measure distance")
  public startObject: SceneObject

  @input
  @hint("The second reference object used to measure distance")
  public endObject: SceneObject

  @input
  @hint("Minimum scale to apply when at minimum distance")
  public minScale: number = 0.5

  @input
  @hint("Maximum scale to apply when at maximum distance")
  public maxScale: number = 2.0

  @input
  @hint("The scene object whose scale will be adjusted")
  public objectToScale: SceneObject

  @input
  @hint("If true, closer objects are scaled larger; if false, closer objects are smaller")
  public closestIsBigger: boolean = true

  @input
  @hint("Minimum distance that maps to the min/max scale bound")
  public minDistance: number = 0

  @input
  @hint("Maximum distance that maps to the max/min scale bound")
  public maxDistance: number = 100

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private lastScale: number = -1
  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("ScaleBasedOnDistance", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.init()
  }

  private init(): void {
    if (!this.startObject) {
      this.logger.error("Start Object is not set")
      return
    }

    if (!this.endObject) {
      this.logger.error("End Object is not set")
      return
    }

    if (!this.objectToScale) {
      this.logger.error("Object To Scale is not set")
      return
    }

    if (this.minScale > this.maxScale) {
      this.logger.warn("Min Scale is greater than Max Scale. Swapping values.")
      const temp = this.minScale
      this.minScale = this.maxScale
      this.maxScale = temp
    }

    if (this.minDistance > this.maxDistance) {
      this.logger.warn("Min Distance is greater than Max Distance. Swapping values.")
      const temp = this.minDistance
      this.minDistance = this.maxDistance
      this.maxDistance = temp
    }
  }

  @bindUpdateEvent
  private update(): void {
    if (!this.startObject || !this.endObject || !this.objectToScale) {
      return
    }

    const distance = this.calculateDistance(this.startObject, this.endObject)
    const scale = this.calculateScale(distance)

    if (Math.abs(scale - this.lastScale) > 0.001) {
      this.lastScale = scale
      const uniformScale = new vec3(scale, scale, scale)
      this.objectToScale.getTransform().setLocalScale(uniformScale)
    }
  }

  private calculateDistance(obj1: SceneObject, obj2: SceneObject): number {
    const pos1 = obj1.getTransform().getWorldPosition()
    const pos2 = obj2.getTransform().getWorldPosition()

    const dx = pos2.x - pos1.x
    const dy = pos2.y - pos1.y
    const dz = pos2.z - pos1.z

    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  private calculateScale(distance: number): number {
    const clampedDistance = Math.max(this.minDistance, Math.min(this.maxDistance, distance))
    const normalizedDistance = (clampedDistance - this.minDistance) / (this.maxDistance - this.minDistance)

    let scale: number

    if (this.closestIsBigger) {
      scale = this.maxScale - normalizedDistance * (this.maxScale - this.minScale)
    } else {
      scale = this.minScale + normalizedDistance * (this.maxScale - this.minScale)
    }

    return scale
  }
}
