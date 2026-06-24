/**
 * Specs Inc. 2026
 * Physics-driven puck with networked position and velocity synchronization for the Air Hockey lens.
 */
import {bindUpdateEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {SyncEntity} from "SpectaclesSyncKit.lspkg/Core/SyncEntity"
import {StorageProperty} from "SpectaclesSyncKit.lspkg/Core/StorageProperty"
import {SessionController} from "SpectaclesSyncKit.lspkg/Core/SessionController"

@component
export class AirHockeyPuck extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">AirHockeyPuck – Networked puck physics and movement</span><br/><span style="color: #94A3B8; font-size: 11px;">Extrapolates position from synced velocity; resets on goal or out-of-bounds.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Configuration</span>')
  @input
  @hint("Maximum X distance from center before reset (in cm)")
  tableBoundsX: number = 70

  @input
  @hint("Maximum Z distance from center before reset (in cm)")
  tableBoundsZ: number = 100

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  body: BodyComponent = this.getSceneObject().getComponent("Physics.BodyComponent")
  transform: Transform = this.getTransform()
  syncEntity: SyncEntity
  isResetting: boolean = false
  sessionController: SessionController = SessionController.getInstance()

  readonly MAX_ADDED_VELOCITY: number = 20

  private positionProp = StorageProperty.manualVec3("position", this.transform.getLocalPosition())
  private velocityProp = StorageProperty.manualVec3("velocity", vec3.zero())
  private timestampProp = StorageProperty.manualDouble("lastChanged", -1)

  randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min)
  }

  randomChoice(args: number[]): number {
    return args[Math.floor(Math.random() * args.length)]
  }

  extrapolatePos(position: vec3, velocity: vec3, initialTime: number, currentTime: number): vec3 {
    const elapsedTime = currentTime - initialTime
    return position.add(velocity.uniformScale(elapsedTime))
  }

  onCollisionEnter(collisionArgs): void {
    const collision = collisionArgs.collision
    const otherObj = collision.collider.getSceneObject()

    if (otherObj.name.startsWith("Wall")) {
      const normal = collision.contacts[0].normal
      const worldToLocal = this.transform.getInvertedWorldTransform()
      const relativePos = worldToLocal.multiplyDirection(normal)
      let curVelocity = this.velocityProp.currentOrPendingValue

      if (Math.abs(relativePos.x) > 0.005) curVelocity.x *= -1
      if (Math.abs(relativePos.z) > 0.005) curVelocity.z *= -1

      this.updateMovementState(this.transform.getLocalPosition(), curVelocity)
      return
    }

    if (otherObj.name.startsWith("Paddle")) {
      let paddleVelocity = this.velocityProp.currentOrPendingValue
      paddleVelocity.z *= -1

      const otherVel = collision.collider.velocity
      const paddleWorldToLocal = this.transform.getInvertedWorldTransform()
      const otherVelLocal = paddleWorldToLocal
        .multiplyDirection(otherVel)
        .normalize()
        .uniformScale(otherVel.length)

      paddleVelocity.x += Math.max(
        -this.MAX_ADDED_VELOCITY,
        Math.min(otherVelLocal.x, this.MAX_ADDED_VELOCITY)
      )
      paddleVelocity = paddleVelocity.uniformScale(1.1)

      this.updateMovementState(this.transform.getLocalPosition(), paddleVelocity)
    }
  }

  @bindUpdateEvent
  private onUpdate(): void {
    if (!this.syncEntity.isSetupFinished) return

    const startTime = this.timestampProp.currentOrPendingValue
    let newPos = this.extrapolatePos(
      this.positionProp.currentOrPendingValue,
      this.velocityProp.currentOrPendingValue,
      startTime,
      this.sessionController.getServerTimeInSeconds()
    )
    newPos.y = 0

    if (Math.abs(newPos.x) > this.tableBoundsX || Math.abs(newPos.z) > this.tableBoundsZ) {
      this.resetPuck()
      return
    }

    this.transform.setLocalPosition(newPos)
    this.transform.setLocalRotation(quat.quatIdentity())
  }

  resetPuck(): void {
    if (this.isResetting) return

    this.isResetting = true
    this.transform.setLocalPosition(vec3.zero())
    this.updateMovementState(vec3.zero(), vec3.zero())

    const delayEvent = this.createEvent("DelayedCallbackEvent")
    delayEvent.bind(() => {
      this.removeEvent(delayEvent)
      this.isResetting = false
      this.startMovement()
    })
    delayEvent.reset(1.5)
    this.logger.debug("Puck reset to center")
  }

  startMovement(): void {
    const initVelocity = new vec3(
      this.randomRange(-20, 20),
      0,
      this.randomChoice([-1, 1]) * 40
    )
    this.updateMovementState(this.transform.getLocalPosition(), initVelocity)
    this.logger.debug("Puck movement started")
  }

  stopMovement(): void {
    this.updateMovementState(this.transform.getLocalPosition(), vec3.zero())
    this.logger.debug("Puck movement stopped")
  }

  updateMovementState(position: vec3, velocity: vec3): void {
    this.positionProp.setPendingValue(position)
    this.velocityProp.setPendingValue(velocity)
    this.timestampProp.setPendingValue(this.sessionController.getServerTimeInSeconds())
  }

  onAwake(): void {
    this.logger = new Logger("AirHockeyPuck", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.syncEntity = new SyncEntity(this, null, false)
    this.syncEntity.addStorageProperty(this.positionProp)
    this.syncEntity.addStorageProperty(this.velocityProp)
    this.syncEntity.addStorageProperty(this.timestampProp)
    this.syncEntity.notifyOnReady(() => {
      this.body.onCollisionEnter.add((e) => this.onCollisionEnter(e))
      this.transform.setLocalPosition(vec3.zero())
      this.transform.setLocalRotation(quat.quatIdentity())
      this.logger.debug("SyncEntity ready")
    })

    this.body.overlapFilter.includeStatic = true
  }
}
