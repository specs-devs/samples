/**
 * Specs Inc. 2026
 * Camera Query Controller — triggers depth cache + Gemini light detection on button press.
 * Shows status feedback in a Text component.
 */
import {RoundButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {GeminiDepthLightEstimator} from "./GeminiDepthLightEstimator"

@component
export class CameraQueryController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CameraQueryController – depth cache light detection trigger</span>')
  @ui.separator

  @allowUndefined
  @input
  @hint("Round button that triggers the depth + Gemini light position request")
  private button: RoundButton

  @allowUndefined
  @input
  @hint("GeminiDepthLightEstimator that performs the actual position query")
  private geminiDepthLightEstimator: GeminiDepthLightEstimator

  @allowUndefined
  @input
  @hint("Text component to display detection status feedback")
  private statusText: Text

  @input
  @hint("Enable logging")
  enableLogging: boolean = false

  private logger: Logger

  onAwake() {
    this.logger = new Logger("CameraQueryController", this.enableLogging, true)
    if (this.statusText) this.statusText.text = ""
  }

  @bindStartEvent
  private onStart() {
    if (this.button && this.geminiDepthLightEstimator) {
      this.button.onTriggerUp.add(() => {
        this.logger.info("Camera button pressed -- requesting light positions")
        this.setStatus("Scanning for lamps...")
        this.geminiDepthLightEstimator.requestAllPositions(
          (count: number, message: string) => {
            if (count > 0) {
              this.setStatus("Found " + count + " lamp" + (count > 1 ? "s" : ""))
            } else {
              this.setStatus("No lamps found")
            }
            this.logger.info("Detection complete: " + count + " lamps — " + message)
          }
        )
      })
    } else {
      if (!this.button) this.logger.warn("No button wired")
      if (!this.geminiDepthLightEstimator) this.logger.warn("No GeminiDepthLightEstimator wired")
    }
  }

  private setStatus(msg: string): void {
    this.logger.info(msg)
    if (this.statusText) this.statusText.text = msg
  }
}
