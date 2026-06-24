/**
 * Specs Inc. 2026
 * Surface Detection component for the SnapML Starter Spectacles lens.
 */
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class SurfaceDetection extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SurfaceDetection – world surface hit-test calibration</span><br/><span style="color: #94A3B8; font-size: 11px;">Detects horizontal or vertical surfaces and aligns a visual object to them.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @allowUndefined
  @hint("Scene object for the camera used to cast the hit-test ray")
  camObj: SceneObject

  @input
  @allowUndefined
  @hint("Scene object that visualizes the detected surface position")
  visualObj: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @input
  @allowUndefined
  @hint("Set to true if the surface you want to detect is vertical")
  vertical: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private worldQueryModule = require("LensStudio:WorldQueryModule") as WorldQueryModule

  private readonly MAX_HIT_DISTANCE = 1000
  private readonly MIN_HIT_DISTANCE = 50
  private readonly CALIBRATION_FRAMES = 30
  private readonly MOVE_DISTANCE_THRESHOLD = 5
  private readonly VERTICAL_MIN_MOVE_THRESHOLD = 1.0
  private readonly DEFAULT_SCREEN_DISTANCE = 200
  private readonly SPEED = 10
  private readonly VERTICAL_SMOOTHING = 0.85

  private camTrans
  private visualTrans

  private calibrationPosition = vec3.zero()
  private calibrationRotation = quat.quatIdentity()

  private desiredPosition = vec3.zero()
  private desiredRotation = quat.quatIdentity()
  private smoothedPosition = vec3.zero()
  private isVerticalSurface = false
  private lastValidPosition = vec3.zero()

  private hitTestSession = null
  private updateEvent = null

  private history = []
  private calibrationFrames = 0

  private onGroundFoundCallback = null

  onAwake() {
    this.logger = new Logger("SurfaceDetection", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    if (!this.camObj) {
      this.logger.error("Please set Camera Obj input")
      return
    }
    this.camTrans = this.camObj.getTransform()
    this.visualTrans = this.visualObj.getTransform()
    this.visualObj.enabled = false

    try {
      const options = HitTestSessionOptions.create()
      options.filter = true
      this.hitTestSession = this.worldQueryModule.createHitTestSessionWithOptions(options)
    } catch (e) {
      this.logger.error(String(e))
    }
  }

  @bindStartEvent
  private onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.setDefaultPosition()
  }

  startGroundCalibration(callback: (pos: vec3, rot: quat) => void) {
    this.setDefaultPosition()
    this.hitTestSession?.start()
    this.visualObj.enabled = true
    this.history = []
    this.calibrationFrames = 0
    this.onGroundFoundCallback = callback
    this.updateEvent = this.createEvent("UpdateEvent")
    this.updateEvent.bind(() => {
      this.update()
    })
  }

  private setDefaultPosition() {
    this.desiredPosition = this.camTrans
      .getWorldPosition()
      .add(this.camTrans.forward.uniformScale(-this.DEFAULT_SCREEN_DISTANCE))
    this.desiredRotation = this.camTrans.getWorldRotation()
    this.visualTrans.setWorldPosition(this.desiredPosition)
    this.visualTrans.setWorldRotation(this.desiredRotation)
  }

  private update() {
    const rayDirection = this.camTrans.forward
    rayDirection.y += 0.1
    const camPos = this.camTrans.getWorldPosition()
    const rayStart = camPos.add(rayDirection.uniformScale(-this.MIN_HIT_DISTANCE))
    const rayEnd = camPos.add(rayDirection.uniformScale(-this.MAX_HIT_DISTANCE))
    this.hitTestSession.hitTest(rayStart, rayEnd, (hitTestResult) => {
      this.onHitTestResult(hitTestResult)
    })
  }

  private onHitTestResult(hitTestResult) {
    let foundPosition = vec3.zero()
    let foundNormal = vec3.zero()
    if (hitTestResult != null) {
      foundPosition = hitTestResult.position
      foundNormal = hitTestResult.normal
    }
    this.updateCalibration(foundPosition, foundNormal)
  }

  private updateCalibration(foundPosition: vec3, foundNormal: vec3) {
    const currPosition = this.visualTrans.getWorldPosition()
    const currRotation = this.visualTrans.getWorldRotation()

    this.desiredPosition = this.camTrans
      .getWorldPosition()
      .add(this.camTrans.forward.uniformScale(-this.DEFAULT_SCREEN_DISTANCE))
    this.desiredRotation = this.camTrans.getWorldRotation()

    if (foundNormal.distance(vec3.up()) < 0.1 && !this.vertical) {
      this.desiredPosition = foundPosition
      const worldCameraForward = this.camTrans.right.cross(vec3.up()).normalize()
      this.desiredRotation = quat.lookAt(worldCameraForward, foundNormal)
      this.desiredRotation = this.desiredRotation.multiply(quat.fromEulerVec(new vec3(-Math.PI / 2, 0, 0)))

      this.history.push(this.desiredPosition)
      if (this.history.length > this.CALIBRATION_FRAMES) {
        this.history.shift()
      }
      const distance = this.history[0].distance(this.history[this.history.length - 1])
      if (distance < this.MOVE_DISTANCE_THRESHOLD) {
        this.calibrationFrames++
      } else {
        this.calibrationFrames = 0
      }
    } else if (Math.abs(foundNormal.dot(vec3.up())) < 0.5 && this.vertical) {
      this.isVerticalSurface = true

      const rawDesiredPosition = foundPosition

      if (this.lastValidPosition.equal(vec3.zero())) {
        this.lastValidPosition = rawDesiredPosition
        this.smoothedPosition = rawDesiredPosition
      }

      const movementDistance = this.lastValidPosition.distance(rawDesiredPosition)
      if (movementDistance > this.VERTICAL_MIN_MOVE_THRESHOLD) {
        this.smoothedPosition = vec3.lerp(this.smoothedPosition, rawDesiredPosition, 1.0 - this.VERTICAL_SMOOTHING)
        this.lastValidPosition = rawDesiredPosition
      }

      this.desiredPosition = this.smoothedPosition

      const surfaceUp = vec3.up()
      const surfaceForward = foundNormal
      const surfaceRight = surfaceUp.cross(surfaceForward).normalize()
      const adjustedUp = surfaceForward.cross(surfaceRight).normalize()

      this.desiredRotation = quat.lookAt(surfaceForward, vec3.up())

      this.history.push(this.desiredPosition)
      if (this.history.length > this.CALIBRATION_FRAMES) {
        this.history.shift()
      }
      const distance = this.history[0].distance(this.history[this.history.length - 1])
      if (distance < this.MOVE_DISTANCE_THRESHOLD) {
        this.calibrationFrames++
      } else {
        this.calibrationFrames = 0
      }
    } else {
      this.calibrationFrames = 0
      this.history = []
      this.isVerticalSurface = false
    }

    const calibrationAmount = this.calibrationFrames / this.CALIBRATION_FRAMES

    if (calibrationAmount == 1) {
      this.calibrationPosition = this.desiredPosition
      const rotOffset = quat.fromEulerVec(new vec3(Math.PI / 2, 0, 0))
      this.calibrationRotation = this.desiredRotation.multiply(rotOffset)
    }

    const speedFactor = this.isVerticalSurface ? this.SPEED * 0.5 : this.SPEED
    this.visualTrans.setWorldPosition(vec3.lerp(currPosition, this.desiredPosition, getDeltaTime() * speedFactor))
    this.visualTrans.setWorldRotation(quat.slerp(currRotation, this.desiredRotation, getDeltaTime() * speedFactor))
  }

  private onCalibrationComplete() {
    // Reserved for future use
  }
}
