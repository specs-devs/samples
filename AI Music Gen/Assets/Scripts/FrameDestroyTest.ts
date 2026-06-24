/**
 * Specs Inc. 2026
 * Frame Destroy Test component for the AI Music Gen Spectacles lens.
 */
import animate from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class FrameDestroyTest extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Frame Destroy Test – timed scene object destruction</span><br/><span style="color: #94A3B8; font-size: 11px;">Counts down 3 seconds then destroys its scene object to test Frame OnDestroyEvent.</span>')
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
    this.logger = new Logger("FrameDestroyTest", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.logger.debug("OnStartEvent fired - starting 3 second countdown")
    // Wait 3 seconds, then destroy the scene object
    animate({
      duration: 3.0,
      update: (t: number) => {
        // Log progress every 0.5 seconds
        const elapsed = t * 3.0
        if (Math.floor(elapsed * 2) !== Math.floor((elapsed - 0.016) * 2)) {
          const remaining = 3.0 - elapsed
          this.logger.debug(`${remaining.toFixed(1)} seconds remaining`)
        }
      },
      ended: () => {
        this.logger.debug("3 seconds elapsed - destroying scene object")
        // Destroy the scene object
        // This will trigger Frame's OnDestroyEvent if a Frame component is attached
        try {
          if (this.sceneObject) {
            this.logger.debug("Calling sceneObject.destroy()")
            this.sceneObject.destroy()
          } else {
            this.logger.error("sceneObject is null!")
          }
        } catch (e) {
          // Suppress any errors from Frame's cleanup code
          this.logger.error(`Error during destruction: ${e}`)
        }
      }
    })
  }
}
