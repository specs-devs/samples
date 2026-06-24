/**
 * Specs Inc. 2026
 * Progress Bar Controller for the Path Pioneer Spectacles lens experience.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { ValidationUtils } from "Utilities.lspkg/Scripts/Utils/ValidationUtils"

@component
export class ProgressBarController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ProgressBarController – path progress indicator</span><br/><span style="color: #94A3B8; font-size: 11px;">Moves the pointer and updates bar material based on walk progress.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Scene object used as the sliding progress pointer")
  private pointer: SceneObject

  @input
  @hint("Text component displaying the percentage value")
  private textComponent: Text

  @input
  @hint("Array of materials used for visual state representation")
  private Mats: Material[]

  @input
  @hint("Bar material whose currentPosition parameter tracks walk progress")
  private BarMat: Material

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @input
  @hint("Starting progress value shown before walking begins")
  private initialProgress: number = 0

  @input
  @hint("Global opacity multiplier applied to bar materials")
  private globalOpacity: number = 1

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Layout</span>')
  @input
  @hint("ScreenTransform marking the leftmost position of the progress bar")
  private startPosScreenTransform: ScreenTransform

  @input
  @hint("ScreenTransform marking the rightmost position of the progress bar")
  private endPosScreenTransform: ScreenTransform

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private pointerScreenTransform: ScreenTransform
  private startPos: vec2
  private endPos: vec2

  onAwake() {
    this.logger = new Logger("ProgressBarController", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");

    this.pointerScreenTransform = this.pointer.getComponent("Component.ScreenTransform")
    ValidationUtils.assertNotNull(this.pointerScreenTransform, "Pointer is required to have screen transform")
    this.startPos = this.startPosScreenTransform.anchors.getCenter()
    this.endPos = this.endPosScreenTransform.anchors.getCenter()
    this.setProgress(this.initialProgress)
  }

  setProgress(newProgress: number) {
    const newPointerPosition = MathUtils.remap(newProgress, 0, 1, this.startPos.x, this.endPos.x)
    this.pointerScreenTransform.anchors.setCenter(new vec2(newPointerPosition, this.startPos.y))
    this.BarMat.mainPass.currentPosition = newProgress
    const item = this.textComponent
    item.text = Math.floor(newProgress * 100) + "%"
  }
}
