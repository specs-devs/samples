/**
 * Specs Inc. 2026
 * Play Audio component for the Think Out Loud Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class PlayAudio extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PlayAudio – plays an AudioComponent on awake</span><br/><span style="color: #94A3B8; font-size: 11px;">Attach to any SceneObject with an AudioComponent to auto-play on scene start.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Audio</span>')
  @input
  @hint("AudioComponent to play when the lens starts")
  audio: AudioComponent

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
    this.logger = new Logger("PlayAudio", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.audio.play(1)
  }
}
