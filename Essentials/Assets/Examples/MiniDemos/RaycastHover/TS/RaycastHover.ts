/**
 * Specs Inc. 2026
 * Raycast Hover TS component for the Essentials Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"
import { LSTween } from "LSTween.lspkg/Examples/Scripts/LSTween"

@component
export class RaycastHoverTS extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">RaycastHoverTS – scale a panel on raycast hover</span><br/><span style="color: #94A3B8; font-size: 11px;">Detects when the ray between two points hits a collider and animates the target panel scale.</span>')
  @ui.separator

  @input
  @hint("The origin SceneObject of the ray")
  rayStart: SceneObject

  @input
  @hint("The destination SceneObject of the ray")
  rayEnd: SceneObject

  @input
  @hint("The panel SceneObject to scale on hover")
  targetPanel: SceneObject

  @input
  @hint("The collider SceneObject to test the ray against")
  targetCollider: SceneObject

  @input
  @hint("Duration of the scale animation in milliseconds")
  animationDuration: number = 500

  @input
  @hint("Default scale of the panel when not hovered")
  normalScale: vec3 = new vec3(1, 1, 1)

  @input
  @hint("Expanded scale of the panel when hovered")
  expandedScale: vec3 = new vec3(1.2, 1.2, 1.2)

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private isHovering: boolean = false
  private lastHitName: string = ""
  private logger: Logger

  onAwake() {
    this.logger = new Logger("RaycastHoverTS", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    if (!this.rayStart || !this.rayEnd) {
      this.logger.error("Ray start and end points must be defined")
      return
    }

    if (!this.targetPanel) {
      this.logger.error("Target panel must be defined")
      return
    }

    if (!this.targetCollider) {
      this.logger.error("Target collider must be defined")
      return
    }
  }

  @bindUpdateEvent
  updateRaycast() {
    const globalProbe = Physics.createGlobalProbe()
    const self = this

    globalProbe.rayCast(
      this.rayStart.getTransform().getWorldPosition(),
      this.rayEnd.getTransform().getWorldPosition(),
      function (hit) {
        if (hit) {
          const hitObject = hit.collider.getSceneObject()
          const hitName = hitObject.name

          const isTargetCollider = hitObject === self.targetCollider || hitName === self.targetCollider.name

          if (isTargetCollider && !self.isHovering) {
            self.onRaycastEnter()
            self.lastHitName = hitName
          } else if (!isTargetCollider && self.isHovering) {
            self.onRaycastExit()
          }
        } else if (self.isHovering) {
          self.onRaycastExit()
        }
      }
    )
  }

  onRaycastEnter() {
    this.logger.info("Raycast entered target: " + this.targetCollider.name)
    this.isHovering = true
    this.scaleUp()
  }

  onRaycastExit() {
    this.logger.info("Raycast exited target: " + this.lastHitName)
    this.isHovering = false
    this.scaleDown()
  }

  scaleUp() {
    LSTween.scaleToWorld(this.targetPanel.getTransform(), this.expandedScale, this.animationDuration).start()
  }

  scaleDown() {
    LSTween.scaleToWorld(this.targetPanel.getTransform(), this.normalScale, this.animationDuration).start()
  }
}
