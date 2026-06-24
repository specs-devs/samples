/**
 * Specs Inc. 2026
 * Simple Raycast TS component for the SnapML Starter Spectacles lens.
 */
import {bindStartEvent, bindUpdateEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

// Given an object with a BodyComponent
// If the object intersects with the ray described
// by rayStart and rayEnd, print a message.
@component
export class SimpleRaycastTS extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SimpleRaycastTS – head-pose physics raycast</span><br/><span style="color: #94A3B8; font-size: 11px;">Casts a physics ray from rayStart to rayEnd each frame and snaps the attachment to the hit point.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Ray</span>')
  @input
  @hint("Scene object defining the start of the ray")
  rayStart: SceneObject

  @input
  @hint("Scene object defining the end of the ray")
  rayEnd: SceneObject

  @input
  @hint("Scene object repositioned to the raycast hit point")
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

          self.logger.debug("Raycast hit: " + hit.collider.getSceneObject().name)

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
