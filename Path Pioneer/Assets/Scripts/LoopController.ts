/**
 * Specs Inc. 2026
 * Loop Controller for the Path Pioneer Spectacles lens experience.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class LoopController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">LoopController – loop lock ring visual</span><br/><span style="color: #94A3B8; font-size: 11px;">Animates the ring shown when the player closes a loop path.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Audio</span>')
  @input
  @hint("AudioComponent played when the loop lock animation completes")
  audio: AudioComponent

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private loopMat: Material
  private updateEvent: UpdateEvent
  private targetOpacity: number
  private isInLoopZone: boolean
  private isLocking: boolean
  private startLockAnimationTime: number
  private openRange: vec2
  private tr: Transform

  onAwake(): void {
    this.logger = new Logger("LoopController", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
  }

  start(startTr: Transform) {
    this.tr = this.sceneObject.getTransform()
    this.tr.setWorldPosition(startTr.getWorldPosition())
    this.tr.setWorldRotation(startTr.getWorldRotation())

    this.openRange = new vec2(0.05, 0.2)
    this.loopMat = this.sceneObject.getComponent("RenderMeshVisual").mainMaterial
    this.targetOpacity = 0
    this.loopMat.mainPass.GlobalOpacity = 0
    this.isLocking = false
    this.isInLoopZone = false

    this.updateEvent = this.createEvent("UpdateEvent")
    this.updateEvent.bind(() => this.onUpdate())
  }

  stop() {
    this.removeEvent(this.updateEvent)
    this.updateEvent = undefined

    this.targetOpacity = 0
    this.loopMat.mainPass.GlobalOpacity = 0
    this.isInLoopZone = false
  }

  private onUpdate() {
    const dt = getDeltaTime()

    // Set opacity
    this.loopMat.mainPass.GlobalOpacity = MathUtils.lerp(
      this.loopMat.mainPass.GlobalOpacity,
      this.targetOpacity,
      7 * dt
    )

    if (this.isLocking) {
      const t = getTime() - this.startLockAnimationTime
      this.loopMat.mainPass.Tweak_N12 = this.pingPong(this.openRange.x, this.openRange.y, t)
      if (t > 0.8) {
        this.loopMat.mainPass.Tweak_N12 = this.openRange.x
        this.isLocking = false
        this.stop()
      }
    }
  }

  private pingPong(min: number, max: number, t: number) {
    const range = max - min
    const freq = t * (Math.PI * 2)
    return min + 0.5 * (1 + Math.sin(freq)) * range
  }

  show() {
    this.isInLoopZone = true
    this.targetOpacity = 1
  }

  hide() {
    this.isInLoopZone = false
    if (!this.isLocking) {
      this.targetOpacity = 0
    }
  }

  getIsInLoopZone() {
    return this.isInLoopZone
  }

  onLock() {
    this.startLockAnimationTime = getTime()
    if (!this.isLocking) {
      this.isLocking = true
      this.audio.play(1)
    }
  }
}
