/**
 * Specs Inc. 2026
 * Internet Availability Pop Up component for the Agentic Playground Spectacles lens.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {LSTween} from "LSTween.lspkg/LSTween"
import Easing from "LSTween.lspkg/TweenJS/Easing"

@component
export class InternetAvailabilityPopUp extends BaseScriptComponent {
  @input popup: SceneObject


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
    this.logger = new Logger("InternetAvailabilityPopUp", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.isInternetAvailable(global.deviceInfoSystem.isInternetAvailable(), 0)
  }

  isInternetAvailable = (bool: boolean, timeOverride = 300) => {
    if (bool) {
      LSTween.scaleToLocal(this.popup.getChild(0).getTransform(), vec3.one().uniformScale(0.01), timeOverride)
        .easing(Easing.Cubic.Out)
        .onComplete(() => {
          this.popup.enabled = false
        })
        .start()
    } else {
      LSTween.scaleToLocal(this.popup.getChild(0).getTransform(), vec3.one(), timeOverride)
        .easing(Easing.Cubic.In)
        .start()
      this.popup.enabled = true
    }
  }
}
