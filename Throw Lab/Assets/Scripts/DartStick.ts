/**
 * Specs Inc. 2026
 * Dart Stick component for the Throw Lab Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { MathUtils } from "Utilities.lspkg/Scripts/Utils/MathUtils"

/**
 * Handles dart sticking to the score board on collision.
 * Works with GrabbableObject and MatchTransform system.
 * Add this component to dart objects.
 */
@component
export class DartStick extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">DartStick – Stick dart to board on straight hit</span><br/><span style="color: #94A3B8; font-size: 11px;">Assign the dartboard and audio components. Dart sticks when hit angle is within threshold.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("The score board object to stick to")
  scoreBoard: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Audio</span>')
  @input
  @hint("Sound to play when dart sticks to board")
  hitSound: AudioComponent

  @input
  @hint("Sound to play when dart bounces off board")
  bounceSound: AudioComponent

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Stick Settings</span>')
  @input
  @hint("Offset for tip positioning (default: -0.66)")
  tipOffset: number = -0.66

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private maxStickAngle: number = 170.0
  private bodyComponent: BodyComponent | null = null
  private hasStuck: boolean = false
  private scoreBoardTransform: Transform | null = null

  onAwake() {
    this.logger = new Logger("DartStick", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.bodyComponent = this.getSceneObject().getComponent("Physics.BodyComponent")

    if (!this.bodyComponent) {
      this.logger.error("Physics.BodyComponent is required!")
      return
    }

    if (this.hitSound) {
      this.hitSound.playbackMode = Audio.PlaybackMode.LowLatency
    }
    if (this.bounceSound) {
      this.bounceSound.playbackMode = Audio.PlaybackMode.LowLatency
    }

    if (this.scoreBoard) {
      this.scoreBoardTransform = this.scoreBoard.getTransform()
    }

    this.bodyComponent.onCollisionEnter.add(this.onCollisionEnter.bind(this))
  }

  /**
   * Called when dart collides with something
   */
  private onCollisionEnter(e: CollisionEnterEventArgs) {
    if (this.hasStuck) return

    const collision = e.collision

    const hitObject = collision.collider.getSceneObject()
    const isDartBoardHit = hitObject.name === "DartBoard" || hitObject === this.scoreBoard

    if (!isDartBoardHit) {
      if (this.bounceSound) {
        this.bounceSound.play(1)
      }
      return
    }

    const myTransform = this.getSceneObject().getTransform()
    const touchPoint = myTransform.getWorldPosition()
    const touchRotation = myTransform.getWorldRotation()
    const touchScale = myTransform.getWorldScale()

    if (this.isStraightHit(touchRotation)) {
      this.logger.info("Straight hit detected! Sticking to board.")

      this.bodyComponent.dynamic = false
      this.bodyComponent.velocity = vec3.zero()

      const childLocalPosition = new vec3(0, 0, this.tipOffset)
      const parentWorldPosition = touchPoint.sub(touchRotation.multiplyVec3(childLocalPosition.mult(touchScale)))

      this.getSceneObject().setParent(hitObject)

      myTransform.setWorldPosition(parentWorldPosition)
      myTransform.setWorldRotation(touchRotation)
      myTransform.setWorldScale(touchScale)

      this.hasStuck = true

      if (this.hitSound) {
        this.hitSound.play(1)
      }

      this.logger.info(`Dart stuck to board at ${parentWorldPosition}`)
    } else {
      this.logger.debug("Bounce - hit angle too steep")

      if (this.bounceSound) {
        this.bounceSound.play(1)
      }
    }
  }

  /**
   * Check if the dart hit at a good angle (straight enough to stick)
   */
  private isStraightHit(dartRotation: quat): boolean {
    if (!this.scoreBoardTransform) return false

    const boardForward = this.scoreBoardTransform.forward

    const dartPointingDirection = dartRotation.multiplyVec3(vec3.up())

    const angle = boardForward.angleTo(dartPointingDirection) / MathUtils.DegToRad

    const isGoodAngle = angle < this.maxStickAngle && angle > 0

    this.logger.debug(
      `Hit angle: ${angle.toFixed(1)} deg (max: ${this.maxStickAngle} deg) - ${isGoodAngle ? "STICK!" : "BOUNCE"}`
    )

    return isGoodAngle
  }
}
