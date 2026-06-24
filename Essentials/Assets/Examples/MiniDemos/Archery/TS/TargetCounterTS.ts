/**
 * Specs Inc. 2026
 * Target Counter TS component for the Essentials Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"

@component
export class TargetCounterTS extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">TargetCounterTS – count projectile hits on the target</span><br/><span style="color: #94A3B8; font-size: 11px;">Detects arrow or projectile collisions using physics overlap events and updates a counter display.</span>')
  @ui.separator

  @input
  @hint("Text component to display the counter")
  counterText!: Component

  @input
  @hint("Tag to identify arrows/projectiles")
  arrowTag: string = "Arrow"

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private counter: number = 0
  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("TargetCounterTS", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.initializeCollisionDetection()
  }

  initializeCollisionDetection(): void {
    const collider = this.getSceneObject().getComponent("Physics.ColliderComponent")

    if (collider) {
      if ((collider as any).onCollisionEnter) {
        ;(collider as any).onCollisionEnter.add((e) => {
          this.onCollisionEnter(e)
        })
        this.logger.info("Target counter: Collision detection initialized")
      } else {
        if ((collider as any).onOverlapEnter) {
          ;(collider as any).onOverlapEnter.add((e) => {
            this.onOverlapEnter(e)
          })
          this.logger.info("Target counter: Overlap detection initialized")
        } else {
          this.logger.warn("Target counter: No collision or overlap events available")
          this.createEvent("UpdateEvent").bind(this.manualCollisionCheck.bind(this))
        }
      }
    } else {
      this.logger.warn("Target counter: No collider component found")
      this.createEvent("UpdateEvent").bind(this.manualCollisionCheck.bind(this))
    }

    this.updateCounterDisplay()
  }

  onCollisionEnter(collisionData: any): void {
    const collidingObject = collisionData.collision.getOtherObject(this.getSceneObject())

    if (collidingObject && this.isArrow(collidingObject)) {
      this.incrementCounter()
    }
  }

  onOverlapEnter(overlapData: any): void {
    const overlappingObject = overlapData.overlap.collider.getSceneObject()

    if (overlappingObject && this.isArrow(overlappingObject)) {
      this.incrementCounter()
    }
  }

  manualCollisionCheck(): void {
    this.logger.warn("Using manual collision detection for target counter. This is less accurate.")
  }

  isArrow(obj: SceneObject): boolean {
    const objName = obj.name.toLowerCase()
    return objName.includes("arrow") || objName.includes("projectile")
  }

  incrementCounter(): void {
    this.counter++
    this.logger.info("Target hit! Counter: " + this.counter)
    this.updateCounterDisplay()
  }

  updateCounterDisplay(): void {
    if (this.counterText) {
      const formattedCounter = this.counter.toString().padStart(2, "0")
      ;(this.counterText as any).text = formattedCounter
    }
  }
}
