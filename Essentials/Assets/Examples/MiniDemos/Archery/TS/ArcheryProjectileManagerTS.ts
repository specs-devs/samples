/**
 * Specs Inc. 2026
 * Archery Projectile Manager TS handling core logic for the Essentials lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent, bindUpdateEvent } from "SnapDecorators.lspkg/decorators"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"

@component
export class ArcheryProjectileManagerTS extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ArcheryProjectileManagerTS – archery projectile manager</span><br/><span style="color: #94A3B8; font-size: 11px;">Manages arrow charging and firing with physics-based projectile motion and score tracking.</span>')
  @ui.separator

  @input
  @hint("Initial velocity of projectiles when fired (higher = faster arrows)")
  initialSpeed: number = 30.0

  @input
  @hint("Gravity effect on projectiles (lower = flatter trajectory)")
  gravityStrength: number = 15.0

  @input
  @hint("Air resistance factor (higher = more drag, slower arrows)")
  dragFactor: number = 0.005

  @input
  @hint("Projectile to instantiate when firing")
  projectile!: ObjectPrefab

  @input
  @hint("Start point for the shooting ray")
  shootingRayStart!: SceneObject

  @input
  @hint("End point for the shooting ray")
  shootingRayEnd!: SceneObject

  @input
  @hint("Start point for the charging line")
  lineA!: SceneObject

  @input
  @hint("End point for the charging line")
  lineB!: SceneObject

  @input
  @hint("Object that visualizes the charge level")
  archCharger!: SceneObject

  @input
  @hint("Hand position reference")
  manipulatingObject!: SceneObject

  @input
  @hint("Text component to display charging percentage")
  chargingText!: Component

  @input
  @hint("Text component to display score")
  scoreText!: Component

  @input
  @hint("Target object that rotates (for scoring)")
  rotatingTarget!: SceneObject

  @input
  @hint("The interactable object for manipulation")
  interactableManipulation: Interactable

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private score: number = 0
  private previousChargeLevel: number = 0
  private chargeThreshold: number = 1.0
  private shootCount: number = 0
  private canShoot: boolean = true
  private shotCooldownTime: number = 1.0
  private lastShotTime: number = 0
  private logger: Logger

  onAwake() {
    this.logger = new Logger("ArcheryProjectileManagerTS", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")

    const onTriggerStartCallback = (event: InteractorEvent) => {
      this.logger.debug("TRIGGER START DETECTED")
      this.logger.info("Trigger start detected")
    }

    const onTriggerEndCallback = (event: InteractorEvent) => {
      this.logger.debug("TRIGGER END DETECTED - Not shooting on release")
      this.logger.info("TRIGGER END DETECTED - No action needed")
    }

    this.interactableManipulation.onInteractorTriggerStart(onTriggerStartCallback)
    this.interactableManipulation.onInteractorTriggerEnd(onTriggerEndCallback)

    if (this.chargingText) {
      ;(this.chargingText as any).text = "0.00"
    }

    if (this.scoreText) {
      ;(this.scoreText as any).text = "Score: 0"
    }

    this.logger.debug("ArcheryProjectileManagerTS initialized")
  }

  @bindUpdateEvent
  onUpdate(): void {
    if (!this.canShoot) {
      const currentTime = getTime()
      const timeSinceLastShot = currentTime - this.lastShotTime

      if (timeSinceLastShot > this.shotCooldownTime) {
        this.canShoot = true
        this.logger.debug("Ready to shoot again")
      }
    }

    if (this.manipulatingObject && this.lineA && this.lineB) {
      const closestPoint = this.closestPointOnLine(
        this.manipulatingObject.getTransform().getWorldPosition(),
        this.lineA.getTransform().getWorldPosition(),
        this.lineB.getTransform().getWorldPosition()
      )

      this.archCharger.getTransform().setWorldPosition(closestPoint)

      const startPos = this.lineA.getTransform().getWorldPosition()
      const endPos = this.lineB.getTransform().getWorldPosition()

      const lineVector = endPos.sub(startPos)
      const pointVector = closestPoint.sub(startPos)
      const dotProduct = pointVector.dot(lineVector.normalize())
      const lineLength = lineVector.length

      const chargeLevel = lineLength > 0 ? Math.max(0, Math.min(1, dotProduct / lineLength)) : 0

      this.logger.debug(
        "Current charge level: " +
          chargeLevel.toFixed(2) +
          ", Previous: " +
          this.previousChargeLevel.toFixed(2) +
          ", Can Shoot: " +
          this.canShoot
      )

      if (chargeLevel < 0.9 && this.previousChargeLevel >= 0.9) {
        this.canShoot = true
        this.logger.debug("Charge reset, ready for next shot")
      }

      if (chargeLevel >= this.chargeThreshold && this.previousChargeLevel < this.chargeThreshold && this.canShoot) {
        this.logger.debug("THRESHOLD CROSSED! SHOOTING ARROW NOW!")
        this.logger.info("SHOOTING ARROW - Threshold crossed from below!")
        this.shootArrow()

        this.canShoot = false
        this.lastShotTime = getTime()
      }

      this.previousChargeLevel = chargeLevel

      if (this.chargingText) {
        ;(this.chargingText as any).text = chargeLevel.toFixed(2)

        if (chargeLevel >= this.chargeThreshold) {
          if (!this.canShoot) {
            ;(this.chargingText as any).textColor = new vec4(1, 0.5, 0, 1)
          } else {
            ;(this.chargingText as any).textColor = new vec4(0, 1, 0, 1)
          }
        } else {
          ;(this.chargingText as any).textColor = new vec4(1, 1, 1, 1)
        }
      }

      if (this.scoreText) {
        ;(this.scoreText as any).text = "Score: " + this.score
      }
    }
  }

  shootArrow(): void {
    this.shootCount++
    this.logger.debug("SHOOT ARROW CALLED! Shot #" + this.shootCount)
    this.logger.info("SHOOTING ARROW - Shot #" + this.shootCount)

    if (!this.shootingRayStart || !this.shootingRayEnd) {
      this.logger.debug("Shooting ray points not set")
      return
    }

    const startPos = this.shootingRayStart.getTransform().getWorldPosition()
    const endPos = this.shootingRayEnd.getTransform().getWorldPosition()

    if (startPos.distance(endPos) < 0.001) {
      this.logger.debug("Start and end positions are too close")
      return
    }

    const shootDir = endPos.sub(startPos).normalize()

    this.logger.debug("Shooting from: " + startPos.toString())
    this.logger.debug("Shooting to: " + endPos.toString())
    this.logger.debug("Direction vector: " + shootDir.toString())

    if (this.projectile) {
      const instance = this.projectile.instantiate(this.sceneObject)
      if (!instance) {
        this.logger.debug("Failed to instantiate projectile")
        return
      }

      instance.enabled = true
      instance.getTransform().setWorldPosition(startPos)

      const lookRotation = this.getLookRotation(shootDir)
      instance.getTransform().setWorldRotation(lookRotation)

      this.logger.debug("Rotation set to align projectile with direction: " + shootDir.toString())

      const objectMatrix = instance.getTransform().getWorldTransform()
      const worldForward = objectMatrix.multiplyDirection(new vec3(0, 0, 1))
      this.logger.debug("Projectile Z-axis (world space): " + worldForward.normalize().toString())

      const physicsBody = instance.getComponent("Physics.BodyComponent") as any

      if (physicsBody) {
        physicsBody.velocity = new vec3(0, 0, 0)
        physicsBody.angularVelocity = new vec3(0, 0, 0)

        try {
          this.logger.debug("Using manual motion for more reliable trajectory")
          physicsBody.enabled = false
          this.setupManualMotion(instance, shootDir)
        } catch (e) {
          this.logger.debug("Error applying physics: " + e.toString())
          this.logger.error("Error with physics - falling back to manual motion")
          this.setupManualMotion(instance, shootDir)
        }

        this.setupCollisionDetection(instance)
      } else {
        this.logger.debug("No physics body found on projectile - using manual motion")
        this.setupManualMotion(instance, shootDir)
      }
    } else {
      this.logger.error("Projectile prefab not assigned!")
    }
  }

  private setupManualMotion(projectile: SceneObject, direction: vec3): void {
    const moveScript = projectile.createComponent("ScriptComponent") as any
    if (moveScript) {
      moveScript.startPosition = projectile.getTransform().getWorldPosition()
      moveScript.direction = direction.normalize()
      moveScript.speed = this.initialSpeed
      moveScript.gravity = this.gravityStrength
      moveScript.drag = this.dragFactor
      moveScript.flightTime = 0

      this.logger.debug("Starting position: " + moveScript.startPosition.toString())
      this.logger.debug("Direction: " + moveScript.direction.toString())
      this.logger.debug("Speed: " + moveScript.speed)

      moveScript.createEvent("UpdateEvent").bind(() => {
        const dt = getDeltaTime()
        moveScript.flightTime += dt

        const baseVelocity = moveScript.direction.uniformScale(moveScript.speed)
        const horizontalOffset = baseVelocity.uniformScale(moveScript.flightTime)

        const time_squared = moveScript.flightTime * moveScript.flightTime
        const gravityDrop = new vec3(0, -0.5 * moveScript.gravity * time_squared, 0)

        const dragFactor = Math.max(0, 1.0 - moveScript.drag * moveScript.flightTime)
        const horizontalWithDrag = horizontalOffset.uniformScale(dragFactor)

        const newPos = moveScript.startPosition.add(horizontalWithDrag).add(gravityDrop)
        projectile.getTransform().setWorldPosition(newPos)

        const horizVelocity = baseVelocity.uniformScale(dragFactor)
        const vertVelocity = new vec3(0, -moveScript.gravity * moveScript.flightTime, 0)
        const currentVelocity = horizVelocity.add(vertVelocity)

        if (currentVelocity.length > 0.001) {
          const flightDir = currentVelocity.normalize()
          const lookRotation = this.getLookRotation(flightDir)
          projectile.getTransform().setWorldRotation(lookRotation)
        }
      })

      this.setupSimpleCollisionDetection(projectile, moveScript)
    }
  }

  private setupCollisionDetection(projectile: SceneObject): void {
    const collider = projectile.getComponent("Physics.ColliderComponent") as any
    if (collider) {
      collider.onOverlapEnter.add((e) => {
        const hitObject = e.overlap.collider.getSceneObject()

        if ((this.rotatingTarget && hitObject === this.rotatingTarget) || hitObject.name.includes("Target")) {
          this.score += 10
          this.logger.debug("Target hit! Score: " + this.score)

          if (this.scoreText) {
            ;(this.scoreText as any).text = "Score: " + this.score
          }

          projectile.destroy()
        }
      })
    }
  }

  private setupSimpleCollisionDetection(projectile: SceneObject, moveScript: any): void {
    moveScript.createEvent("UpdateEvent").bind(() => {
      const projectilePos = projectile.getTransform().getWorldPosition()

      if (this.rotatingTarget) {
        const targetPos = this.rotatingTarget.getTransform().getWorldPosition()
        const distance = targetPos.sub(projectilePos).length

        if (distance < 5.0) {
          this.score += 10
          this.logger.debug("Rotating target hit! Score: " + this.score)

          if (this.scoreText) {
            ;(this.scoreText as any).text = "Score: " + this.score
          }

          projectile.destroy()
        }
      }
    })
  }

  closestPointOnLine(point: vec3, start: vec3, end: vec3): vec3 {
    const lineDirection = end.sub(start)
    const lineLength = lineDirection.length
    const normalizedDirection = lineDirection.normalize()
    const pointDirection = point.sub(start)
    const dot = pointDirection.dot(normalizedDirection)
    const clampedDot = Math.max(0, Math.min(dot, lineLength))
    return start.add(normalizedDirection.uniformScale(clampedDot))
  }

  private getLookRotation(forward: vec3): quat {
    forward = forward.normalize()

    let upVector = new vec3(0, 1, 0)
    if (Math.abs(forward.dot(upVector)) > 0.99999) {
      upVector = new vec3(1, 0, 0)
    }

    const right = upVector.cross(forward).normalize()
    const up = forward.cross(right).normalize()

    const m00 = right.x
    const m01 = right.y
    const m02 = right.z
    const m10 = up.x
    const m11 = up.y
    const m12 = up.z
    const m20 = forward.x
    const m21 = forward.y
    const m22 = forward.z

    const trace = m00 + m11 + m22
    const q = new quat(0, 0, 0, 1)

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1.0)
      q.w = 0.25 / s
      q.x = (m12 - m21) * s
      q.y = (m20 - m02) * s
      q.z = (m01 - m10) * s
    } else if (m00 > m11 && m00 > m22) {
      const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22)
      q.w = (m12 - m21) / s
      q.x = 0.25 * s
      q.y = (m01 + m10) / s
      q.z = (m20 + m02) / s
    } else if (m11 > m22) {
      const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22)
      q.w = (m20 - m02) / s
      q.x = (m01 + m10) / s
      q.y = 0.25 * s
      q.z = (m12 + m21) / s
    } else {
      const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11)
      q.w = (m01 - m10) / s
      q.x = (m20 + m02) / s
      q.y = (m12 + m21) / s
      q.z = 0.25 * s
    }

    return q
  }
}
