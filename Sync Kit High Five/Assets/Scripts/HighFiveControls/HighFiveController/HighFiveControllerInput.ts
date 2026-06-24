/**
 * Specs Inc. 2026
 * High Five Controller Input for the High Five Spectacles lens experience.
 */
import {BubbleAnimationControllerInput} from "../BubbleAnimationController/BubbleAnimationControllerInput"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class HighFiveControllerInput extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">HighFiveControllerInput – high-five controller dependencies</span><br/><span style="color: #94A3B8; font-size: 11px;">Provides the bubble animation controller input to the high-five controller.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("The bubble animation controller input used for high-five visual feedback")
  readonly bubbleAnimationControllerInput: BubbleAnimationControllerInput

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
    this.logger = new Logger("HighFiveControllerInput", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }
}
