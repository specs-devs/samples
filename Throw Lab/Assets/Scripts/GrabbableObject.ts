/**
 * Specs Inc. 2026
 * Grabbable Object component for the Throw Lab Spectacles lens.
 */
import TrackedHand from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/TrackedHand"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {MatchTransform} from "./MatchTransform"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

/**
 * Makes an object grabbable via pinch or grab gesture.
 * Requires a MatchTransform component and a Physics Body component.
 */
@component
export class GrabbableObject extends BaseScriptComponent {
  // Public events for visual feedback systems
  public onGrabStartEvent: Event = new Event()
  public onGrabEndEvent: Event = new Event()

  @ui.label('<span style="color: #60A5FA;">GrabbableObject – Physics grab and throw with hand tracking</span><br/><span style="color: #94A3B8; font-size: 11px;">Requires a MatchTransform and Physics.BodyComponent on the same object.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Object Settings</span>')
  @input
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Ball", "Ball"),
      new ComboBoxItem("Racket", "Racket"),
      new ComboBoxItem("Darts", "Darts")
    ])
  )
  @hint("Type of object - determines grab behavior and rotation")
  objectType: string = "Ball"

  @input
  @hint("Reference to the MatchTransform component on this object")
  matchTransform: MatchTransform

  @input
  @hint("Time in seconds before destroying the object after it's dropped")
  destroyDelay: number = 4.5

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Dart Settings</span>')
  @input
  @hint("For Darts: The dartboard/scoreboard to look at when grabbed")
  @showIf("objectType", "Darts")
  scoreBoard: SceneObject

  @input
  @hint("For Darts: Force applied when releasing (throw strength)")
  @showIf("objectType", "Darts")
  dartThrowForce: number = 800.0

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Throw Settings</span>')
  @input
  @hint("For Ball/Racket: Force applied when releasing (throw strength)")
  ballThrowForce: number = 150.0

  @input
  @hint("For Ball/Racket: Multiplier for hand velocity (higher = more responsive to hand movement)")
  handVelocityMultiplier: number = 0.3

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private bodyComponent: BodyComponent | null = null
  private colliderComponent: ColliderComponent | null = null
  private isGrabbed: boolean = false
  private destroyEvent: DelayedCallbackEvent | null = null
  private grabbedHand: TrackedHand | null = null
  private updateEvent: SceneEvent | null = null
  private previousHandPosition: vec3 = vec3.zero()
  private handVelocity: vec3 = vec3.zero()

  onAwake() {
    this.logger = new Logger("GrabbableObject", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.bodyComponent = this.getSceneObject().getComponent("Physics.BodyComponent")

    if (!this.bodyComponent) {
      this.colliderComponent = this.getSceneObject().getComponent("Physics.ColliderComponent")
    }

    if (!this.matchTransform) {
      this.logger.warn("MatchTransform component is required!")
    }

    if (!this.bodyComponent && !this.colliderComponent) {
      this.logger.warn("Physics Body or Collider component is required!")
    }
  }

  /**
   * Called by GestureManager when object is grabbed
   */
  onGrab(hand: TrackedHand) {
    if (this.isGrabbed) return

    this.isGrabbed = true
    this.grabbedHand = hand

    if (this.destroyEvent) {
      this.destroyEvent.cancel()
      this.destroyEvent = null
    }

    const currentWorldPos = this.getSceneObject().getTransform().getWorldPosition()
    const currentWorldRot = this.getSceneObject().getTransform().getWorldRotation()

    this.getSceneObject().setParent(null)

    this.getSceneObject().getTransform().setWorldPosition(currentWorldPos)
    this.getSceneObject().getTransform().setWorldRotation(currentWorldRot)

    if (this.bodyComponent && this.bodyComponent.dynamic) {
      this.bodyComponent.dynamic = false
    }

    if (
      this.matchTransform &&
      this.matchTransform.resetOffset &&
      this.matchTransform.setTarget &&
      this.matchTransform.enableMatching
    ) {
      const afterUnparentPos = this.getSceneObject().getTransform().getWorldPosition()

      this.logger.debug(`After unparent - pos: ${afterUnparentPos}`)
      this.logger.debug(`Hand index tip - pos: ${hand.indexTip.position}`)

      this.matchTransform.resetOffset()

      this.matchTransform.setTarget(hand.indexTip.position, hand.indexTip.rotation)

      this.matchTransform.enableMatching()

      if (this.objectType === "Darts") {
        this.matchTransform.disableRotationUpdates()
        this.logger.debug("Rotation updates disabled for dart (will be overridden)")
      } else {
        this.matchTransform.enableRotationUpdates()
      }

      this.logger.debug("MatchTransform enabled with offset initialized")
    } else {
      this.logger.error("MatchTransform not available or missing methods!")
    }

    this.previousHandPosition = hand.indexTip.position
    this.handVelocity = vec3.zero()

    // UpdateEvent is created conditionally during grab (not a lifecycle pattern)
    this.updateEvent = this.createEvent("UpdateEvent")
    this.updateEvent.bind(this.onUpdateWhileGrabbed.bind(this))

    this.onGrabStartEvent.invoke()

    this.logger.info(`(${this.getSceneObject().name}): Grabbed! Update event created.`)
  }

  private updateCounter = 0

  private onUpdateWhileGrabbed() {
    if (!this.isGrabbed || !this.grabbedHand || !this.matchTransform) {
      return
    }

    if (!this.grabbedHand.isTracked()) {
      this.onRelease()
      return
    }

    const currentHandPos = this.grabbedHand.indexTip.position

    if (getDeltaTime() > 0) {
      this.handVelocity = currentHandPos.sub(this.previousHandPosition).uniformScale(1 / getDeltaTime())
    }

    this.previousHandPosition = currentHandPos

    if (this.matchTransform.setTarget) {
      if (this.objectType === "Ball") {
        this.matchTransform.setTarget(this.grabbedHand.indexTip.position, this.grabbedHand.indexTip.rotation)
      } else if (this.objectType === "Racket") {
        this.matchTransform.setTarget(this.grabbedHand.indexTip.position, this.grabbedHand.wrist.rotation)
      } else {
        this.matchTransform.setTarget(
          this.grabbedHand.indexTip.position,
          this.getSceneObject().getTransform().getWorldRotation()
        )
      }
    }

    this.applyTypeSpecificRotation()

    this.updateCounter++
    if (this.updateCounter % 30 === 0) {
      this.logger.debug(`Setting target to ${this.grabbedHand.indexTip.position}`)
    }
  }

  private applyTypeSpecificRotation() {
    const transform = this.getSceneObject().getTransform()

    if (this.objectType === "Darts") {
      if (this.scoreBoard) {
        const boardPos = this.scoreBoard.getTransform().getWorldPosition()
        const myPos = transform.getWorldPosition()
        const directionToBoard = boardPos.sub(myPos).normalize()

        const lookAtRotation = quat.lookAt(directionToBoard, vec3.up())

        const xRotation = quat.angleAxis(90 * MathUtils.DegToRad, vec3.right())
        const finalRotation = lookAtRotation.multiply(xRotation)

        transform.setWorldRotation(finalRotation)
      }
    }
  }

  getGestureType(): "pinch" | "grab" {
    if (this.objectType === "Racket") {
      return "grab"
    }
    return "pinch"
  }

  /**
   * Called by GestureManager when object is released
   */
  onRelease() {
    if (!this.isGrabbed) return

    this.isGrabbed = false

    if (this.updateEvent) {
      this.updateEvent.enabled = false
      this.updateEvent = null
    }

    if (this.matchTransform && this.matchTransform.disableMatching) {
      this.matchTransform.disableMatching()
    }

    if (this.bodyComponent) {
      this.bodyComponent.dynamic = true

      if (this.objectType === "Darts" && this.scoreBoard) {
        this.throwDart()
      } else if (this.objectType === "Ball") {
        this.throwBall()
      }
    }

    this.grabbedHand = null

    this.handVelocity = vec3.zero()
    this.previousHandPosition = vec3.zero()

    this.scheduleDestroy()

    this.logger.info(`(${this.getSceneObject().name}): Released!`)

    this.logger.debug("Invoking onGrabEndEvent")
    this.onGrabEndEvent.invoke()
  }

  private throwDart() {
    if (!this.bodyComponent || !this.scoreBoard) return

    const myPos = this.getSceneObject().getTransform().getWorldPosition()
    const boardPos = this.scoreBoard.getTransform().getWorldPosition()

    const directionToBoard = boardPos.sub(myPos).normalize()

    let throwStrength = this.handVelocity.length * this.handVelocityMultiplier

    if (throwStrength < 2) {
      throwStrength = this.dartThrowForce
    } else {
      throwStrength += this.dartThrowForce
    }

    const forceVector = directionToBoard.uniformScale(throwStrength)

    this.bodyComponent.angularVelocity = vec3.zero()
    this.bodyComponent.angularDamping = 0.95

    this.logger.info(`Throwing dart with strength ${throwStrength.toFixed(1)} towards board`)
    this.logger.debug(`Hand velocity: ${this.handVelocity.length.toFixed(1)}`)

    this.bodyComponent.addForce(forceVector, Physics.ForceMode.Impulse)
  }

  private throwBall() {
    if (!this.bodyComponent) return

    let throwVelocity = this.handVelocity.uniformScale(this.handVelocityMultiplier)

    if (throwVelocity.length < 2) {
      if (this.grabbedHand) {
        const handForward = this.grabbedHand.indexTip.rotation.multiplyVec3(vec3.forward())
        throwVelocity = handForward.uniformScale(this.ballThrowForce)
      } else {
        throwVelocity = vec3.forward().uniformScale(this.ballThrowForce)
      }
    } else {
      if (this.grabbedHand) {
        const handForward = this.grabbedHand.indexTip.rotation.multiplyVec3(vec3.forward())
        const baseForce = handForward.uniformScale(this.ballThrowForce)
        throwVelocity = throwVelocity.add(baseForce)
      }
    }

    this.logger.info(`Throwing ${this.objectType} with velocity ${throwVelocity.length.toFixed(1)}`)
    this.logger.debug(`Hand velocity contribution: ${this.handVelocity.length.toFixed(1)}`)

    this.bodyComponent.addForce(throwVelocity, Physics.ForceMode.Impulse)
  }

  private scheduleDestroy() {
    if (this.destroyEvent) {
      this.destroyEvent.cancel()
    }

    this.destroyEvent = this.createEvent("DelayedCallbackEvent")
    this.destroyEvent.bind(() => {
      if (this.objectType === "Darts" && this.scoreBoard) {
        const parent = this.getSceneObject().getParent()
        if (parent === this.scoreBoard) {
          this.logger.debug("Dart stuck to board - skipping destroy")
          return
        }
      }

      this.logger.info("Destroying object after delay")
      this.getSceneObject().destroy()
    })
    this.destroyEvent.reset(this.destroyDelay)
  }

  isCurrentlyGrabbed(): boolean {
    return this.isGrabbed
  }

  getCollider(): ColliderComponent | null {
    return this.bodyComponent || this.colliderComponent
  }
}
