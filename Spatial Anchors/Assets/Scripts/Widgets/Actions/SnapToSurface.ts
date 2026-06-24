import {InteractionManager} from "SpectaclesInteractionKit.lspkg/Core/InteractionManager/InteractionManager"
import {InteractorInputType} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor"
import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

const EPSILON = 0.001

export class SnapToSurface {
  private worldQueryModule: WorldQueryModule
  private hitTestSession: HitTestSession
  private hitTestSessionRunning = false
  private lastHitResult: WorldQueryHitTestResult | null = null
  private logger: Logger

  // Continuous snap state
  private continuousActive = false
  private trackedObjects: SceneObject[] = []
  private updateEvent: SceneEvent | null = null
  private helperObj: SceneObject | null = null
  private pinchUpUnsub: (() => void) | null = null

  private static instance: SnapToSurface

  static getInstance(): SnapToSurface {
    if (!SnapToSurface.instance) {
      throw new Error("SnapToSurface not initialized")
    }
    return SnapToSurface.instance
  }

  constructor(worldQueryModule: WorldQueryModule, logger?: Logger) {
    this.worldQueryModule = worldQueryModule
    this.logger = logger ?? new Logger("SnapToSurface", true, true)

    const sessionOptions = HitTestSessionOptions.create()
    sessionOptions.filter = true
    this.hitTestSession =
      this.worldQueryModule.createHitTestSessionWithOptions(sessionOptions)
    this.hitTestSession.stop()

    SnapToSurface.instance = this
    this.logger.info("Initialized")
  }

  startSession(): void {
    if (this.hitTestSessionRunning) return
    this.hitTestSession.start()
    this.hitTestSessionRunning = true
    this.logger.debug("Session started")
  }

  stopSession(): void {
    this.stopContinuousSnap()
    if (!this.hitTestSessionRunning) return
    this.hitTestSession.stop()
    this.hitTestSession.reset()
    this.hitTestSessionRunning = false
    this.lastHitResult = null
    this.logger.debug("Session stopped")
  }

  /**
   * Raycast from the primary hand interactor toward the surface.
   * Uses SIK InteractionManager (same pattern as WorldQueryHitExample).
   */
  private raycastFromHand(
    onHit: (position: vec3, rotation: quat) => void
  ): void {
    if (!this.hitTestSessionRunning) {
      this.startSession()
    }

    const interactionManager = InteractionManager.getInstance()
    if (!interactionManager) return

    // Use right hand specifically for snap ray
    const rightHandInteractors = interactionManager.getInteractorsByType(
      InteractorInputType.RightHand
    )
    const primary = rightHandInteractors.find(
      (i) => i.isActive() && i.isTargeting()
    ) ?? null
    if (!primary) return

    // Offset ray start slightly forward (matching WorldQueryHit pattern)
    const startPoint = primary.startPoint
    const endPoint = primary.endPoint
    const rayStart = new vec3(startPoint.x, startPoint.y, startPoint.z + 30)

    this.hitTestSession.hitTest(
      rayStart,
      endPoint,
      (hitResult: WorldQueryHitTestResult) => {
        if (hitResult === null) {
          this.lastHitResult = null
          return
        }

        this.lastHitResult = hitResult
        const hitPosition: vec3 = hitResult.position
        const hitNormal: vec3 = hitResult.normal

        // Compute rotation aligned to surface (matching WorldQueryHit)
        let lookDirection: vec3
        if (1 - Math.abs(hitNormal.normalize().dot(vec3.up())) < EPSILON) {
          lookDirection = vec3.forward()
        } else {
          lookDirection = hitNormal.cross(vec3.up())
        }
        const rot = quat.lookAt(lookDirection, hitNormal)

        onHit(hitPosition, rot)
      }
    )
  }

  /**
   * Snap a single SceneObject to the surface the hand is pointing at.
   */
  snapObjectToSurface(target: SceneObject): void {
    this.raycastFromHand((position, rotation) => {
      target.getTransform().setWorldPosition(position)
      target.getTransform().setWorldRotation(rotation)
      this.stopSession()
    })
  }

