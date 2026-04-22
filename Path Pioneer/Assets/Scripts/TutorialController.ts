/**
 * Specs Inc. 2026
 * Tutorial Controller for the Path Pioneer Spectacles lens experience.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import {UI} from "./UI"

@component
export class TutorialController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">TutorialController – tutorial orchestrator</span><br/><span style="color: #94A3B8; font-size: 11px;">Triggers tutorial UI flow and notifies when the tutorial completes.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("UI controller used to show and progress the tutorial screens")
  ui: UI

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
    this.logger = new Logger("TutorialController", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
  }

  startTutorial(onTutorialFinished: () => void) {
    this.ui.showTutorialUi()
    this.ui.tutorialComplete.add(() => {
      onTutorialFinished()
    })
  }
}
