/**
 * Specs Inc. 2026
 * Simple Raycast TS component for the Essentials Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent, bindUpdateEvent } from "SnapDecorators.lspkg/decorators"

@component
export class SimpleRaycastTS extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SimpleRaycastTS – perform a simple raycast between two scene objects</span><br/><span style="color: #94A3B8; font-size: 11px;">Casts a ray from rayStart to rayEnd every frame and moves the endpoint attachment to the hit position.</span>')
  @ui.separator

  @input
  @hint("The starting point of the raycast")
  rayStart: SceneObject

  @input
  @hint("The ending point of the raycast")
  rayEnd: SceneObject

  @input
  @hint("Scene object to place at the raycast hit position")
  endPointAttachment: SceneObject

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
    this.logger = new Logger("SimpleRaycastTS", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.logger.debug("EndPointAttachment object defined: " + (this.endPointAttachment !== undefined))
  }

  @bindStartEvent
  onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.logger.debug("EndPointAttachment object at start: " + (this.endPointAttachment !== undefined))
    if (this.endPointAttachment) {
      this.logger.debug("EndPointAttachment object name: " + this.endPointAttachment.name)
    }
  }

  @bindUpdateEvent
  updateObjectMovement() {
    const globalProbe = Physics.createGlobalProbe()

    this.logger.debug("EndPointAttachment object before raycast: " + (this.endPointAttachment !== undefined))

    const self = this

    globalProbe.rayCast(
      this.rayStart.getTransform().getWorldPosition(),
      this.rayEnd.getTransform().getWorldPosition(),
      function (hit) {
        if (hit) {
          const position = hit.position
          self.logger.info("Raycast hit: " + hit.collider.getSceneObject().name)

          if (self.endPointAttachment) {
            self.logger.debug("EndPointAttachment exists in callback, setting position")
            self.endPointAttachment.getTransform().setWorldPosition(position)
          } else {
            self.logger.error("EndPointAttachment is undefined in callback")
          }
        }
      }
    )
  }
}