  /**
   * Start continuous snap: every frame, raycast from hand and
   * reposition all tracked widgets on the detected surface in a grid.
   */
  startContinuousSnap(objects: SceneObject[]): void {
    if (this.continuousActive) {
      this.trackedObjects = objects.slice()
      return
    }

    this.trackedObjects = objects.slice()
    this.startSession()
    this.continuousActive = true

    this.helperObj = global.scene.createSceneObject("SnapUpdateHelper")
    const script = this.helperObj.createComponent("ScriptComponent")
    this.updateEvent = script.createEvent("UpdateEvent") as SceneEvent
    this.updateEvent.bind(() => {
      if (!this.continuousActive || this.trackedObjects.length === 0) return
      this.raycastFromHand((hitPos, surfaceRot) => {
        this.distributeOnSurface(this.trackedObjects, hitPos, surfaceRot, 15)
      })
    })

    // Right hand pinch release → place all tracked widgets at current position
    const rightHand = SIK.HandInputData.getHand("right")
    this.pinchUpUnsub = rightHand.onPinchUp.add(() => {
      if (this.trackedObjects.length > 0) {
        this.logger.info(
          `Right hand pinch released — placed ${this.trackedObjects.length} widget(s) at current position`
        )
        this.trackedObjects = []
      }
    })

    this.logger.info(`Continuous snap started with ${objects.length} objects`)
  }

  stopContinuousSnap(): void {
    if (!this.continuousActive) return
    this.continuousActive = false
    this.trackedObjects = []

    if (this.pinchUpUnsub) {
      this.pinchUpUnsub()
      this.pinchUpUnsub = null
    }
    if (this.updateEvent) {
      this.updateEvent.enabled = false
      this.updateEvent = null
    }
    if (this.helperObj) {
      this.helperObj.destroy()
      this.helperObj = null
    }

    this.logger.info("Continuous snap stopped")
  }

  isContinuousSnapActive(): boolean {
    return this.continuousActive
  }

  hasValidHit(): boolean {
    return this.hitTestSessionRunning && this.lastHitResult !== null
  }

  /**
   * Remove a specific object from continuous snap tracking (e.g. when user grabs it).
   * The widget gets "pinned" at its current position.
   */
  unpinObject(obj: SceneObject): void {
    this.trackedObjects = this.trackedObjects.filter((o) => o !== obj)
    this.logger.debug(`unpinObject: removed, ${this.trackedObjects.length} still tracked`)
  }

  /**
   * Re-add an object to continuous snap tracking.
   */
  repinObject(obj: SceneObject): void {
    if (!this.trackedObjects.includes(obj)) {
      this.trackedObjects.push(obj)
      this.logger.debug(`repinObject: added, ${this.trackedObjects.length} tracked`)
    }
  }

  private distributeOnSurface(
    targets: SceneObject[],
    hitPosition: vec3,
    surfaceRotation: quat,
    spacing: number
  ): void {
    const count = targets.length
    if (count === 0) return
    const cols = Math.min(count, 8)
    const rows = Math.ceil(count / cols)

    // Use world right/up for grid layout so widgets stay upright (billboard handles facing)
    const surfaceRight = surfaceRotation.multiplyVec3(new vec3(1, 0, 0))
    const surfaceUp = new vec3(0, 1, 0) // always world-up for clean layout

    for (let i = 0; i < count; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const xOff = (col - (cols - 1) / 2) * spacing
      const yOff = ((rows - 1) / 2 - row) * spacing

      const pos = hitPosition
        .add(surfaceRight.uniformScale(xOff))
        .add(surfaceUp.uniformScale(yOff))

      const t = targets[i].getTransform()
      // Only lerp position — let Frame's Billboard handle rotation (face user)
      t.setWorldPosition(vec3.lerp(t.getWorldPosition(), pos, 0.15))
    }
  }
}
