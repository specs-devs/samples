/**
 * Specs Inc. 2026
 * Activate Microphone Recorder component for the Voice Playback Spectacles lens.
 */
import { BaseButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/BaseButton"
import { MicrophoneRecorder } from "./MicrophoneRecorder"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class ActivateMicrophoneRecorder extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ActivateMicrophoneRecorder – Triggers recording on button press</span><br/><span style="color: #94A3B8; font-size: 11px;">Assign the MicrophoneRecorder and optional button to enable recording control.</span>')
  @ui.separator

  @input
  @hint("The MicrophoneRecorder component to control for recording")
  microphoneRecorder: MicrophoneRecorder

  @input
  @allowUndefined
  @hint("Optional button that starts recording on press and stops on release")
  button: BaseButton | undefined

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  onAwake() {
    this.logger = new Logger("ActivateMicrophoneRecorder", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    if (this.button) {
      this.button.onTriggerDown.add(() => {
        this.microphoneRecorder.recordMicrophoneAudio(true)
      })
      this.button.onTriggerUp.add(() => {
        this.microphoneRecorder.recordMicrophoneAudio(false)
      })
    }
  }
}
