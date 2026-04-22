/**
 * Specs Inc. 2026
 * Dot Product Demo TS component for the Essentials Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"

@component
export class DotProductDemoTS extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">DotProductDemoTS – demonstrate dot product and vector operations</span><br/><span style="color: #94A3B8; font-size: 11px;">Changes a material color based on the horizontal angle between the camera and a reference object.</span>')
  @ui.separator

  @input
  @hint("Reference object to check angle against")
  reference!: SceneObject

  @input
  @hint("Material to change color based on facing direction")
  referenceMaterial!: Material

  @input
  @hint("Threshold dot product value for changing color (0-1)")
  thresholdDot: number = 0.95

  @input
  @hint("Threshold angle in degrees for recentering")
  thresholdDotInDegrees: number = 30.0

  @input
  @hint("Camera used for direction checking")
  camera!: Camera

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
    this.logger = new Logger("DotProductDemoTS", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindUpdateEvent
  onUpdate(): void {
    this.changeColorIfNotFacing()
  }

  changeColorIfNotFacing(): void {
    if (!this.camera) return

    const cameraPosition = this.camera.getTransform().getWorldPosition()
    const objectPosition = this.reference.getTransform().getWorldPosition()

    const directionToObject = objectPosition.sub(cameraPosition).normalize()
    const cameraForward = this.camera.getTransform().forward.uniformScale(-1)

    const horizontalDirectionToObject = new vec3(directionToObject.x, 0, directionToObject.z).normalize()
    const horizontalCameraForward = new vec3(cameraForward.x, 0, cameraForward.z).normalize()

    const horizontalDotProduct = horizontalDirectionToObject.dot(horizontalCameraForward)
    const horizontalAngleInDegrees = Math.acos(Math.max(-1, Math.min(1, horizontalDotProduct))) * (180 / Math.PI)

    this.logger.info("Horizontal angle between camera and object: " + horizontalAngleInDegrees.toFixed(2) + "°")

    if (horizontalAngleInDegrees > this.thresholdDotInDegrees) {
      this.referenceMaterial.mainPass.baseColor = new vec4(1, 0, 0, 1)
    } else {
      this.referenceMaterial.mainPass.baseColor = new vec4(0, 0, 1, 1)
    }
  }

  signedAngle(vectorA: vec3, vectorB: vec3, axis: vec3): number {
    const angle = this.angle(vectorA, vectorB)
    const cross = this.crossProduct(vectorA, vectorB)
    const sign = Math.sign(axis.dot(cross))
    return angle * sign
  }

  dotProduct(vectorA: vec3, vectorB: vec3): number {
    return vectorA.dot(vectorB)
  }

  crossProduct(vectorA: vec3, vectorB: vec3): vec3 {
    return vectorA.cross(vectorB)
  }

  angle(vectorA: vec3, vectorB: vec3): number {
    const normalizedA = vectorA.normalize()
    const normalizedB = vectorB.normalize()
    const dot = normalizedA.dot(normalizedB)
    const clampedDot = Math.max(-1, Math.min(1, dot))
    return Math.acos(clampedDot) * (180 / Math.PI)
  }

  reflect(incomingVector: vec3, normal: vec3): vec3 {
    const normalizedNormal = normal.normalize()
    const dotProduct = incomingVector.dot(normalizedNormal)
    return incomingVector.sub(normalizedNormal.uniformScale(2 * dotProduct))
  }

  project(vectorA: vec3, vectorB: vec3): vec3 {
    const normalizedB = vectorB.normalize()
    const projectionLength = vectorA.dot(normalizedB)
    return normalizedB.uniformScale(projectionLength)
  }

  projectOnPlane(vectorA: vec3, normal: vec3): vec3 {
    const projectionOnNormal = this.project(vectorA, normal)
    return vectorA.sub(projectionOnNormal)
  }
}
