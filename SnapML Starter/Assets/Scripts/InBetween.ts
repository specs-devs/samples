/**
 * Specs Inc. 2026
 * In Between component for the SnapML Starter Spectacles lens.
 */
import {bindStartEvent, bindUpdateEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

/**
 * Utility for calculating positions and rotations between two objects.
 */
@component
export class InBetween extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">InBetween – midpoint transform utility</span><br/><span style="color: #94A3B8; font-size: 11px;">Positions and orients this object between two target scene objects each frame.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Targets</span>')
  @input
  @hint("First target for position/rotation calculation")
  target1!: SceneObject

  @input
  @hint("Second target for position/rotation calculation")
  target2!: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @input
  @hint("Apply position between targets")
  applyPosition: boolean = true

  @input
  @hint("Apply rotation between targets")
  applyRotation: boolean = true

  @input
  @hint("Position blend factor (0 = target1, 1 = target2, 0.5 = halfway)")
  @widget(new SliderWidget(0, 1, 0.01))
  positionBlend: number = 0.5

  @input
  @hint("Rotation blend factor (0 = target1, 1 = target2, 0.5 = halfway)")
  @widget(new SliderWidget(0, 1, 0.01))
  rotationBlend: number = 0.5

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("InBetween", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    if (!this.target1 || !this.target2) {
      this.logger.warn("Both targets must be set for InBetweenUtility")
    }
  }

  @bindUpdateEvent
  onUpdate(): void {
    if (!this.target1 || !this.target2) return

    const transform = this.sceneObject.getTransform()

    if (this.applyPosition) {
      const newPosition = this.getInBetweenPosition(this.target1, this.target2, this.positionBlend)
      transform.setWorldPosition(newPosition)
    }

    if (this.applyRotation) {
      const target1Forward = this.getForwardVector(this.target1)
      const target2Forward = this.getForwardVector(this.target2)

      const newRotation = this.getInBetweenRotation(target1Forward, target2Forward, this.rotationBlend)
      transform.setWorldRotation(newRotation)
    }
  }

  getInBetweenPosition(a: SceneObject, b: SceneObject, blend: number = 0.5): vec3 {
    if (!a || !b) {
      this.logger.warn("Can't calculate in-between position - one or both objects are null")
      return new vec3(0, 0, 0)
    }

    const posA = a.getTransform().getWorldPosition()
    const posB = b.getTransform().getWorldPosition()

    return vec3.lerp(posA, posB, blend)
  }

  getInBetweenRotationFromTransforms(a: SceneObject, b: SceneObject, blend: number = 0.5): quat {
    if (!a || !b) {
      this.logger.warn("Can't calculate in-between rotation - one or both objects are null")
      return new quat(0, 0, 0, 1)
    }

    const forwardA = this.getForwardVector(a)
    const forwardB = this.getForwardVector(b)

    return this.getInBetweenRotation(forwardA, forwardB, blend)
  }

  getInBetweenRotation(directionA: vec3, directionB: vec3, blend: number = 0.5): quat {
    const normalizedA = this.normalizeVector(directionA)
    const normalizedB = this.normalizeVector(directionB)

    const rotationA = this.lookRotation(normalizedA)
    const rotationB = this.lookRotation(normalizedB)

    return quat.slerp(rotationA, rotationB, blend)
  }

  private getForwardVector(obj: SceneObject): vec3 {
    if (!obj) return new vec3(0, 0, 1)

    const transform = obj.getTransform()
    const worldRotation = transform.getWorldRotation()

    const forward = new vec3(0, 0, 1)
    return this.rotateVectorByQuaternion(forward, worldRotation)
  }

  private rotateVectorByQuaternion(vector: vec3, rotation: quat): vec3 {
    const x = rotation.x
    const y = rotation.y
    const z = rotation.z
    const w = rotation.w

    const ix = w * vector.x + y * vector.z - z * vector.y
    const iy = w * vector.y + z * vector.x - x * vector.z
    const iz = w * vector.z + x * vector.y - y * vector.x
    const iw = -x * vector.x - y * vector.y - z * vector.z

    return new vec3(
      ix * w + iw * -x + iy * -z - iz * -y,
      iy * w + iw * -y + iz * -x - ix * -z,
      iz * w + iw * -z + ix * -y - iy * -x
    )
  }

  private lookRotation(direction: vec3): quat {
    const up = new vec3(0, 1, 0)
    const normalizedDirection = this.normalizeVector(direction)

    if (Math.abs(normalizedDirection.x) < 0.0001 && Math.abs(normalizedDirection.z) < 0.0001) {
      if (normalizedDirection.y > 0) {
        return quat.fromEulerAngles(Math.PI, 0, 0)
      } else {
        return new quat(0, 0, 0, 1)
      }
    }

    const right = this.normalizeVector(this.crossProduct(up, normalizedDirection))
    const newUp = this.crossProduct(normalizedDirection, right)
    const trace = right.x + newUp.y + normalizedDirection.z

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1.0)
      return new quat(
        (newUp.z - normalizedDirection.y) * s,
        (normalizedDirection.x - right.z) * s,
        (right.y - newUp.x) * s,
        0.25 / s
      )
    } else {
      if (right.x > newUp.y && right.x > normalizedDirection.z) {
        const s = 2.0 * Math.sqrt(1.0 + right.x - newUp.y - normalizedDirection.z)
        return new quat(
          0.25 * s,
          (right.y + newUp.x) / s,
          (normalizedDirection.x + right.z) / s,
          (newUp.z - normalizedDirection.y) / s
        )
      } else if (newUp.y > normalizedDirection.z) {
        const s = 2.0 * Math.sqrt(1.0 + newUp.y - right.x - normalizedDirection.z)
        return new quat(
          (right.y + newUp.x) / s,
          0.25 * s,
          (newUp.z + normalizedDirection.y) / s,
          (normalizedDirection.x - right.z) / s
        )
      } else {
        const s = 2.0 * Math.sqrt(1.0 + normalizedDirection.z - right.x - newUp.y)
        return new quat(
          (normalizedDirection.x + right.z) / s,
          (newUp.z + normalizedDirection.y) / s,
          0.25 * s,
          (right.y - newUp.x) / s
        )
      }
    }
  }

  private crossProduct(a: vec3, b: vec3): vec3 {
    return new vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
  }

  private normalizeVector(vector: vec3): vec3 {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z)

    if (length < 0.0001) {
      return new vec3(0, 0, 1)
    }

    return new vec3(vector.x / length, vector.y / length, vector.z / length)
  }
}
