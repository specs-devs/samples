/**
 * Specs Inc. 2026
 * Loading component for the Depth Cache Spectacles lens.
 */
import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class Loading extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Loading – animated loading indicator</span><br/><span style="color: #94A3B8; font-size: 11px;">Scales in and out using an elastic animation when activated.</span>')
  @ui.separator

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private loadingTrans: Transform
  private startScale: vec3

  onAwake() {
    this.logger = new Logger("Loading", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.loadingTrans = this.getSceneObject().getTransform()
    this.startScale = this.loadingTrans.getLocalScale()
    this.loadingTrans.setLocalScale(vec3.zero())
  }

  activateLoder(activate: boolean) {
    const currScale = this.loadingTrans.getLocalScale()
    const desiredScale = activate ? this.startScale : vec3.zero()
    animate({
      easing: "ease-out-elastic",
      duration: 0.5,
      update: (t) => {
        this.loadingTrans.setLocalScale(vec3.lerp(currScale, desiredScale, t))
      },
      ended: null,
      cancelSet: new CancelSet()
    })
  }
}
