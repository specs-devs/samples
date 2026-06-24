/**
 * Specs Inc. 2026
 * Animation Timer component for the Think Out Loud Spectacles lens.
 */
import { LSTween } from "LSTween.lspkg/LSTween"
import { RotationInterpolationType } from "LSTween.lspkg/RotationInterpolationType"
import Easing from "LSTween.lspkg/TweenJS/Easing"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindEnableEvent } from "SnapDecorators.lspkg/decorators"

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
  private isAnimating: boolean = false
  private currentScaleTween: any = null
  private currentRotationTween: any = null

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
    this.startAnimation()
  }

  @bindEnableEvent
  onEnable(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onEnable()")
    this.resetToInitial()
    this.startAnimation()
    this.logger.info("Object enabled - animation restarted")
  }

  private startAnimation(): void {
    if (this.isAnimating) {
      return
    }
    this.isAnimating = true
    this.animateToMax()
  }

  private animateToMax(): void {
    if (!this.isAnimating) {
      return
    }
    this.logger.info("Animating to max values")

    const startRotation = quat.fromEulerAngles(
      this.minRotation.x * MathUtils.DegToRad,
      this.minRotation.y * MathUtils.DegToRad,
      this.minRotation.z * MathUtils.DegToRad
    )

    const endRotation = quat.fromEulerAngles(
      this.maxRotation.x * MathUtils.DegToRad,
      this.maxRotation.y * MathUtils.DegToRad,
      this.maxRotation.z * MathUtils.DegToRad
    )

    this.transform.setLocalRotation(startRotation)

    const halfTime = (this.animationTime * 1000) / 2

    this.currentScaleTween = LSTween.scaleFromToLocal(this.transform, this.minScale, this.maxScale, halfTime)
      .easing(Easing.Circular.InOut)
      .onComplete(() => {
        this.logger.info("Scale animation to max completed")
        this.animateToMin()
      })
      .start()

    this.currentRotationTween = LSTween.rotateFromToLocal(
      this.transform,
      startRotation,
      endRotation,
      halfTime,
      RotationInterpolationType.SLERP
    )
      .easing(Easing.Cubic.In)
      .start()
  }

  private animateToMin(): void {
    if (!this.isAnimating) {
      return
    }
    this.logger.info("Animating to min values")

    const startRotation = quat.fromEulerAngles(
      this.maxRotation.x * MathUtils.DegToRad,
      this.maxRotation.y * MathUtils.DegToRad,
      this.maxRotation.z * MathUtils.DegToRad
    )

    const endRotation = quat.fromEulerAngles(
      this.minRotation.x * MathUtils.DegToRad,
      this.minRotation.y * MathUtils.DegToRad,
      this.minRotation.z * MathUtils.DegToRad
    )

    this.transform.setLocalRotation(startRotation)

    const halfTime = (this.animationTime * 1000) / 2

    this.currentScaleTween = LSTween.scaleFromToLocal(this.transform, this.maxScale, this.minScale, halfTime)
      .easing(Easing.Circular.InOut)
      .onComplete(() => {
        this.logger.info("Complete loop finished")
        this.isAnimating = false
      })
      .start()

    this.currentRotationTween = LSTween.rotateFromToLocal(
      this.transform,
      startRotation,
      endRotation,
      halfTime,
      RotationInterpolationType.SLERP
    )
      .easing(Easing.Cubic.In)
      .start()
  }

  /**
   * Stop the animation
   */
  public stopAnimation(): void {
    this.isAnimating = false

    if (this.currentScaleTween) {
      this.currentScaleTween.stop()
      this.currentScaleTween = null
    }

    if (this.currentRotationTween) {
      this.currentRotationTween.stop()
      this.currentRotationTween = null
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
