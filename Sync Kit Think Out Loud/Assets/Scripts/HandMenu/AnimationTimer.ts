/**
 * SPECS Inc. 2027
 * Animation Timer component for the Think Out Loud Glasses lens.
 *
 * Native animation: drives scale + rotation through a runtime-built
 * AnimationPlayer clip (AnimationCurve / AnimationPropertyTrack /
 * AnimationPropertyLayer / AnimationAsset). PingPong playback loops the
 * A -> B -> A motion forever with no per-frame scripting.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindEnableEvent } from "SnapDecorators.lspkg/decorators"

// CSS cubic-bezier control points approximating the original easing presets.
// circular in-out (was Easing.Circular.InOut) and cubic in (was Easing.Cubic.In).
const CIRCULAR_IN_OUT = [0.785, 0.135, 0.15, 0.86] as const
const CUBIC_IN = [0.55, 0.055, 0.675, 0.19] as const

// The runtime easing curves span t = 0..1 (a 1 second clip). PingPong plays the
// clip forward then back, so one full A->B->A loop is two clip lengths. To make a
// full loop last animationTime seconds the clip must play at 2 / animationTime.
const CLIP_NAME = "animationTimerLoop"

/**
 * AnimationTimer - Animates scale and rotation with looping
 * Animates from A to B and back to A continuously
 */
@component
export class AnimationTimer extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">AnimationTimer – loops scale and rotation animation between two values</span><br/><span style="color: #94A3B8; font-size: 11px;">Restarts animation automatically when the object is enabled.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Animation</span>')
  @input
  @hint("Minimum rotation values in degrees")
  minRotation: vec3 = new vec3(-45, -45, -45)

  @input
  @hint("Maximum rotation values in degrees")
  maxRotation: vec3 = new vec3(45, 45, 45)

  @input
  @hint("Minimum scale values")
  minScale: vec3 = new vec3(0.5, 0.5, 0.5)

  @input
  @hint("Maximum scale values")
  maxScale: vec3 = new vec3(2, 2, 2)

  @input
  @hint("Animation time in seconds for complete loop (A to B to A)")
  @widget(new SliderWidget(0.5, 5.0, 0.1))
  animationTime: number = 1.5

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private transform: Transform
  private player: AnimationPlayer | null = null
  private isAnimating: boolean = false

  onAwake(): void {
    this.logger = new Logger("AnimationTimer", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.transform = this.getTransform()
    if (!this.transform) {
      this.logger.error("No transform found on object")
      return
    }
    this.transform.setLocalScale(this.minScale)
    this.transform.setLocalPosition(new vec3(0, 0, 0))
    this.buildPlayer()
    this.startAnimation()
  }

  @bindEnableEvent
  onEnable(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onEnable()")
    this.resetToInitial()
    this.startAnimation()
    this.logger.info("Object enabled - animation restarted")
  }

  /**
   * Build (once) the AnimationPlayer clip that PingPongs scale and rotation
   * between the min and max poses.
   */
  private buildPlayer(): void {
    if (this.player) {
      return
    }

    const player = this.sceneObject.getComponent("Component.AnimationPlayer") as AnimationPlayer
      ?? (this.sceneObject.createComponent("Component.AnimationPlayer") as AnimationPlayer)

    const layer = AnimationPropertyLayer.create()
    layer.setProperty(AnimationPropertyLayer.TransformScale, this.buildScaleTrack())
    layer.setProperty(AnimationPropertyLayer.TransformRotation, this.buildRotationTrack())

    const asset = AnimationAsset.create()
    asset.addLayer(this.sceneObject.name, layer)

    const clip = AnimationClip.createFromAnimation(CLIP_NAME, asset)
    clip.playbackMode = PlaybackMode.PingPong
    clip.playbackSpeed = this.loopSpeed()

    player.addClip(clip)
    this.player = player
    this.logger.info("Native AnimationPlayer clip built (PingPong loop)")
  }

  /** Full A->B->A loop = 2 clip lengths, so speed is 2 / animationTime. */
  private loopSpeed(): number {
    return this.animationTime > 0 ? 2 / this.animationTime : 1
  }

  private buildScaleTrack(): AnimationPropertyTrack {
    const [x1, y1, x2, y2] = CIRCULAR_IN_OUT
    const curveX = AnimationCurve.createEasingCurve(this.minScale.x, this.maxScale.x, x1, y1, x2, y2)
    const curveY = AnimationCurve.createEasingCurve(this.minScale.y, this.maxScale.y, x1, y1, x2, y2)
    const curveZ = AnimationCurve.createEasingCurve(this.minScale.z, this.maxScale.z, x1, y1, x2, y2)
    return AnimationPropertyTrack.createVec3FromCurves(curveX, curveY, curveZ)
  }

  private buildRotationTrack(): AnimationPropertyTrack {
    // TransformRotation is a quaternion built from per-axis euler curves (radians at runtime).
    const [x1, y1, x2, y2] = CUBIC_IN
    const curveX = AnimationCurve.createEasingCurve(
      this.minRotation.x * MathUtils.DegToRad, this.maxRotation.x * MathUtils.DegToRad, x1, y1, x2, y2
    )
    const curveY = AnimationCurve.createEasingCurve(
      this.minRotation.y * MathUtils.DegToRad, this.maxRotation.y * MathUtils.DegToRad, x1, y1, x2, y2
    )
    const curveZ = AnimationCurve.createEasingCurve(
      this.minRotation.z * MathUtils.DegToRad, this.maxRotation.z * MathUtils.DegToRad, x1, y1, x2, y2
    )
    return AnimationPropertyTrack.createQuatFromCurves(curveX, curveY, curveZ)
  }

  private startAnimation(): void {
    if (this.isAnimating) {
      return
    }
    if (!this.player) {
      this.buildPlayer()
    }
    if (!this.player) {
      return
    }
    this.isAnimating = true
    this.player.getClip(CLIP_NAME).playbackSpeed = this.loopSpeed()
    this.player.playClip(CLIP_NAME)
    this.logger.info("Animation loop started")
  }

  /**
   * Stop the animation
   */
  public stopAnimation(): void {
    this.isAnimating = false
    if (this.player) {
      this.player.stopClip(CLIP_NAME)
    }
    this.logger.info("Animation stopped")
  }

  /**
   * Start the animation
   */
  public startAnimationManually(): void {
    this.startAnimation()
  }

  /**
   * Reset to initial state
   */
  public resetToInitial(): void {
    this.stopAnimation()
    this.transform.setLocalScale(this.minScale)

    const initialRotation = quat.fromEulerAngles(
      this.minRotation.x * MathUtils.DegToRad,
      this.minRotation.y * MathUtils.DegToRad,
      this.minRotation.z * MathUtils.DegToRad
    )
    this.transform.setLocalRotation(initialRotation)

    this.logger.info("Reset to initial state")
  }
}
