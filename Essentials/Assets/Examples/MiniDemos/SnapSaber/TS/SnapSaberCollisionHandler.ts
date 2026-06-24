/**
 * Specs Inc. 2026
 * Snap Saber Collision Handler component for the Essentials Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"
import {SnapSaberGlobalManager} from "./SnapSaberGlobalManager"

@component
export class SnapSaberCollisionHandler extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SnapSaberCollisionHandler – detect saber-to-target collisions</span><br/><span style="color: #94A3B8; font-size: 11px;">Registers physics overlap events to detect when the saber hits SnapSaber target cubes.</span>')
  @ui.separator

  @input
  @hint("The saber object with the collider component")
  saberObject!: SceneObject

  @input
  @hint("Tag or name prefix to identify target objects")
  targetIdentifier: string = "SnapSaberCube"

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private collider: Component
  private scoreManagerComponent: any
  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("SnapSaberCollisionHandler", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")

    if (this.saberObject) {
      this.collider = this.saberObject.getComponent("Physics.ColliderComponent")

      if (!this.collider) {
        this.logger.error("No collider component found on saber object")
        return
      }

      this.setupCollisionDetection()
    } else {
      this.logger.error("Saber object not assigned")
    }

    this.logger.info("SnapSaber Collision Handler initialized")
  }

  private setupCollisionDetection(): void {
    ;(this.collider as any).onOverlapEnter.add((e) => {
      this.onOverlapEnter(e.overlap)
    })
  }

  private onOverlapEnter(overlap: any): void {
    const collidingObject = overlap.collider.getSceneObject()

    if (collidingObject && collidingObject.name.includes(this.targetIdentifier)) {
      this.logger.info(`Saber hit target: ${collidingObject.name}`)

      const globalManager = SnapSaberGlobalManager.getInstance()
      if (globalManager) {
        this.logger.debug("Using global manager to register hit")
        globalManager.registerHit(collidingObject)
        return
      }

      if (this.scoreManagerComponent && typeof this.scoreManagerComponent.registerHit === "function") {
        this.logger.debug("Calling registerHit on direct score manager")
        try {
          this.scoreManagerComponent.registerHit(collidingObject)
          this.logger.debug("Successfully registered hit via direct component!")
        } catch (e) {
          this.logger.error("Error calling registerHit: " + e)
          collidingObject.destroy()
        }
      } else {
        this.logger.warn("All score manager methods unavailable, just destroying target")
        collidingObject.destroy()
      }
    }
  }
}
