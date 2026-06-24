/**
 * Specs Inc. 2026
 * Audio Located Object component for the Custom Locations Spectacles lens.
 */
import { LocatedObject } from "./LocatedObject"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"

/**
 * Plays an audio sound while at a location.
 */
@component
export class AudioLocatedObject extends BaseScriptComponent implements LocatedObject {
  @ui.label('<span style="color: #60A5FA;">AudioLocatedObject – Plays audio at a location</span><br/><span style="color: #94A3B8; font-size: 11px;">Plays an audio component when the location is activated and stops it when the user moves away.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Audio</span>')
  @input
  @hint("Audio component to play when the location is activated")
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
    this.logger = new Logger("AudioLocatedObject", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  public activate(): void {
    this.audio.play(1)
  }

  public deactivate(): void {
    this.audio.stop(true)
  }

  public localize(): void {}
}
