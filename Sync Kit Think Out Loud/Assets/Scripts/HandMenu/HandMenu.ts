/**
 * Specs Inc. 2026
 * Hand Menu component for the Think Out Loud Spectacles lens.
 */
import { LSTween } from "LSTween.lspkg/LSTween"
import Easing from "LSTween.lspkg/TweenJS/Easing"
import TrackedHand from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/TrackedHand"
import { SIK } from "SpectaclesInteractionKit.lspkg/SIK"
import { MatchTransform } from "../Utils/MatchTransform"
import { AnimationTimer } from "./AnimationTimer"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent, bindUpdateEvent } from "SnapDecorators.lspkg/decorators"

/**
 * Simple Hand Menu Controller
 * Instantiates hand menu at wrist position when right hand palm is facing camera
 * Uses direct positioning logic similar to MenuPositioner
 */
@component
export class HandMenu extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">HandMenu – shows hand menu when right palm faces camera</span><br/><span style="color: #94A3B8; font-size: 11px;">Detects right palm facing camera, waits showDelay seconds, then animates the menu into position.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Prefabs</span>')
  @input
  @hint("Hand menu prefab to instantiate")
  handMenuPrefab: ObjectPrefab

  @input
  @hint("Timer prefab to instantiate during delay period")
  timerPrefab: ObjectPrefab

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Positioning</span>')
  @input
  @hint("Head pose target for positioning calculations")
  headPoseTarget: SceneObject

  @input
  @hint("Position offset from wrist (X right, Y up, Z forward)")
  positionOffset: vec3 = new vec3(0.3, 0.1, 0.0)

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Timing</span>')
  @input
  @hint("Delay before showing menu when palm is detected (seconds)")
  @widget(new SliderWidget(0.1, 3.0, 0.1))
  showDelay: number = 0.5

  @input
  @hint("Delay before hiding menu when palm is lost (seconds)")
  @widget(new SliderWidget(0.1, 3.0, 0.1))
  hideDelay: number = 1.0

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Animation</span>')
  @input
  @hint("Initial scale for menu (starting scale)")
  @widget(new SliderWidget(0.0, 2.0, 0.1))
  initialScale: number = 0.0

  @input
  @hint("End scale for menu (target scale)")
  @widget(new SliderWidget(0.1, 3.0, 0.1))
  endScale: number = 1.0

  @input
  @hint("Animation time for scaling and positioning (in seconds)")
  @widget(new SliderWidget(0.1, 2.0, 0.1))
  animationTime: number = 0.5

  @input
  @hint("Enable scaling animation on reveal")
  enableScaling: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private leftHand: TrackedHand
  private rightHand: TrackedHand
  private currentHandMenu: SceneObject | null = null
  private currentTimer: SceneObject | null = null
  private timerMatchTransform: MatchTransform | null = null
  private wristTargetObject: SceneObject | null = null
  private isShowingPalm: boolean = false
  private showDelayedEvent: DelayedCallbackEvent | null = null
  private hideDelayedEvent: DelayedCallbackEvent | null = null

  onAwake(): void {
    this.logger = new Logger("HandMenu", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.initializeHands()
    this.initializeTimer()
    this.logger.info("Initialized hand tracking and timer")
  }

  @bindUpdateEvent
  onUpdate(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onUpdate()")
    if (!this.leftHand || !this.rightHand) {
      return
    }

    if (this.wristTargetObject && this.rightHand.isTracked) {
      this.wristTargetObject.getTransform().setWorldPosition(this.rightHand.indexKnuckle.position)
    }

    const isRightPalmShowing = this.rightHand.isTracked && this.rightHand.isFacingCamera()

    if (isRightPalmShowing && !this.isShowingPalm) {
      if (!this.currentHandMenu || !this.currentHandMenu.enabled) {
        this.isShowingPalm = true
        this.cancelHideDelay()
        this.scheduleShowMenu()
      }
    } else if (!isRightPalmShowing && this.isShowingPalm) {
      this.isShowingPalm = false
      this.cancelHideDelay()
    }
  }

  private initializeHands(): void {
    try {
      this.leftHand = SIK.HandInputData.getHand("left")
      this.rightHand = SIK.HandInputData.getHand("right")
      this.logger.info("Hands initialized successfully")
    } catch (error) {
      this.logger.error("Error initializing hands - " + error)
    }
  }

  private initializeTimer(): void {
    if (!this.timerPrefab) {
      this.logger.warn("No timer prefab assigned")
      return
    }

    this.wristTargetObject = global.scene.createSceneObject("WristTarget")
    this.logger.info("Timer system initialized - ready to instantiate timer prefab")
  }

  private scheduleShowMenu(): void {
    if (this.showDelayedEvent) {
      return
    }

    this.logger.info("Scheduling menu show with delay: " + this.showDelay + "s")

    this.showTimer()

    this.showDelayedEvent = this.createEvent("DelayedCallbackEvent")
    this.showDelayedEvent.bind(() => {
      this.hideTimer()
      this.showMenu()
      this.showDelayedEvent = null
    })
    this.showDelayedEvent.reset(this.showDelay)
  }

  private scheduleHideMenu(): void {
    if (this.hideDelayedEvent) {
      return
    }

    this.logger.info("Scheduling menu hide with delay: " + this.hideDelay + "s")

    this.hideDelayedEvent = this.createEvent("DelayedCallbackEvent")
    this.hideDelayedEvent.bind(() => {
      this.hideMenu()
      this.hideDelayedEvent = null
    })
    this.hideDelayedEvent.reset(this.hideDelay)
  }

  private cancelShowDelay(): void {
    if (this.showDelayedEvent) {
      this.showDelayedEvent.enabled = false
      this.showDelayedEvent = null
      this.hideTimer()
      this.logger.info("Cancelled show delay and hid timer")
    }
  }

  private cancelHideDelay(): void {
    if (this.hideDelayedEvent) {
      this.hideDelayedEvent.enabled = false
      this.hideDelayedEvent = null
      this.logger.info("Cancelled hide delay")
    }
  }

  private showTimer(): void {
    if (!this.timerPrefab) {
      this.logger.warn("No timer prefab assigned")
      return
    }

    if (!this.currentTimer) {
      this.currentTimer = this.timerPrefab.instantiate(null)
      if (!this.currentTimer) {
        this.logger.error("Failed to instantiate timer prefab")
        return
      }

      this.timerMatchTransform = this.currentTimer.getComponent(MatchTransform.getTypeName())
      if (!this.timerMatchTransform) {
        this.timerMatchTransform = this.currentTimer.createComponent(MatchTransform.getTypeName())
        this.logger.info("Created MatchTransform component on timer")
      }

      this.timerMatchTransform.target = this.wristTargetObject
      this.timerMatchTransform.positionOffset = new vec3(0, 0, 0)
    }

    this.currentTimer.enabled = true

    const animationTimer = this.currentTimer.getComponent(AnimationTimer.getTypeName())
    if (animationTimer) {
      ;(animationTimer as AnimationTimer).startAnimationManually()
      this.logger.info("Timer animation restarted")
    }

    this.logger.info("Timer shown")
  }

  private hideTimer(): void {
    if (!this.currentTimer) {
      return
    }

    this.currentTimer.enabled = false
    this.logger.info("Timer hidden")
  }

  private showMenu(): void {
    if (this.currentHandMenu && this.currentHandMenu.enabled) {
      this.logger.info("Menu already visible")
      return
    }

    if (!this.handMenuPrefab) {
      this.logger.warn("No hand menu prefab assigned")
      return
    }

    if (!this.rightHand.isTracked) {
      this.logger.warn("Right hand not tracked, cannot show menu")
      return
    }

    if (!this.currentHandMenu) {
      this.currentHandMenu = this.handMenuPrefab.instantiate(null)
      if (!this.currentHandMenu) {
        this.logger.error("Failed to instantiate menu")
        return
      }
    }

    this.currentHandMenu.enabled = true
    this.positionMenuAtWrist()

    this.logger.info("Menu shown at wrist position with offset")
  }

  /**
   * Position menu at hand position initially, then animate to offset position with scaling
   */
  private positionMenuAtWrist(): void {
    if (!this.currentHandMenu) {
      return
    }

    if (!this.headPoseTarget) {
      this.logger.warn("No head pose target assigned for menu positioning")
      return
    }

    if (!this.rightHand.isTracked) {
      this.logger.warn("Right hand not tracked for positioning")
      return
    }

    const handPosition = this.rightHand.indexKnuckle.position

    const targetPosition = this.calculatePositionWithOffset(
      this.headPoseTarget.getTransform().getWorldPosition(),
      this.positionOffset
    )
    if (!targetPosition) {
      this.logger.warn("Could not calculate position")
      return
    }

    this.currentHandMenu.enabled = true
    this.logger.info("Menu object enabled")

    this.currentHandMenu.getTransform().setWorldPosition(handPosition)
    this.logger.info(
      `Positioned at hand - ${handPosition.x.toFixed(2)}, ${handPosition.y.toFixed(2)}, ${handPosition.z.toFixed(2)}`
    )

    if (this.enableScaling) {
      this.animateScaleAndPosition(handPosition, targetPosition)
    } else {
      const menuTransform = this.currentHandMenu.getTransform()
      const fullScale = new vec3(this.endScale, this.endScale, this.endScale)
      menuTransform.setLocalScale(fullScale)
      menuTransform.setWorldPosition(targetPosition)
      this.logger.info(
        `Menu scale set to ${this.endScale} and positioned at target immediately (animation disabled)`
      )
    }
  }

  /**
   * Calculate the target position based on head pose position and offset
   */
  private calculatePositionWithOffset(headPosition: vec3, offset: vec3): vec3 | null {
    if (!this.headPoseTarget) {
      this.logger.warn("No head pose target for position calculation")
      return null
    }

    const headTransform = this.headPoseTarget.getTransform()
    const headPos = headTransform.getWorldPosition()
    const headRotation = headTransform.getWorldRotation()

    const forward = headRotation.multiplyVec3(vec3.forward())
    const flattenedForward = this.normalizeVector(new vec3(forward.x, 0, forward.z))

    const right = headRotation.multiplyVec3(new vec3(1, 0, 0))
    const flattenedRight = this.normalizeVector(new vec3(right.x, 0, right.z))

    return new vec3(
      headPos.x + flattenedRight.x * offset.x + offset.y * 0 + flattenedForward.x * offset.z,
      headPos.y + flattenedRight.y * offset.x + offset.y * 1 + flattenedForward.y * offset.z,
      headPos.z + flattenedRight.z * offset.x + offset.y * 0 + flattenedForward.z * offset.z
    )
  }

  /**
   * Animate menu scale and position simultaneously from hand to offset position
   */
  private animateScaleAndPosition(startPosition: vec3, endPosition: vec3): void {
    if (!this.currentHandMenu) {
      this.logger.warn("No menu object for scale and position animation")
      return
    }

    const menuTransform = this.currentHandMenu.getTransform()
    const startScale = new vec3(this.initialScale, this.initialScale, this.initialScale)
    const endScale = new vec3(this.endScale, this.endScale, this.endScale)
    const duration = this.animationTime * 1000

    menuTransform.setLocalScale(startScale)

    LSTween.scaleToLocal(menuTransform, endScale, duration).easing(Easing.Quadratic.Out).start()

    LSTween.moveToWorld(menuTransform, endPosition, duration)
      .easing(Easing.Quadratic.Out)
      .onComplete(() => {
        this.logger.info(
          `Scale and position animation completed - menu at scale ${this.endScale} and target position`
        )
      })
      .start()

    this.logger.info(
      `Started scale and position animation from ${this.initialScale} to ${this.endScale} over ${this.animationTime}s`
    )
  }

  private normalizeVector(v: vec3): vec3 {
    return v.length < 0.0001 ? new vec3(0, 0, 0) : v.normalize()
  }

  private hideMenu(): void {
    if (!this.currentHandMenu) {
      return
    }

    this.logger.info("Hiding menu")
    this.currentHandMenu.enabled = false
  }

  /**
   * Public method to manually show menu (for testing)
   */
  public showMenuManually(): void {
    this.cancelHideDelay()
    this.scheduleShowMenu()
  }

  /**
   * Public method to manually hide menu
   */
  public hideMenuManually(): void {
    this.cancelShowDelay()
    this.scheduleHideMenu()
  }
}
