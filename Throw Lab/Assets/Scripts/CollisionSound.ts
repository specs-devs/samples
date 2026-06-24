/**
 * Specs Inc. 2026
 * Collision Sound component for the Throw Lab Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"

/**
 * Plays a sound when object collides with something.
 * Add this to balls, rackets, or any object that should make sound on impact.
 */
@component
export class CollisionSound extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CollisionSound – Play audio on physics collision</span><br/><span style="color: #94A3B8; font-size: 11px;">Volume scales with impact speed. Assign an AudioComponent and tune the thresholds.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Audio Settings</span>')
  @input
  @hint("Sound to play on collision")
  collisionSound: AudioComponent

  @input
  @hint("Minimum velocity magnitude to play sound (prevents tiny bumps from making noise)")
  minVelocityThreshold: number = 5.0

  @input
  @hint("Volume multiplier based on impact speed (0-1)")
  velocityToVolume: number = 0.05

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

  onAwake() {
    this.logger = new Logger("CollisionSound", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.bodyComponent = this.getSceneObject().getComponent("Physics.BodyComponent")

    if (!this.bodyComponent) {
      this.logger.error("Physics.BodyComponent is required!")
      return
    }

    if (this.collisionSound) {
      this.collisionSound.playbackMode = Audio.PlaybackMode.LowLatency
    }

    this.bodyComponent.onCollisionEnter.add(this.onCollisionEnter.bind(this))
  }

  /**
   * Called when object collides with something
   */
  private onCollisionEnter(e: CollisionEnterEventArgs) {
    if (!this.collisionSound) return

    const velocity = this.bodyComponent ? this.bodyComponent.velocity : vec3.zero()
    const speed = velocity.length

    if (speed < this.minVelocityThreshold) {
      return
    }

    const volume = Math.min(1.0, speed * this.velocityToVolume)

    this.logger.debug(`Playing impact sound at volume ${volume.toFixed(2)} (speed: ${speed.toFixed(1)})`)

    this.collisionSound.play(volume)
  }
}
