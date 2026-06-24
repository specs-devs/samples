/**
 * Specs Inc. 2026
 * Hand Object Controller for the Think Out Loud Spectacles lens experience.
 */
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import TrackedHand from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/TrackedHand"
import { SIK } from "SpectaclesInteractionKit.lspkg/SIK"
import { SyncEntity } from "SpectaclesSyncKit.lspkg/Core/SyncEntity"
import { PlayerColorAssigner } from "../Utils/PlayerColorAssigner"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { SceneObjectUtils } from "Utilities.lspkg/Scripts/Utils/SceneObjectUtils"
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"

// Forward declaration to avoid circular imports
declare class HandObjectManager extends BaseScriptComponent {
  subscribe(handObject: HandObjectController): void
}

@component
export class HandObjectController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">HandObjectController – controls position and color for a single synced hand object</span><br/><span style="color: #94A3B8; font-size: 11px;">Local hand follows SIK tracking; color is assigned deterministically from connectionId.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Reference to the HandObjectManager that owns this controller")
  handObjectManager: HandObjectManager

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @input
  @hint("Hand side to track: \"left\" or \"right\"")
  handType: string = "left"

  @input
  @hint("Enable testing mode; uses camera offset instead of hand tracking")
  testingMode: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Colors</span>')
  @input
  @hint("Array of materials for different hand colors; index is assigned by connectionId hash")
  handColorMaterials: Material[] = []

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private syncEntity: SyncEntity = new SyncEntity(this)
  private cameraTransform: Transform = WorldCameraFinderProvider.getInstance().getTransform()
  private transform: Transform = this.sceneObject.getTransform()
  private previousPos: vec3 = new vec3(0, 0, 0)

  private trackedHand: TrackedHand
  private assignedColorIndex: number = 0

  onAwake(): void {
    this.logger = new Logger("HandObjectController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  onUpdate(): void {
    if (!this.syncEntity || !this.syncEntity.networkRoot.locallyCreated) {
      return
    }

    let newPos: vec3

    if (this.testingMode) {
      const cameraPos = this.cameraTransform.getWorldPosition()
      const forward = this.cameraTransform.forward.uniformScale(20)
      const handsCenter = cameraPos.add(forward)
      const lateralOffset = this.handType === "left" ? new vec3(-5, 0, 0) : new vec3(5, 0, 0)
      newPos = handsCenter.add(lateralOffset)

      this.logger.debug(
        `Testing: ${this.handType} hand at (${newPos.x.toFixed(2)}, ${newPos.y.toFixed(2)}, ${newPos.z.toFixed(2)})`
      )
    } else {
      if (this.trackedHand && this.trackedHand.isTracked()) {
        newPos = this.trackedHand.getPalmCenter()
      } else {
        this.sceneObject.enabled = false
        return
      }
    }

    const updatePos = vec3.lerp(this.previousPos, newPos, getDeltaTime() * 10)
    this.transform.setWorldPosition(updatePos)
    this.previousPos = updatePos
    this.sceneObject.enabled = true
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.syncEntity.notifyOnReady(() => {
      this.assignHandColor()

      if (this.syncEntity.networkRoot.locallyCreated) {
        this.logger.info(`Setting up local ${this.handType} hand`)

        this.trackedHand = SIK.HandInputData.getHand(this.handType as any)

        if (this.testingMode) {
          const cameraPos = this.cameraTransform.getWorldPosition()
          const forward = this.cameraTransform.forward.uniformScale(20)
          const handsCenter = cameraPos.add(forward)
          const lateralOffset = this.handType === "left" ? new vec3(-5, 0, 0) : new vec3(5, 0, 0)
          this.previousPos = handsCenter.add(lateralOffset)
        } else if (this.trackedHand && this.trackedHand.isTracked()) {
          this.previousPos = this.trackedHand.getPalmCenter()
        } else {
          this.previousPos = vec3.zero()
        }

        this.transform.setWorldPosition(this.previousPos)

        this.sceneObject.name = this.sceneObject.name + ` (Local ${this.handType} Hand)`
        this.sceneObject.getChild(0).enabled = true
        this.handObjectManager.subscribe(this)
      } else {
        this.logger.info(`Setting up remote ${this.handType} hand`)
        this.sceneObject.name = this.sceneObject.name + ` (Remote ${this.handType} Hand)`
        this.sceneObject.getChild(0).enabled = true
      }
    })
  }

  getWorldPosition(): vec3 {
    return this.transform.getWorldPosition()
  }

  getHandType(): string {
    return this.handType
  }

  isLocalHand(): boolean {
    return this.syncEntity && this.syncEntity.networkRoot && this.syncEntity.networkRoot.locallyCreated
  }

  isHandTracked(): boolean {
    if (this.testingMode) {
      return true
    }
    return this.trackedHand && this.trackedHand.isTracked()
  }

  /**
   * Assign a color to this hand based on the owner's connectionId
   */
  private assignHandColor(): void {
    if (!this.handColorMaterials || this.handColorMaterials.length === 0) {
      this.logger.warn("No hand color materials assigned")
      return
    }

    const ownerInfo = this.syncEntity.networkRoot.ownerInfo
    if (!ownerInfo) {
      this.logger.warn("No owner info available")
      return
    }

    this.assignedColorIndex = PlayerColorAssigner.getColorIndexForPlayer(
      ownerInfo.connectionId,
      this.handColorMaterials.length
    )

    const colorName = PlayerColorAssigner.getColorName(this.assignedColorIndex)
    this.logger.info(
      `Assigned ${colorName} (index ${this.assignedColorIndex}) to ${this.handType} hand of ${ownerInfo.displayName || ownerInfo.connectionId}`
    )

    this.applyHandColorMaterial()
  }

  /**
   * Apply the assigned color material to all visual components in the hand hierarchy
   */
  private applyHandColorMaterial(): void {
    if (!this.handColorMaterials || this.assignedColorIndex >= this.handColorMaterials.length) {
      return
    }

    const selectedMaterial = this.handColorMaterials[this.assignedColorIndex]
    if (!selectedMaterial) {
      this.logger.warn("Selected hand material is null")
      return
    }

    let targetsUpdated = 0
    SceneObjectUtils.forEachSceneObjectInSubHierarchy(this.sceneObject, (child: SceneObject) => {
      const mmv = child.getComponent("Component.MaterialMeshVisual") as MaterialMeshVisual
      if (mmv) {
        mmv.mainMaterial = selectedMaterial
        targetsUpdated++
      }
      const rmv = child.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      if (rmv) {
        rmv.mainMaterial = selectedMaterial
        targetsUpdated++
      }
    })

    this.logger.info(
      `Applied ${PlayerColorAssigner.getColorName(this.assignedColorIndex)} material to ${targetsUpdated} visual component(s) on ${this.handType} hand`
    )
  }

  public getAssignedColorIndex(): number {
    return this.assignedColorIndex
  }

  public getAssignedColorName(): string {
    return PlayerColorAssigner.getColorName(this.assignedColorIndex)
  }
}
