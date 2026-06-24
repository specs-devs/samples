/**
 * Specs Inc. 2026
 * Bubble Animation Controller Input for the High Five Spectacles lens experience.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class BubbleAnimationControllerInput extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">BubbleAnimationControllerInput – bubble animation inputs</span><br/><span style="color: #94A3B8; font-size: 11px;">Provides visual component references for the high-five bubble animation.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Visuals</span>')
  @input
  @hint("Outer glow render mesh visual surrounding the bubble")
  readonly outerGlow: RenderMeshVisual

  @input
  @hint("Main bubble sphere render mesh visual")
  readonly bubbleSphere: RenderMeshVisual

  @input
  @hint("Root scene object for the entire bubble hierarchy")
  readonly overallBubble: SceneObject

  @input
  @hint("Text component displaying the high-five message and friend name")
  readonly wasHighFiveText: Text

  @input
  @hint("Rim material applied to the bubble model")
  modelRim: Material

  @input
  @hint("Index selecting the color palette entry for the bubble")
  colorID: number = 0

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("BubbleAnimationControllerInput", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }
}
