/**
 * Specs Inc. 2026
 * Volume Controller for the DJ Specs Spectacles lens experience.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";

@component
export class VolumeController extends BaseScriptComponent {
  @ui.label(
    '<span style="color: #60A5FA;">VolumeController – dual-deck volume crossfader</span><br/><span style="color: #94A3B8; font-size: 11px;">Call setVolume(0-1) to crossfade between deck 1 and deck 2.</span>'
  )
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input("Component.ScriptComponent")
  @hint("AudioController script component to control")
  audioController: ScriptComponent;

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;

  onAwake(): void {
    this.logger = new Logger(
      "VolumeController",
      this.enableLogging || this.enableLoggingLifecycle,
      true
    );
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
    this.setVolume(0.5);
  }

  setVolume(value: number): void {
    (this.audioController as any).volume = value;
    (this.audioController as any).volume2 = 1.0 - value;
  }
}
