/**
 * Specs Inc. 2026
 * Soft Press Controller for the Essentials Spectacles lens experience.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent, bindUpdateEvent } from "SnapDecorators.lspkg/decorators"
import {mix} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {clamp} from "SpectaclesInteractionKit.lspkg/Utils/mathUtils"

@component
export class SoftPressController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SoftPressController – soft press interaction with threshold event</span><br/><span style="color: #94A3B8; font-size: 11px;">Detects when a finger presses through a cube collider past a threshold and triggers navigation.</span>')
  @ui.separator

  @input
  @hint("The collider that will detect the soft press interaction")
  colliderObject: SceneObject

  @input
  @hint("The interactor object (e.g., finger tip)")
  interactorObject: SceneObject

  @input
  @allowUndefined
  @hint("Optional: A SceneObject to visually mark the closest point on the line (for debugging)")
  closestPointMarker: SceneObject

  @input
  @hint("Top vertex 0 of the collider cube")
  topVertex0: SceneObject

  @input
  @hint("Top vertex 1 of the collider cube")
  topVertex1: SceneObject

  @input
  @hint("Top vertex 2 of the collider cube")
  topVertex2: SceneObject

  @input
  @hint("Top vertex 3 of the collider cube")
  topVertex3: SceneObject

  @input
  @hint("Bottom vertex 0 of the collider cube")
  bottomVertex0: SceneObject

  @input
  @hint("Bottom vertex 1 of the collider cube")
  bottomVertex1: SceneObject

  @input
  @hint("Bottom vertex 2 of the collider cube")
  bottomVertex2: SceneObject

  @input
  @hint("Bottom vertex 3 of the collider cube")
  bottomVertex3: SceneObject

  @input
  @hint("The threshold for triggering the press event (0 to 1)")
  pressThreshold: number = 0.7

  @input
  @hint("Time (in seconds) for the press value to smoothly reset to 0 after exit")
  resetDuration: number = 1.0

  @input
  @hint("If true, triggers the next action; if false, triggers the previous action")
  next: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private collider: ColliderComponent
  private isInteracting: boolean = false
  private pressValue: number = 0
  private hasTriggeredEvent: boolean = false
  private isResetting: boolean = false
  private resetProgress: number = 0
  private localTop: vec3
  private localBottom: vec3
  private lastClosestPointLocal: vec3
  private activeOverlapId: number | null = null
  private logger: Logger

  onAwake() {
    this.logger = new Logger("SoftPressController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.collider = this.colliderObject.getComponent("Physics.ColliderComponent")

    const topPositions = [
      this.topVertex0.getTransform().getWorldPosition(),
      this.topVertex1.getTransform().getWorldPosition(),
      this.topVertex2.getTransform().getWorldPosition(),
      this.topVertex3.getTransform().getWorldPosition()
    ]
    const bottomPositions = [
      this.bottomVertex0.getTransform().getWorldPosition(),
      this.bottomVertex1.getTransform().getWorldPosition(),
      this.bottomVertex2.getTransform().getWorldPosition(),
      this.bottomVertex3.getTransform().getWorldPosition()
    ]

    const worldTop = topPositions.reduce((sum, pos) => sum.add(pos), vec3.zero()).scale(new vec3(0.25, 0.25, 0.25))
    const worldBottom = bottomPositions
      .reduce((sum, pos) => sum.add(pos), vec3.zero())
      .scale(new vec3(0.25, 0.25, 0.25))

    const colliderTransform = this.colliderObject.getTransform()
    const inverseWorldTransform = colliderTransform.getInvertedWorldTransform()
    this.localTop = inverseWorldTransform.multiplyPoint(worldTop)
    this.localBottom = inverseWorldTransform.multiplyPoint(worldBottom)

    this.pressValue = 0
    this.lastClosestPointLocal = this.localTop
  }

  @bindStartEvent
  onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")

    this.collider.onOverlapEnter.add((e) => {
      const overlap = e.overlap
      if (overlap.collider.getSceneObject() === this.interactorObject) {
        if (this.isEnteringFromTop()) {
          this.logger.debug(`OverlapEnter(${overlap.id}): Interactor entered from the top. Starting soft press interaction.`)
          this.isInteracting = true
          this.isResetting = false
          this.resetProgress = 0
          this.activeOverlapId = overlap.id
        } else {
          this.logger.debug(`OverlapEnter(${overlap.id}): Interactor did not enter from the top. Ignoring.`)
        }
      }
    })

    this.collider.onOverlapStay.add((e) => {
      const overlap = e.overlap
      if (
        overlap.collider.getSceneObject() === this.interactorObject &&
        this.isInteracting &&
        overlap.id === this.activeOverlapId
      ) {
        this.logger.debug(`OverlapStay(${overlap.id}): Processing soft press interaction.`)
        this.calculatePressValue()
      }
    })

    this.collider.onOverlapExit.add((e) => {
      const overlap = e.overlap
      if (overlap.collider.getSceneObject() === this.interactorObject && overlap.id === this.activeOverlapId) {
        this.logger.debug(`OverlapExit(${overlap.id}): Interactor exited the collider. Starting smooth reset of press value.`)
        this.isInteracting = false
        this.isResetting = true
        this.resetProgress = 0
        this.activeOverlapId = null
      }
    })
  }

  private isEnteringFromTop(): boolean {
    const interactorPos = this.interactorObject.getTransform().getWorldPosition()
    const colliderPos = this.colliderObject.getTransform().getWorldPosition()
    const colliderUp = this.colliderObject.getTransform().up

    const directionToInteractor = interactorPos.sub(colliderPos).normalize()
    const dot = directionToInteractor.dot(colliderUp)

    return dot > 0.5
  }

  private calculatePressValue() {
    const interactorPos = this.interactorObject.getTransform().getWorldPosition()

    const colliderTransform = this.colliderObject.getTransform()
    const inverseWorldTransform = colliderTransform.getInvertedWorldTransform()

    const worldTop = colliderTransform.getWorldTransform().multiplyPoint(this.localTop)
    const worldBottom = colliderTransform.getWorldTransform().multiplyPoint(this.localBottom)

    const topToBottom = worldBottom.sub(worldTop)
    const topToInteractor = interactorPos.sub(worldTop)

    const projectionRatio = clamp(topToInteractor.dot(topToBottom) / topToBottom.dot(topToBottom), 0, 1)

    const closestPointWorld = worldTop.add(
      topToBottom.scale(new vec3(projectionRatio, projectionRatio, projectionRatio))
    )

    const closestPointLocal = inverseWorldTransform.multiplyPoint(closestPointWorld)
    this.lastClosestPointLocal = closestPointLocal

    const localTopToBottom = this.localBottom.sub(this.localTop)
    const topToClosest = closestPointLocal.sub(this.localTop)
    const projectionLength = topToClosest.dot(localTopToBottom.normalize())
    const totalLength = localTopToBottom.length

    const newPressValue = clamp(projectionLength / totalLength, 0, 1)

    this.pressValue = newPressValue
    this.logger.debug(`Press value: ${this.pressValue}`)

    if (this.closestPointMarker) {
      this.closestPointMarker.getTransform().setWorldPosition(closestPointWorld)
    }

    if (this.pressValue >= this.pressThreshold && !this.hasTriggeredEvent) {
      this.onPressThresholdReached()
      this.hasTriggeredEvent = true
    }

    if (this.pressValue <= 0 && this.hasTriggeredEvent) {
      this.logger.debug("Press value reset to 0. Event can trigger again on next press.")
      this.hasTriggeredEvent = false
    }
  }

  private smoothReset() {
    if (!this.isResetting) return

    this.resetProgress += getDeltaTime() / this.resetDuration
    this.resetProgress = clamp(this.resetProgress, 0, 1)

    const interpolatedPointLocal = mix(this.lastClosestPointLocal, this.localTop, this.resetProgress)

    const topToBottom = this.localBottom.sub(this.localTop)
    const topToCurrent = interpolatedPointLocal.sub(this.localTop)
    const projectionLength = topToCurrent.dot(topToBottom.normalize())
    const totalLength = topToBottom.length
    this.pressValue = clamp(projectionLength / totalLength, 0, 1)

    if (this.closestPointMarker) {
      const colliderTransform = this.colliderObject.getTransform()
      const interpolatedPointWorld = colliderTransform.getWorldTransform().multiplyPoint(interpolatedPointLocal)
      this.closestPointMarker.getTransform().setWorldPosition(interpolatedPointWorld)
    }

    if (this.pressValue <= 0 && this.hasTriggeredEvent) {
      this.logger.debug("Press value reset to 0 during smooth reset. Event can trigger again on next press.")
      this.hasTriggeredEvent = false
    }

    if (this.resetProgress >= 1) {
      this.isResetting = false
      this.resetProgress = 0
      this.pressValue = 0
      this.lastClosestPointLocal = this.localTop
      this.logger.debug("Smooth reset complete.")
    }
  }

  private onPressThresholdReached() {
    this.logger.debug(`Press threshold of ${this.pressThreshold} reached! Triggering event.`)
    if (this.next) {
      this.navigateToNext()
    } else {
      this.navigateToPrevious()
    }
  }

  private navigateToNext() {
    this.logger.info("PRESSED FOR NEXT ACTION - Going to next slide")
  }

  private navigateToPrevious() {
    this.logger.info("PRESSED FOR PREVIOUS ACTION - Going to previous slide")
  }

  @bindUpdateEvent
  private update() {
    if (this.isInteracting) {
      this.calculatePressValue()
    }
    if (this.isResetting) {
      this.smoothReset()
    }
  }
}
