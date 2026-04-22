/**
 * Specs Inc. 2026
 * Internet Availability Pop Up component for the AI Music Gen Spectacles lens.
 */
import animate from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {MathUtils} from "Utilities.lspkg/Scripts/Utils/MathUtils"

@component
export class InternetAvailabilityPopUp extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Internet Availability Pop Up – connectivity status overlay</span><br/><span style="color: #94A3B8; font-size: 11px;">Animates a popup in or out when internet availability changes.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Root SceneObject of the popup panel that appears when offline")
  popup: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private _cancelAnim: (() => void) | null = null

  onAwake() {
    this.logger = new Logger("InternetAvailabilityPopUp", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    global.deviceInfoSystem.onInternetStatusChanged.add((args) => {
      this.isInternetAvailable(args.isInternetAvailable)
    })
    this.isInternetAvailable(global.deviceInfoSystem.isInternetAvailable(), 0)
  }

  isInternetAvailable = (bool: boolean, timeOverride = 300) => {
    const rootObj = this.popup?.getChild(0)
    if (!rootObj) {
      return
    }

    const tr = rootObj.getTransform()
    const currentScale = tr.getLocalScale() || vec3.one()
    const targetScale = bool ? vec3.one().uniformScale(0.01) : vec3.one()
    const durationSec = (timeOverride ?? 300) / 1000

    if (this._cancelAnim) {
      this._cancelAnim()
      this._cancelAnim = null
    }

    if (durationSec <= 0) {
      tr.setLocalScale(targetScale)
      this.popup.enabled = !bool
      return
    }

    if (!bool) {
      this.popup.enabled = true
    }

    const sx = currentScale.x
    const sy = currentScale.y
    const sz = currentScale.z
    const ex = targetScale.x
    const ey = targetScale.y
    const ez = targetScale.z

    this._cancelAnim = animate({
      duration: durationSec,
      easing: bool ? "ease-out-cubic" : "ease-in-cubic",
      update: (t: number) => {
        const nx = MathUtils.lerp(sx, ex, t)
        const ny = MathUtils.lerp(sy, ey, t)
        const nz = MathUtils.lerp(sz, ez, t)
        tr.setLocalScale(new vec3(nx, ny, nz))
      },
      ended: () => {
        this._cancelAnim = null
        if (bool) {
          this.popup.enabled = false
        }
      }
    })
  }
}
