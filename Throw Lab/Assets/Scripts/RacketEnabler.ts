/**
 * Specs Inc. 2026
 * Racket Enabler component for the Throw Lab Spectacles lens.
 */
import {BaseButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/BaseButton"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class RacketEnabler extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">RacketEnabler – Enables a target object on button trigger</span><br/><span style="color: #94A3B8; font-size: 11px;">Assign a button and target object; the target will be enabled when the button is triggered.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Button that triggers enabling the target object")
  button: BaseButton

  @input
  @hint("Scene object to enable when the button is triggered")
  targetObject: SceneObject

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
    this.logger = new Logger("RacketEnabler", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    if (!this.button) {
      this.logger.warn("No button assigned.")
      return
    }

    if (!this.targetObject) {
      this.logger.warn("No target object assigned.")
      return
    }

    this.button.onTriggerUp.add(() => {
      this.enableTarget()
    })
  }

  enableTarget() {
    if (this.targetObject) {
      this.targetObject.enabled = true
      this.logger.info("Enabled " + this.targetObject.name)
    }
  }
}
