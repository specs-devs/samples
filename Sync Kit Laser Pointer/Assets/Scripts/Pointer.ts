/**
 * SPECS Inc. 2027
 * Pointer component for the Laser Pointer Glasses lens.
 */
import {Interactor, InteractorTriggerType} from "InteractionKit.lspkg/Core/Interactor/Interactor"
import {HSLToRGB} from "InteractionKit.lspkg/Utils/color"
import {SyncEntity} from "SyncKit.lspkg/Core/SyncEntity"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

/**
 * Pointer class is a component that manages the state and appearance of a pointer in the scene.
 */
@component
export class Pointer extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Pointer – Visual laser pointer marker</span><br/><span style="color: #94A3B8; font-size: 11px;">Manages position, color, and fade-out of an individual networked pointer instance.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("The RenderMeshVisual used to display the pointer marker")
  pointerRmv: RenderMeshVisual

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private syncEntity = new SyncEntity(this)
  private pointerReleaseTime: number | null = null
  private pointerHSL = new vec3(Math.random() * 360, 0.8, 0.8)
  private pointerRGB = HSLToRGB(this.pointerHSL)
  private interactor: Interactor

  onAwake(): void {
    this.logger = new Logger("Pointer", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    if (this.syncEntity.networkRoot?.doIOwnStore()) {
      this.createEvent("UpdateEvent").bind(() => {
        this.updatePointer()
      })
    }
  }

  /**
   * Updates the pointer's color and position each frame, and records the release time when
   * the interactor trigger is no longer active.
   */
  private updatePointer(): void {
    // Stop once the pointer has faded out and been destroyed this frame
    if (!this.updatePointerColor()) return
    this.updatePointerPosition()
    if (this.interactor.currentTrigger === InteractorTriggerType.None && this.pointerReleaseTime === null) {
      this.pointerReleaseTime = getTime()
    }
  }

  private lastHitPosition: vec3 | null = null

  /**
   * Moves the pointer to the interactor's current target hit position while the trigger is held.
   * After release, keeps re-applying the last hit position every frame until the pointer is
   * destroyed, so SyncTransform's interpolation can't drag the fading mark back toward its
   * spawn position.
   */
  private updatePointerPosition(): void {
    if (this.interactor && this.interactor.targetHitPosition && this.pointerReleaseTime === null) {
      this.lastHitPosition = this.interactor.targetHitPosition
    }
    if (this.lastHitPosition !== null) {
      this.sceneObject.getTransform().setWorldPosition(this.lastHitPosition)
    }
  }

  /**
   * Updates the pointer's alpha based on time elapsed since release.
   *
   * - Fully opaque for the first second after release.
   * - Fades to transparent between 1 and 2 seconds after release.
   * - Destroyed once fully faded (after 2 seconds).
   *
   * @returns false if the pointer was destroyed, true otherwise.
   */
  private updatePointerColor(): boolean {
    const timeSinceRelease = this.pointerReleaseTime === null ? null : getTime() - this.pointerReleaseTime
    let alpha: number
    if (timeSinceRelease === null || timeSinceRelease <= 1) {
      alpha = 1
    } else if (timeSinceRelease <= 2) {
      alpha = 1 - (timeSinceRelease - 1)
    } else {
      this.sceneObject.destroy()
      return false
    }
    const newColor = new vec4(this.pointerRGB.x, this.pointerRGB.y, this.pointerRGB.z, alpha)
    this.pointerRmv.mainPass.baseColor = newColor
    return true
  }

  /**
   * Sets the interactor for the pointer.
   *
   * @param interactor - The interactor to be set for the pointer.
   */
  setInteractor(interactor: Interactor): void {
    this.interactor = interactor
  }
}