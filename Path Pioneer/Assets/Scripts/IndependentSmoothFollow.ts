/**
 * Specs Inc. 2026
 * Smooth Follow component for the Path Pioneer Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"
import {setTimeout} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils"
import {clamp, DegToRad, smoothDamp, smoothDampAngle} from "SpectaclesInteractionKit.lspkg/Utils/mathUtils"
import {validate} from "SpectaclesInteractionKit.lspkg/Utils/validate"

/**
 * SmoothFollow is a body dynamic behavior which when applied to a scene object,
 * makes it stay in the same relative horizontal position and distance to the
 * user's field of view as they turn their head left and right and move around.
 * It doesn't affect the positioning of the scene object when the user looks up
 * and down or changes elevation. Interpolation is handled by a spring-damper
 * in cylindrical coordinates.
 */
@component
export class SmoothFollow extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SmoothFollow – spring-based UI follower</span><br/><span style="color: #94A3B8; font-size: 11px;">Keeps attached UI at a comfortable head-relative position using a spring-damper.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Main camera whose transform is used as the follow anchor")
  mainCamera: Camera

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private cameraTransform: Transform = null
  private tr: Transform = null
  private fieldOfView: number = 26
  private visibleWidth: number = 20
  private minDistance: number = 25
  private maxDistance: number = 110
  private minElevation: number = -40
  private maxElevation: number = 40
  private translationTime: number = 0.35
  private rotationTime: number = 0.55

  private target: vec3
  private velocity: vec3
  private omega: number
  private heading: number
  private initialRot: quat
  private dragging: boolean

  constructor() {
    super()
    this.logger = new Logger("SmoothFollow", false, true)
    this.tr = this.sceneObject.getTransform()
    validate(this.tr)

    this.cameraTransform = this.mainCamera.getTransform()

    this.target = vec3.zero()
    this.velocity = vec3.zero()
    this.omega = 0
    this.heading = 0
    this.dragging = false
    this.initialRot = this.tr.getLocalRotation()
    this.heading = this.cameraHeading

    this.worldRot = quat.angleAxis(this.heading, vec3.up()).multiply(this.initialRot)
    this.resize(
      // hardcoding for no container
      16 + //this.frame.innerSize.x +
        4 +
        2 + //this.frame.border * 2 +
        0 //this.frame.constantPadding.x
    )
    setTimeout(() => {
      this.clampPosition()
    }, 32)
  }

  startDragging(): void {
    this.dragging = true
  }

  finishDragging(): void {
    this.dragging = false
    this.clampPosition()
  }

  resize(visibleWidth: number): void {
    this.visibleWidth = visibleWidth
    this.clampPosition()
  }

  private clampPosition(): void {
    if (this.dragging) return

    this.target = this.cartesianToCylindrical(this.worldToBody(this.worldPos))

    this.target.z = clamp(this.target.z, this.minDistance, this.maxDistance)
    this.target.z = Math.max(this.target.z, (1.1 * this.visibleWidth) / 2 / Math.tan((this.fieldOfView / 2) * DegToRad))
    this.target.y = clamp(this.target.y, this.minElevation, this.maxElevation)
    const dist = new vec2(this.target.y, this.target.z).length
    const halfFov = Math.atan(
      (Math.tan((this.fieldOfView / 2) * DegToRad) * dist - this.visibleWidth / 2) / this.target.z
    )
    this.target.x = clamp(this.target.x, -halfFov, halfFov)
    this.velocity = vec3.zero()
    this.omega = 0
  }

  @bindUpdateEvent
  onUpdate() {
    if (!this.dragging) {
      const pos = this.cartesianToCylindrical(this.worldToBody(this.worldPos))

      // y is special because target elevation is leashed between a range of values,
      // rather than how x and z work where they are leashed to a single value.
      this.target.y = clamp(pos.y, this.minElevation, this.maxElevation)
      ;[pos.x, this.velocity.x] = smoothDamp(
        pos.x,
        this.target.x,
        this.velocity.x,
        this.translationTime,
        getDeltaTime()
      )
      ;[pos.y, this.velocity.y] = smoothDamp(
        pos.y,
        this.target.y,
        this.velocity.y,
        this.translationTime,
        getDeltaTime()
      )
      ;[pos.z, this.velocity.z] = smoothDamp(
        pos.z,
        this.target.z,
        this.velocity.z,
        this.translationTime,
        getDeltaTime()
      )
      this.worldPos = this.bodyToWorld(this.cylindricalToCartesian(pos))
      ;[this.heading, this.omega] = smoothDampAngle(
        this.heading,
        this.cameraHeading,
        this.omega,
        this.rotationTime,
        getDeltaTime()
      )

      // force billboard
      this.worldRot = quat.lookAt(this.cameraPos.sub(this.worldPos).normalize(), vec3.up()).multiply(this.initialRot)
    }
  }

  private cartesianToCylindrical(v: vec3): vec3 {
    return new vec3(Math.atan2(-v.x, -v.z), v.y, Math.sqrt(v.x * v.x + v.z * v.z))
  }

  private cylindricalToCartesian(v: vec3): vec3 {
    return new vec3(v.z * -Math.sin(v.x), v.y, v.z * -Math.cos(v.x))
  }

  private worldToBody(v: vec3): vec3 {
    return quat.angleAxis(-this.cameraHeading, vec3.up()).multiplyVec3(v.sub(this.cameraPos))
  }

  private bodyToWorld(v: vec3): vec3 {
    return quat.angleAxis(this.cameraHeading, vec3.up()).multiplyVec3(v).add(this.cameraPos)
  }

  private get cameraHeading(): number {
    const forward = this.cameraTransform.getWorldTransform().multiplyDirection(new vec3(0, 0, -1))
    return Math.atan2(-forward.x, -forward.z)
  }

  private get cameraPos(): vec3 {
    return this.cameraTransform.getWorldPosition()
  }

  private get worldRot(): quat {
    validate(this.tr)
    return this.tr.getWorldRotation()
  }

  private set worldRot(value: quat) {
    validate(this.tr)
    this.tr.setWorldRotation(value)
  }

  private get worldPos(): vec3 {
    validate(this.tr)
    return this.tr.getWorldPosition()
  }

  private set worldPos(value: vec3) {
    validate(this.tr)

    // Forcing value to our camera y position.
    value.y = this.cameraTransform.getWorldPosition().y

    this.tr.setWorldPosition(value)
  }
}
