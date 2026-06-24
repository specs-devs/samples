/**
 * Specs Inc. 2026
 * New Script component for the SnapML Starter Spectacles lens.
 */
import {bindUpdateEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

// import required modules
const WorldQueryModule = require("LensStudio:WorldQueryModule")
const SIK = require("SpectaclesInteractionKit.lspkg/SIK").SIK
const InteractorInputType = require("SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor").InteractorInputType
const EPSILON = 0.01

@component
export class NewScript extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">WorldQueryHitExample – surface spawn on hit</span><br/><span style="color: #94A3B8; font-size: 11px;">Spawns a prefab at the surface location where the interactor ray hits.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Spawn Settings</span>')
  @input
  @hint("Index of the object to spawn from objectsToSpawn")
  indexToSpawn: number

  @input
  @hint("Target scene object that tracks the hit position before spawning")
  targetObject: SceneObject

  @input
  @hint("Pool of scene objects that can be spawned on surface hit")
  objectsToSpawn: SceneObject[]

  @input
  @hint("Enable surface mesh filtering for the hit-test session")
  filterEnabled: boolean

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private primaryInteractor
  private hitTestSession: HitTestSession
  private transform: Transform
  private lastHitResult: any

  onAwake() {
    this.logger = new Logger("NewScript", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.hitTestSession = this.createHitTestSession(this.filterEnabled)
    if (!this.sceneObject) {
      this.logger.error("Please set Target Object input")
      return
    }
    this.transform = this.targetObject.getTransform()
    this.targetObject.enabled = false
    this.setObjectEnabled(this.indexToSpawn)

    this.setupTriggerEndCallback()
  }

  setupTriggerEndCallback() {
    const allInteractors = SIK.InteractionManager.getInteractorsByType(InteractorInputType.All)

    for (const interactor of allInteractors) {
      interactor.onTriggerEnd.add(() => {
        if (this.lastHitResult && this.primaryInteractor === interactor) {
          this.placeObject()
        }
      })
    }
  }

  placeObject() {
    if (!this.lastHitResult) return

    const parent = this.objectsToSpawn[this.indexToSpawn].getParent()
    const newObject = parent.copyWholeHierarchy(this.objectsToSpawn[this.indexToSpawn])
    newObject.setParentPreserveWorldTransform(null)

    const hitPosition = this.lastHitResult.position
    const hitNormal = this.lastHitResult.normal

    let lookDirection
    if (1 - Math.abs(hitNormal.normalize().dot(vec3.up())) < EPSILON) {
      lookDirection = vec3.forward()
    } else {
      lookDirection = hitNormal.cross(vec3.up())
    }

    const toRotation = quat.lookAt(lookDirection, hitNormal)
    newObject.getTransform().setWorldPosition(hitPosition)
    newObject.getTransform().setWorldRotation(toRotation)
  }

  createHitTestSession(filterEnabled) {
    const options = HitTestSessionOptions.create()
    options.filter = filterEnabled
    const session = WorldQueryModule.createHitTestSessionWithOptions(options)
    return session
  }

  onHitTestResult(results) {
    if (results === null) {
      this.targetObject.enabled = false
      this.lastHitResult = null
    } else {
      this.targetObject.enabled = true
      this.lastHitResult = results

      const hitPosition = results.position
      const hitNormal = results.normal

      let lookDirection
      if (1 - Math.abs(hitNormal.normalize().dot(vec3.up())) < EPSILON) {
        lookDirection = vec3.forward()
      } else {
        lookDirection = hitNormal.cross(vec3.up())
      }

      const toRotation = quat.lookAt(lookDirection, hitNormal)
      this.targetObject.getTransform().setWorldPosition(hitPosition)
      this.targetObject.getTransform().setWorldRotation(toRotation)
    }
  }

  @bindUpdateEvent
  onUpdate() {
    this.primaryInteractor = SIK.InteractionManager.getTargetingInteractors().shift()

    if (this.primaryInteractor && this.primaryInteractor.isActive() && this.primaryInteractor.isTargeting()) {
      const rayStartOffset = new vec3(
        this.primaryInteractor.startPoint.x,
        this.primaryInteractor.startPoint.y,
        this.primaryInteractor.startPoint.z + 30
      )
      const rayStart = rayStartOffset
      const rayEnd = this.primaryInteractor.endPoint

      this.hitTestSession.hitTest(rayStart, rayEnd, this.onHitTestResult.bind(this))
    } else {
      this.targetObject.enabled = false
    }
  }

  setObjectIndex(i) {
    this.indexToSpawn = i
  }

  setObjectEnabled(i) {
    for (let i = 0; i < this.objectsToSpawn.length; i++) this.objectsToSpawn[i].enabled = i == this.indexToSpawn
  }
}
