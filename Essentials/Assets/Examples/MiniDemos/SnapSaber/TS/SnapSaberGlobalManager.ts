/**
 * Specs Inc. 2026
 * Snap Saber Global Manager handling core logic for the Essentials lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"

@component
export class SnapSaberGlobalManager extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SnapSaberGlobalManager – singleton score manager for SnapSaber</span><br/><span style="color: #94A3B8; font-size: 11px;">Global singleton that tracks score and registers target hits from any component.</span>')
  @ui.separator

  @input
  @hint("Text component that displays the score")
  scoreText!: Component

  @input
  @hint("Points awarded for each successful hit")
  pointsPerHit: number = 10

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private score: number = 0
  private lastHitTime: number = 0
  private hitCooldown: number = 0.1
  private isInitialized: boolean = false
  private globalInstanceName: string = "SnapSaberGlobalManagerInstance"
  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("SnapSaberGlobalManager", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    // @ts-ignore - Accessing global scope
    global[this.globalInstanceName] = this

    this.logger.info("SnapSaber Global Manager initialized via global variable")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")

    this.score = 0
    this.updateScoreDisplay()

    this.isInitialized = true
    this.logger.info("SnapSaber Global Manager started")
  }

  static getInstance(): SnapSaberGlobalManager | null {
    try {
      // @ts-ignore - Accessing global scope
      return global["SnapSaberGlobalManagerInstance"] || null
    } catch (e) {
      print("Error accessing global manager: " + e)
      return null
    }
  }

  registerHit(targetObject: SceneObject): void {
    if (!this.isInitialized) return

    const currentTime = getTime()

    if (currentTime - this.lastHitTime < this.hitCooldown) {
      return
    }

    this.score += this.pointsPerHit
    this.lastHitTime = currentTime

    this.updateScoreDisplay()

    this.logger.info(`Global Manager: Target hit! New score: ${this.score}`)

    if (targetObject) {
      try {
        targetObject.destroy()
      } catch (e) {
        this.logger.error("Error destroying target: " + e)
      }
    }
  }

  getScore(): number {
    return this.score
  }

  private updateScoreDisplay(): void {
    if (this.scoreText) {
      try {
        ;(this.scoreText as any).text = `Score: ${this.score}`
      } catch (e) {
        this.logger.error("Error updating score display: " + e)
      }
    }
  }
}
