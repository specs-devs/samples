/**
 * Specs Inc. 2026
 * Smart Tether component for the SnapML Starter Spectacles lens.
 */
import {bindStartEvent, bindUpdateEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

/**
 * Tethers content to a target, repositioning when it moves too far away
 * or when the angle between target's forward and direction to object exceeds threshold.
 */
@component
export class SmartTether extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SmartTether – smart content tether</span><br/><span style="color: #94A3B8; font-size: 11px;">Keeps content within distance thresholds of a target, smoothly repositioning as needed.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Target</span>')
  @input
  @hint("Scene object this content is tethered to (typically the camera)")
  target!: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Thresholds</span>')
  @input
  @hint("Minimum vertical movement to recalculate position")
  verticalDistanceFromTarget: number = 0.1

  @input
  @hint("Minimum horizontal movement to recalculate position")
  horizontalDistanceFromTarget: number = 0.1

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Rotation</span>')
  @input
  @hint("Should the content rotate and reposition with the target")
  reorientDuringTargetRotation: boolean = true

  @input
  @hint("Flatten Y-axis rotation during target rotation")
  flattenDuringTargetRotation: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Offsets</span>')
  @input
  @hint("Offset for tethering the content in relation to the target")
  offset: vec3 = new vec3(0, 0, 0)

  @input
  @hint("Offset applied when no detected object is present")
  offsetWithoutDetectedObject: vec3 = new vec3(0, 0, 0)

  @input
  @hint("Offset applied when a detected object is present")
  offsetWithDetectedObject: vec3 = new vec3(0, 0, 0)

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Smoothing</span>')
  @input
  @hint("Lerp speed for smooth movement")
  lerpSpeed: number = 5.0

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private _targetPosition: vec3 = new vec3(0, 0, 0)
  private _currentAngle: number = 0
  private _flatAngle: number = 0
  private _targetDir: vec3 = new vec3(0, 0, 0)
  private _flatForward: vec3 = new vec3(0, 0, 0)

  onAwake(): void {
    this.logger = new Logger("SmartTether", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    if (!this.target) {
      this.logger.warn("No target set for Tether - please set a target object")
      return
    }
    this._targetPosition = this.calculateNewTargetPosition()
  }

  @bindUpdateEvent
  onUpdate(): void {
    if (!this.target) return

    this._currentAngle = this.calculateAngle()
    this._flatAngle = this.calculateFlatAngle()

    if (this.shouldReposition()) {
      this._targetPosition = this.calculateNewTargetPosition()
    }

    this.updateContentPosition()
  }

  private calculateNewTargetPosition(): vec3 {
    const targetTransform = this.target.getTransform()
    const targetPos = targetTransform.getWorldPosition()

    if (this.reorientDuringTargetRotation) {
      if (this.flattenDuringTargetRotation) {
        const targetRotation = targetTransform.getWorldRotation()

        const forward = this.getForwardVector(targetRotation)
        const flattenedForward = this.normalizeVector(new vec3(forward.x, 0, forward.z))

        const right = this.getRightVector(targetRotation)
        const flattenedRight = this.normalizeVector(new vec3(right.x, 0, right.z))

        return new vec3(
          targetPos.x + flattenedRight.x * this.offset.x + this.offset.y * 0 + flattenedForward.x * this.offset.z,
          targetPos.y + flattenedRight.y * this.offset.x + this.offset.y * 1 + flattenedForward.y * this.offset.z,
          targetPos.z + flattenedRight.z * this.offset.x + this.offset.y * 0 + flattenedForward.z * this.offset.z
        )
      } else {
        const targetRot = targetTransform.getWorldRotation()
        const rotatedOffset = this.rotateVectorByQuaternion(this.offset, targetRot)
        return new vec3(targetPos.x + rotatedOffset.x, targetPos.y + rotatedOffset.y, targetPos.z + rotatedOffset.z)
      }
    }

    return new vec3(targetPos.x + this.offset.x, targetPos.y + this.offset.y, targetPos.z + this.offset.z)
  }

  private shouldReposition(): boolean {
    const myPos = this.sceneObject.getTransform().getWorldPosition()
    const targetPos = this.target.getTransform().getWorldPosition()

    const toTarget = new vec3(myPos.x - targetPos.x, myPos.y - targetPos.y, myPos.z - targetPos.z)

    const verticalDistance = Math.abs(toTarget.y)
    const horizontalDistance = Math.sqrt(toTarget.x * toTarget.x + toTarget.z * toTarget.z)

    return verticalDistance > this.verticalDistanceFromTarget || horizontalDistance > this.horizontalDistanceFromTarget
  }

  private updateContentPosition(): void {
    const myTransform = this.sceneObject.getTransform()
    const currentPos = myTransform.getWorldPosition()

    const newPos = vec3.lerp(currentPos, this._targetPosition, this.lerpSpeed * getDeltaTime())
    myTransform.setWorldPosition(newPos)
  }

  public updateOffsetWithDetectedObject(): void {
    this.logger.info("updateOffsetWithDetectedObject")
    this.offset = this.offsetWithDetectedObject
  }

  public updateOffsetWithoutDetectedObject(): void {
    this.logger.info("updateOffsetWithoutDetectedObject")
    this.offset = this.offsetWithoutDetectedObject
  }

  private calculateFlatAngle(): number {
    const myPos = this.sceneObject.getTransform().getWorldPosition()
    const targetPos = this.target.getTransform().getWorldPosition()

    this._targetDir = new vec3(
      myPos.x - targetPos.x,
      0,
      myPos.z - targetPos.z
    )

    const targetRotation = this.target.getTransform().getWorldRotation()
    const forward = this.getForwardVector(targetRotation)
    this._flatForward = this.normalizeVector(new vec3(forward.x, 0, forward.z))

    return this.signedAngle(this._targetDir, this._flatForward)
  }

  private signedAngle(from: vec3, to: vec3): number {
    const normalizedFrom = this.normalizeVector(from)
    const normalizedTo = this.normalizeVector(to)

    const dot = this.dotProduct(normalizedFrom, normalizedTo)
    let angle = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI)

    const cross = this.crossProduct(normalizedFrom, normalizedTo)
    if (cross.y < 0) angle = -angle

    return angle
  }

  private crossProduct(v1: vec3, v2: vec3): vec3 {
    return new vec3(v1.y * v2.z - v1.z * v2.y, v1.z * v2.x - v1.x * v2.z, v1.x * v2.y - v1.y * v2.x)
  }

  private calculateAngle(): number {
    const myTransform = this.sceneObject.getTransform()
    const targetTransform = this.target.getTransform()

    const myForward = this.getForwardVector(myTransform.getWorldRotation())
    const targetForward = this.getForwardVector(targetTransform.getWorldRotation())

    const dot = this.dotProduct(myForward, targetForward)
    const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI)

    return angle
  }

  private getForwardVector(rotation: quat): vec3 {
    return this.rotateVectorByQuaternion(new vec3(0, 0, 1), rotation)
  }

  private getRightVector(rotation: quat): vec3 {
    return this.rotateVectorByQuaternion(new vec3(1, 0, 0), rotation)
  }

  private dotProduct(v1: vec3, v2: vec3): number {
    return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z
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

  private quaternionToEulerAngles(q: quat): vec3 {
    const x = q.x,
      y = q.y,
      z = q.z,
      w = q.w

    const sinr_cosp = 2 * (w * x + y * z)
    const cosr_cosp = 1 - 2 * (x * x + y * y)
    const roll = Math.atan2(sinr_cosp, cosr_cosp) * (180 / Math.PI)

    let pitch
    const sinp = 2 * (w * y - z * x)
    if (Math.abs(sinp) >= 1) {
      pitch = Math.sign(sinp) * 90
    } else {
      pitch = Math.asin(sinp) * (180 / Math.PI)
    }

    const siny_cosp = 2 * (w * z + x * y)
    const cosy_cosp = 1 - 2 * (y * y + z * z)
    const yaw = Math.atan2(siny_cosp, cosy_cosp) * (180 / Math.PI)

    return new vec3(roll, pitch, yaw)
  }

  private eulerAnglesToQuaternion(pitch: number, yaw: number, roll: number): quat {
    const pitchRad = pitch * (Math.PI / 180)
    const yawRad = yaw * (Math.PI / 180)
    const rollRad = roll * (Math.PI / 180)

    const cy = Math.cos(yawRad * 0.5)
    const sy = Math.sin(yawRad * 0.5)
    const cp = Math.cos(pitchRad * 0.5)
    const sp = Math.sin(pitchRad * 0.5)
    const cr = Math.cos(rollRad * 0.5)
    const sr = Math.sin(rollRad * 0.5)

    const w = cr * cp * cy + sr * sp * sy
    const x = sr * cp * cy - cr * sp * sy
    const y = cr * sp * cy + sr * cp * sy
    const z = cr * cp * sy - sr * sp * cy

    return new quat(x, y, z, w)
  }

  private normalizeVector(v: vec3): vec3 {
    const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
    if (length < 0.0001) {
      return new vec3(0, 0, 0)
    }
    return new vec3(v.x / length, v.y / length, v.z / length)
  }
}
