/**
 * Specs Inc. 2026
 * Directional World Query component for the Essentials Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"

const WorldQueryModule = require("LensStudio:WorldQueryModule")
const EPSILON = 0.01

@component
export class DirectionalWorldQuery extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">DirectionalWorldQuery – perform directional world hit tests</span><br/><span style="color: #94A3B8; font-size: 11px;">Casts rays in the direction defined by two scene objects and places a marker at the hit point.</span>')
  @ui.separator

  @input
  @hint("Start object defining the ray direction")
  directionStart: SceneObject

  @input
  @hint("End object defining the ray direction")
  directionEnd: SceneObject

  @input
  @hint("Origin point from which the ray is cast into the world")
  rayStart: SceneObject

  @input
  @hint("Object to position at the detected hit location")
  objectHitPoint: SceneObject

  @input
  @hint("Maximum length of the ray cast in world units")
  rayLength: number = 100.0

  @input
  @hint("Whether to enable hit-test filtering (recommended for surfaces)")
  filterEnabled: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private hitTestSession: HitTestSession
  private direction: vec3
  private isDirectionSet: boolean = false
  private logger: Logger

  onAwake() {
    this.logger = new Logger("DirectionalWorldQuery", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.logger.info("DirectionalWorldQuery: Initializing...")

    this.hitTestSession = this.createHitTestSession(this.filterEnabled)

    if (!this.directionStart || !this.directionEnd || !this.rayStart) {
      this.logger.error("Please set directionStart, directionEnd, and rayStart inputs")
      return
    }

    if (!this.objectHitPoint) {
      this.logger.error("Please set objectHitPoint input")
      return
    }

    const visual = this.objectHitPoint.getComponent("Component.RenderMeshVisual")
    if (!visual) {
      this.logger.warn("objectHitPoint does not have a RenderMeshVisual component. It may not be visible when placed.")
    }

    this.logger.info("DirectionalWorldQuery: Initialization complete")
  }

  createHitTestSession(filterEnabled) {
    const options = HitTestSessionOptions.create()
    options.filter = filterEnabled

    const session = WorldQueryModule.createHitTestSessionWithOptions(options)
    return session
  }

  updateDirection() {
    const startPos = this.directionStart.getTransform().getWorldPosition()
    const endPos = this.directionEnd.getTransform().getWorldPosition()

    this.direction = endPos.sub(startPos).normalize()
    this.isDirectionSet = true

    if (this.direction.y > 0) {
      this.direction = new vec3(-this.direction.x, -this.direction.y, -this.direction.z)
      this.logger.debug("Direction inverted to point downward")
    }

    this.logger.debug(
      "Direction: " + this.direction.toString() + " (from " + startPos.toString() + " to " + endPos.toString() + ")"
    )
  }

  onHitTestResult(results) {
    if (results === null) {
      this.logger.debug("DirectionalWorldQuery: No hit detected")
      this.objectHitPoint.enabled = false
    } else {
      this.logger.debug("DirectionalWorldQuery: Hit detected at " + results.position.toString())

      const hitPosition = results.position
      const hitNormal = results.normal

      let lookDirection
      if (1 - Math.abs(hitNormal.normalize().dot(vec3.up())) < EPSILON) {
        lookDirection = vec3.forward()
      } else {
        lookDirection = hitNormal.cross(vec3.up())
      }

      const toRotation = quat.lookAt(lookDirection, hitNormal)

      this.objectHitPoint.getTransform().setWorldPosition(hitPosition)
      this.objectHitPoint.getTransform().setWorldRotation(toRotation)
      this.objectHitPoint.enabled = true

      this.logger.debug("Hit position: " + hitPosition.toString())
      this.logger.debug("Hit normal: " + hitNormal.toString())
      this.logger.debug("Object placed at: " + this.objectHitPoint.getTransform().getWorldPosition().toString())
    }
  }

  performWorldQuery() {
    if (!this.isDirectionSet) {
      this.updateDirection()
    }

    const rayStart = this.rayStart.getTransform().getWorldPosition()

    const scaledDirection = new vec3(
      this.direction.x * this.rayLength,
      this.direction.y * this.rayLength,
      this.direction.z * this.rayLength
    )
    const rayEnd = rayStart.add(scaledDirection)

    this.logger.debug("Ray: from " + rayStart.toString() + " to " + rayEnd.toString())

    const tryRayLengths = [this.rayLength, this.rayLength * 0.5, this.rayLength * 0.1, this.rayLength * 2]
    let hitDetected = false

    this.hitTestSession.hitTest(rayStart, rayEnd, (results) => {
      if (results !== null) {
        hitDetected = true
        this.onHitTestResult(results)
      } else {
        this.logger.debug("No hit detected with primary ray length, trying alternatives...")
      }
    })

    if (!hitDetected) {
      for (let i = 0; i < tryRayLengths.length && !hitDetected; i++) {
        const length = tryRayLengths[i]
        if (length === this.rayLength) continue

        const altScaledDirection = new vec3(
          this.direction.x * length,
          this.direction.y * length,
          this.direction.z * length
        )
        const altRayEnd = rayStart.add(altScaledDirection)

        this.logger.debug("Trying alternative ray length: " + length)
        this.logger.debug("Alternative ray: from " + rayStart.toString() + " to " + altRayEnd.toString())

        this.hitTestSession.hitTest(rayStart, altRayEnd, this.onHitTestResult.bind(this))
      }
    }
  }

  @bindUpdateEvent
  onUpdate() {
    this.updateDirection()
    this.performWorldQuery()
  }

  onDestroy() {
  }
}
