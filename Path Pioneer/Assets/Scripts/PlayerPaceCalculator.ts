/**
 * Specs Inc. 2026
 * Player Pace Calculator component for the Path Pioneer Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class PlayerPaceCalculator extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private oPos: vec3
  private t: number
  private cps: number
  private testIncrement: number

  onAwake(): void {
    this.logger = new Logger("PlayerPaceCalculator", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
  }

  start(pos: vec3) {
    this.t = 0
    this.cps = 0
    this.testIncrement = 0.5
    this.oPos = pos
  }

  getPace(pos: vec3) {
    const dt = getDeltaTime()
    this.t += dt
    let dist = 0

    if (this.t > this.testIncrement) {
      // Cm moved since last sample
      dist = pos.distance(this.oPos)
      this.oPos = pos

      // Pace in cm per sec (cps)
      this.cps = dist / this.t

      this.t = 0
    }

    return {nPos: pos, pace: this.cps, dist, dt}
  }
}
