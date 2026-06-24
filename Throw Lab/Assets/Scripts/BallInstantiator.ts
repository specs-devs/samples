/**
 * Specs Inc. 2026
 * Ball Instantiator component for the Throw Lab Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent, bindUpdateEvent } from "SnapDecorators.lspkg/decorators"

/**
 * BallInstantiator - TypeScript component for Lens Studio
 * Instantiates ball prefabs at regular intervals and throws them using physics
 */
@component
export class BallInstantiator extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">BallInstantiator – Periodically spawn and throw balls</span><br/><span style="color: #94A3B8; font-size: 11px;">Instantiates a prefab at a spawn point and throws it toward a target using physics impulse.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Prefab to instantiate")
  prefab!: ObjectPrefab

  @input
  @hint("Spawn position - where balls spawn")
  spawnPosition!: SceneObject

  @input
  @hint("Target position - direction to throw balls toward")
  targetPosition!: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Spawn Settings</span>')
  @input
  @hint("Time between spawning balls in seconds")
  spawnInterval: number = 2.0

  @input
  @hint("Force magnitude to apply when throwing ball")
  throwForce: number = 500.0

  @input
  @hint("Maximum lifetime of balls in seconds before auto-destruction")
  maxLifetime: number = 10.0

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private nextSpawnTime: number = 0
  private activeBalls: Map<SceneObject, number> = new Map()

  onAwake(): void {
    this.logger = new Logger("BallInstantiator", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.nextSpawnTime = getTime()
    this.logger.info("Ball Instantiator started")
  }

  @bindUpdateEvent
  onUpdate(): void {
    const currentTime = getTime()
    if (currentTime >= this.nextSpawnTime) {
      this.spawnBall()
      this.nextSpawnTime = currentTime + this.spawnInterval
    }

    this.cleanupOldBalls(currentTime)
  }

  spawnBall(): void {
    if (!this.prefab || !this.spawnPosition || !this.targetPosition) {
      this.logger.error("Required inputs not assigned (prefab, spawnPosition, or targetPosition)")
      return
    }

    const ball = this.prefab.instantiate(this.sceneObject)
    if (!ball) {
      this.logger.error("Failed to instantiate ball")
      return
    }

    const spawnPos = this.spawnPosition.getTransform().getWorldPosition()
    ball.getTransform().setWorldPosition(spawnPos)

    const targetPos = this.targetPosition.getTransform().getWorldPosition()
    const throwDirection = targetPos.sub(spawnPos).normalize()

    const bodyComponent = ball.getComponent("Physics.BodyComponent")
    if (bodyComponent) {
      ;(bodyComponent as any).dynamic = true

      const forceVector = throwDirection.uniformScale(this.throwForce)
      this.logger.debug(
        `Throw direction: ${throwDirection.x.toFixed(2)}, ${throwDirection.y.toFixed(2)}, ${throwDirection.z.toFixed(2)}`
      )
      this.logger.debug(
        `Force vector: ${forceVector.x.toFixed(2)}, ${forceVector.y.toFixed(2)}, ${forceVector.z.toFixed(2)}`
      )

      ;(bodyComponent as any).addForce(forceVector, Physics.ForceMode.Impulse)
      this.logger.debug("Force applied to ball")
    } else {
      this.logger.warn("Ball has no BodyComponent, cannot apply force")
    }

    this.activeBalls.set(ball, getTime())

    this.logger.info(`Spawned ball at ${spawnPos.x.toFixed(2)}, ${spawnPos.y.toFixed(2)}, ${spawnPos.z.toFixed(2)}`)
  }

  cleanupOldBalls(currentTime: number): void {
    const ballsToRemove: SceneObject[] = []

    this.activeBalls.forEach((spawnTime, ball) => {
      if (!ball) {
        ballsToRemove.push(ball)
        return
      }

      const lifetime = currentTime - spawnTime
      if (lifetime > this.maxLifetime) {
        try {
          ball.destroy()
          ballsToRemove.push(ball)
        } catch (e) {
          this.logger.error("Error destroying ball: " + e)
          ballsToRemove.push(ball)
        }
      }
    })

    for (const ball of ballsToRemove) {
      this.activeBalls.delete(ball)
    }
  }
}
