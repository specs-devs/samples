/**
 * Specs Inc. 2026
 * Snap Saber Instantiator component for the Essentials Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent, bindUpdateEvent } from "SnapDecorators.lspkg/decorators"

@component
export class SnapSaberInstantiator extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SnapSaberInstantiator – spawn and animate SnapSaber target cubes</span><br/><span style="color: #94A3B8; font-size: 11px;">Instantiates prefabs at regular intervals and moves them toward a target with configurable rotation.</span>')
  @ui.separator

  @input
  @hint("Prefab to instantiate")
  prefab!: ObjectPrefab

  @input
  @hint("Spawn position – where prefabs appear from")
  spawnPosition!: SceneObject

  @input
  @hint("Target position – defines movement direction")
  targetPosition!: SceneObject

  @input
  @hint("Time between spawning prefabs in seconds")
  spawnInterval: number = 2.0

  @input
  @hint("Speed at which prefabs move toward the target")
  moveSpeed: number = 2.0

  @input
  @hint("Rotation speed on X axis in degrees per second")
  rotationSpeedX: number = 0.0

  @input
  @hint("Rotation speed on Y axis in degrees per second")
  rotationSpeedY: number = 90.0

  @input
  @hint("Rotation speed on Z axis in degrees per second")
  rotationSpeedZ: number = 0.0

  @input
  @hint("Maximum lifetime of prefabs in seconds before auto-destruction")
  maxLifetime: number = 10.0

  @input
  @hint("Destroy prefabs when they reach the target position")
  destroyOnReachTarget: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private nextSpawnTime: number = 0
  private activePrefabs: SceneObject[] = []
  private prefabData: Map<string, any> = new Map()
  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("SnapSaberInstantiator", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.logger.info("SnapSaber Instantiator started")
    this.nextSpawnTime = getTime() + this.spawnInterval
  }

  private generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  }

  @bindUpdateEvent
  onUpdate(): void {
    const currentTime = getTime()
    if (currentTime >= this.nextSpawnTime) {
      this.spawnPrefab()
      this.nextSpawnTime = currentTime + this.spawnInterval
    }

    this.updatePrefabs()
  }

  spawnPrefab(): void {
    if (!this.prefab || !this.spawnPosition || !this.targetPosition) {
      this.logger.error("Required inputs not assigned (prefab, spawnPosition, or targetPosition)")
      return
    }

    const instance = this.prefab.instantiate(this.sceneObject)
    if (!instance) {
      this.logger.error("Failed to instantiate prefab")
      return
    }

    const spawnPos = this.spawnPosition.getTransform().getWorldPosition()
    instance.getTransform().setWorldPosition(spawnPos)

    const targetPos = this.targetPosition.getTransform().getWorldPosition()
    const moveDirection = targetPos.sub(spawnPos).normalize()

    const instanceId = this.generateUniqueId()

    this.prefabData.set(instanceId, {
      creationTime: getTime(),
      moveDirection: moveDirection,
      originalDistance: spawnPos.distance(targetPos),
      id: instanceId
    })

    instance.name = `SnapSaberCube_${instanceId}`
    this.activePrefabs.push(instance)

    this.logger.info(`Spawned prefab at ${spawnPos.x.toFixed(2)}, ${spawnPos.y.toFixed(2)}, ${spawnPos.z.toFixed(2)}`)
  }

  updatePrefabs(): void {
    const currentTime = getTime()
    const deltaTime = getDeltaTime()
    const targetPos = this.targetPosition.getTransform().getWorldPosition()
    const prefabsToKeep: SceneObject[] = []
    const idsToRemove: string[] = []

    for (let i = 0; i < this.activePrefabs.length; i++) {
      const prefab = this.activePrefabs[i]
      let prefabToDestroy = false
      let instanceId = ""

      if (!prefab) {
        continue
      }

      try {
        if (typeof prefab.name !== "string") {
          this.logger.warn("Prefab name is not a string")
          continue
        }

        const idMatch = prefab.name.match(/SnapSaberCube_(\w+)/)
        if (!idMatch || !idMatch[1]) {
          this.logger.warn("Could not extract ID from prefab name: " + prefab.name)
          continue
        }

        instanceId = idMatch[1]
        const instanceData = this.prefabData.get(instanceId)

        if (!instanceData) {
          this.logger.warn("No instance data found for ID: " + instanceId)
          continue
        }

        const lifetime = currentTime - instanceData.creationTime

        if (lifetime > this.maxLifetime) {
          prefabToDestroy = true
          idsToRemove.push(instanceId)
        } else {
          try {
            const transform = prefab.getTransform()
            if (!transform) {
              this.logger.warn("Could not get transform for prefab")
              continue
            }

            const currentPos = transform.getWorldPosition()

            const moveAmount = this.moveSpeed * deltaTime
            const newPos = currentPos.add(instanceData.moveDirection.uniformScale(moveAmount))
            transform.setWorldPosition(newPos)

            const currentRot = transform.getLocalRotation()
            const xRad = this.rotationSpeedX * deltaTime * (Math.PI / 180)
            const yRad = this.rotationSpeedY * deltaTime * (Math.PI / 180)
            const zRad = this.rotationSpeedZ * deltaTime * (Math.PI / 180)

            const xRot = quat.angleAxis(xRad, new vec3(1, 0, 0))
            const yRot = quat.angleAxis(yRad, new vec3(0, 1, 0))
            const zRot = quat.angleAxis(zRad, new vec3(0, 0, 1))

            const newRot = currentRot.multiply(xRot).multiply(yRot).multiply(zRot)
            transform.setLocalRotation(newRot)

            if (this.destroyOnReachTarget) {
              const distToTarget = currentPos.distance(targetPos)
              if (distToTarget < 0.5) {
                prefabToDestroy = true
                idsToRemove.push(instanceId)
              }
            }
          } catch (e) {
            this.logger.error("Error updating prefab: " + e)
            prefabToDestroy = true
            idsToRemove.push(instanceId)
          }
        }

        if (prefabToDestroy) {
          try {
            prefab.destroy()
          } catch (e) {
            this.logger.error("Error destroying prefab: " + e)
          }
        } else {
          prefabsToKeep.push(prefab)
        }
      } catch (e) {
        try {
          if (e instanceof Error) {
            this.logger.error("Error in prefab update loop: " + e.message)
          } else {
            this.logger.error("Unknown error in prefab update loop")
          }
        } catch (printError) {
          // ignore
        }

        try {
          if (prefab) {
            prefab.destroy()
          }
        } catch (destroyError) {
          // ignore
        }

        if (instanceId) {
          idsToRemove.push(instanceId)
        }
      }
    }

    for (const id of idsToRemove) {
      this.prefabData.delete(id)
    }

    this.activePrefabs = prefabsToKeep
  }
}
