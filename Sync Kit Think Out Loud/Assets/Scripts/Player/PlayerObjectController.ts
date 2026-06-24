/**
 * Specs Inc. 2026
 * Player Object Controller for the Think Out Loud Spectacles lens experience.
 */
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import { SyncEntity } from "SpectaclesSyncKit.lspkg/Core/SyncEntity"
import { PlayerColorAssigner } from "../Utils/PlayerColorAssigner"
import { PlayerObjectManager } from "./PlayerObjectManager"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { SceneObjectUtils } from "Utilities.lspkg/Scripts/Utils/SceneObjectUtils"
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"

@component
export class PlayerObjectController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PlayerObjectController – controls position and color for a synced player object</span><br/><span style="color: #94A3B8; font-size: 11px;">Local player object follows the camera; color is assigned deterministically from connectionId.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Reference to the PlayerObjectManager that owns this controller")
  playerObjectManager: PlayerObjectManager

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Colors</span>')
  @input
  @hint("Array of materials for different player colors; index is assigned by connectionId hash")
  playerColorMaterials: Material[] = []

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
  private up = new vec3(0, 1, 0)
  private assignedColorIndex: number = 0

  onAwake(): void {
    this.logger = new Logger("PlayerObjectController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  onUpdate(): void {
    const forward = this.cameraTransform.forward.mult(new vec3(1, 0, 1))
    const newPos = this.cameraTransform.getWorldPosition().add(forward.uniformScale(-50))
    const updatePos = vec3.lerp(this.previousPos, newPos, getDeltaTime() * 5)
    this.transform.setWorldPosition(updatePos)
    this.previousPos = updatePos
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.sceneObject.getChild(0).enabled = true

    this.syncEntity.notifyOnReady(() => {
      this.assignPlayerColor()

      if (this.syncEntity.networkRoot.locallyCreated) {
        const forward = this.cameraTransform.forward.mult(new vec3(1, 0, 1))
        this.previousPos = this.cameraTransform.getWorldPosition().add(forward.uniformScale(-50))
        this.transform.setWorldPosition(this.previousPos)

        this.sceneObject.name = this.sceneObject.name + " (Local Player)"
        this.sceneObject.getChild(0).enabled = true
        this.playerObjectManager.subscribe(this)
      } else {
        this.sceneObject.name = this.sceneObject.name + " (Remote Player)"
      }
    })
  }

  /**
   * Assign a color to this player based on their connectionId
   */
  private assignPlayerColor(): void {
    if (!this.playerColorMaterials || this.playerColorMaterials.length === 0) {
      this.logger.warn("No color materials assigned")
      return
    }

    PlayerColorAssigner.validateColorCount(this.playerColorMaterials.length)

    const ownerInfo = this.syncEntity.networkRoot.ownerInfo
    if (!ownerInfo) {
      this.logger.warn("No owner info available")
      return
    }

    this.assignedColorIndex = PlayerColorAssigner.getColorIndexForPlayer(
      ownerInfo.connectionId,
      this.playerColorMaterials.length
    )

    const colorName = PlayerColorAssigner.getColorName(this.assignedColorIndex)
    this.logger.info(
      `Assigned ${colorName} (index ${this.assignedColorIndex}) to player ${ownerInfo.displayName || ownerInfo.connectionId}`
    )

    this.applyColorMaterial()
  }

  /**
   * Apply the assigned color material to all visual components in the hierarchy
   */
  private applyColorMaterial(): void {
    if (!this.playerColorMaterials || this.playerColorMaterials.length === 0) {
      this.logger.warn("No color materials assigned")
      return
    }

    if (this.assignedColorIndex >= this.playerColorMaterials.length) {
      this.logger.warn(
        `Color index ${this.assignedColorIndex} out of range (max: ${this.playerColorMaterials.length - 1})`
      )
      return
    }

    const selectedMaterial = this.playerColorMaterials[this.assignedColorIndex]
    if (!selectedMaterial) {
      this.logger.warn("Selected material is null")
      return
    }

    this.logger.info(
      `Applying ${PlayerColorAssigner.getColorName(this.assignedColorIndex)} material to player object`
    )

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

    this.logger.info(`Applied material to ${targetsUpdated} visual component(s)`)
  }

  public getAssignedColorIndex(): number {
    return this.assignedColorIndex
  }

  public getAssignedColorName(): string {
    return PlayerColorAssigner.getColorName(this.assignedColorIndex)
  }
}
