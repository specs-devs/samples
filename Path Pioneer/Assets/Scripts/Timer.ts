/**
 * Specs Inc. 2026
 * Timer component for the Path Pioneer Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"
import {Conversions} from "./Conversions"

@component
export class Timer extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Timer – lap and session timer</span><br/><span style="color: #94A3B8; font-size: 11px;">Tracks elapsed time and formats it as MM:SS for display.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Text component showing the current running time")
  timerText: Text

  @input
  @hint("Text component showing the elapsed time of the last completed lap")
  lastLapTimeText: Text

  @input
  @hint("HUD scene object shown when a lap is completed")
  lastLapHUD: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private time: number = 0
  private runTimer: boolean = false

  onAwake() {
    this.logger = new Logger("Timer", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
    this.timerText.enabled = false
  }

  @bindUpdateEvent
  private onUpdate() {
    if (this.runTimer) {
      this.time += getDeltaTime()
      this.updateText(this.time, this.timerText)
    }
  }

  public stop() {
    this.time = 0
    this.updateText(this.time, this.timerText)
    this.updateText(this.time, this.lastLapTimeText)
    this.runTimer = false
  }

  start() {
    this.time = 0
    this.updateText(this.time, this.timerText)
    this.timerText.enabled = true
    this.runTimer = true
  }

  pause() {
    this.runTimer = false
  }

  incrementLap() {
    this.lastLapHUD.enabled = true
    this.updateText(this.time, this.lastLapTimeText)
  }

  private updateText(seconds: number, text: Text) {
    const minSec = Conversions.secToMin(seconds)
    const secStr = minSec.sec < 10 ? "0" + minSec.sec.toFixed(0) : minSec.sec.toFixed(0)
    const str = minSec.min + ":" + secStr
    text.text = str
  }
}
