/**
 * Specs Inc. 2026
 * Prompt Object component for the AI Music Gen Spectacles lens.
 */
import animate from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {RoundButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {SelectionController} from "./SelectionController"

@component
export class PromptObject extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Prompt Object – selection chip with enter/exit animations</span><br/><span style="color: #94A3B8; font-size: 11px;">Reusable pool item displaying a genre, vibe, or instrument selection.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Text component that displays the selection label")
  private _text: Text

  @input
  @hint("Close button that removes this item from the selection list")
  private _closeButton: RoundButton

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private _selectionController: SelectionController
  private _prompt: string = ""
  private _displayText: string = ""
  private _root: SceneObject
  private _rootTransform: Transform
  private _baseScale: vec3
  private _cancelAnim: (() => void) | null = null
  private _baseLocalPos: vec3

  private _hasNonZeroScale(v: vec3 | undefined): boolean {
    if (!v) return false
    return v.x !== 0 || v.y !== 0 || v.z !== 0
  }

  onAwake() {
    this.logger = new Logger("PromptObject", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this._closeButton.onInitialized.add(() => {
      this._closeButton.onTriggerUp.add(() => {
        // Remove immediately; controller will animate hide and compact list
        this._selectionController.removeFromList(this._prompt)
      })
    })

    // Cache references and base scale for animations
    this._root = this.sceneObject.getChild(0)
    this._rootTransform = this._root.getTransform()
    this._baseLocalPos = this._rootTransform.getLocalPosition()
    const currentScale = this._rootTransform.getLocalScale()
    this._baseScale = this._hasNonZeroScale(currentScale) ? currentScale : new vec3(1, 1, 1)
    // Ensure starts hidden (scale 0) until shown
    this._rootTransform.setLocalScale(this._baseScale.uniformScale(0))
    this._root.enabled = false
  }

  public init(selectionController: SelectionController) {
    this._selectionController = selectionController
  }

  public setPrompt(prompt: string, displayText: string) {
    this._prompt = prompt
    this._displayText = displayText
    this._text.text = this._displayText
    this.show()
  }

  public hide(immediate?: boolean) {
    if (!this._root || !this._rootTransform) {
      this._root = this.sceneObject.getChild(0)
      this._rootTransform = this._root.getTransform()
    }
    if (!this._baseLocalPos) {
      this._baseLocalPos = this._rootTransform.getLocalPosition()
    }
    if (immediate) {
      // Capture base scale if not set before zeroing it out
      if (!this._hasNonZeroScale(this._baseScale)) {
        const cur = this._rootTransform.getLocalScale()
        this._baseScale = this._hasNonZeroScale(cur) ? cur : new vec3(1, 1, 1)
      }
      this._rootTransform.setLocalScale(this._baseScale ? this._baseScale.uniformScale(0) : new vec3(0, 0, 0))
      // Keep position at base for immediate path
      this._rootTransform.setLocalPosition(this._baseLocalPos)
      this._root.enabled = false
      if (this._cancelAnim) {
        this._cancelAnim()
        this._cancelAnim = null
      }
      return
    }
    if (this._cancelAnim) {
      this._cancelAnim()
      this._cancelAnim = null
    }
    const base = this._hasNonZeroScale(this._baseScale) ? this._baseScale : new vec3(1, 1, 1)
    this._cancelAnim = animate({
      duration: 0.25,
      easing: "ease-in-back-cubic",
      update: (t: number) => {
        const k = 1 - t
        this._rootTransform.setLocalScale(base.uniformScale(k))
        // Move backwards by 1 unit over the course of the hide
        const bx = this._baseLocalPos.x
        const by = this._baseLocalPos.y
        const bz = this._baseLocalPos.z + 1 * t
        this._rootTransform.setLocalPosition(new vec3(bx, by, bz))
      },
      ended: () => {
        this._root.enabled = false
        this._cancelAnim = null
        // Snap back to base position after hide completes
        this._rootTransform.setLocalPosition(this._baseLocalPos)
        // Notify selection controller that the animation is done so it can finalize cleanup
        if (this._selectionController && (this._selectionController as any).onPromptHidden) {
          ;(this._selectionController as any).onPromptHidden(this)
        }
      }
    })
  }

  public show() {
    if (!this._root || !this._rootTransform) {
      this._root = this.sceneObject.getChild(0)
      this._rootTransform = this._root.getTransform()
    }
    if (!this._baseLocalPos) {
      this._baseLocalPos = this._rootTransform.getLocalPosition()
    }
    if (this._cancelAnim) {
      this._cancelAnim()
      this._cancelAnim = null
    }
    const currentScale = this._rootTransform.getLocalScale()
    const base = this._hasNonZeroScale(this._baseScale)
      ? this._baseScale
      : this._hasNonZeroScale(currentScale)
        ? currentScale
        : new vec3(1, 1, 1)
    this._baseScale = base
    this._root.enabled = true
    this._rootTransform.setLocalScale(base.uniformScale(0))
    // Start slightly forward towards the camera
    const startFx = this._baseLocalPos.x
    const startFy = this._baseLocalPos.y
    const startFz = this._baseLocalPos.z - 0.5
    this._rootTransform.setLocalPosition(new vec3(startFx, startFy, startFz))
    this._cancelAnim = animate({
      duration: 0.25,
      easing: "ease-out-back-cubic",
      update: (t: number) => {
        this._rootTransform.setLocalScale(base.uniformScale(t))
        // Move from forward offset back to base during show
        const nx = startFx + (this._baseLocalPos.x - startFx) * t
        const ny = startFy + (this._baseLocalPos.y - startFy) * t
        const nz = startFz + (this._baseLocalPos.z - startFz) * t
        this._rootTransform.setLocalPosition(new vec3(nx, ny, nz))
      },
      ended: () => {
        this._cancelAnim = null
        // Ensure final position is exactly base
        this._rootTransform.setLocalPosition(this._baseLocalPos)
      }
    })
  }

  getHeight() {
    return 5
  }
}
