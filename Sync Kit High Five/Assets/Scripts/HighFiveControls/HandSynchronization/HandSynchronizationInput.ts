/**
 * Specs Inc. 2026
 * Hand Synchronization Input component for the High Five Spectacles lens.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class HandSynchronizationInput extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">HandSynchronizationInput – hand tracking scene reference</span><br/><span style="color: #94A3B8; font-size: 11px;">Provides the scene object used to follow the user hand position.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("The scene object that is positioned at the user hand in the scene")
  readonly box: SceneObject

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
    this.logger = new Logger("HandSynchronizationInput", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }
}
