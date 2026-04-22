/**
 * Specs Inc. 2026
 * Tool Picker Behavior component for the Throw Lab Spectacles lens.
 */
import {bindUpdateEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class ToolPickerBehavior extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ToolPickerBehavior – Spawns and respawns tools at spawn points</span><br/><span style="color: #94A3B8; font-size: 11px;">Assign prefabs and spawn points; tools are automatically replaced when grabbed or moved away.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Setup</span>')
  @input
  @hint("Prefabs to instantiate at each spawn point (one per spawn point)")
  public toolPrefabs: ObjectPrefab[]

  @input
  @hint("Scene objects used as spawn locations (one per prefab)")
  public toolSpawnPoints: SceneObject[]

  @input
  @hint("Parent container object for spawned tools")
  public containerObj: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  public toolSpawnPointsT: Transform[]

  private latestObj: SceneObject[]
  private latestObjT: Transform[]

  private yOffset = 5
  private distanceOffset = 15

  onAwake() {
    this.logger = new Logger("ToolPickerBehavior", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.init()
  }

  init() {
    this.toolSpawnPointsT = []
    this.latestObj = []
    this.latestObjT = []
    this.spanwAllTools()
  }

  spanwAllTools() {
    this.toolSpawnPoints.forEach((value, ind) => {
      const spawnPoint = value
      this.toolSpawnPointsT[ind] = spawnPoint.getTransform()
      this.spawnAndReplace(ind)
    })
  }

  @bindUpdateEvent
  onUpdate() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onUpdate()")
    this.toolSpawnPoints.forEach((value, ind) => {
      try {
        const spawnPointT = this.toolSpawnPointsT[ind]
        const objectT = this.latestObjT[ind]

        if (!objectT) {
          this.spawnAndReplace(ind)
          return
        }

        const sceneObj = objectT.getSceneObject()
        if (!sceneObj) {
          this.spawnAndReplace(ind)
          return
        }

        const objPos = objectT.getWorldPosition()
        const spawnPos = spawnPointT.getWorldPosition()

        if (objPos.distance(spawnPos) > this.distanceOffset) {
          sceneObj.setParent(null)
          this.spawnAndReplace(ind)
        }
      } catch (e) {
        this.logger.info(`Object at index ${ind} was destroyed, respawning`)
        this.spawnAndReplace(ind)
      }
    })
  }

  spawnAndReplace(ind) {
    const spawnPos = this.toolSpawnPointsT[ind].getWorldPosition()
    spawnPos.y += this.yOffset

    const nObject = this.toolPrefabs[ind].instantiate(this.containerObj)
    nObject.enabled = true
    nObject.getTransform().setWorldPosition(spawnPos)
    nObject.getTransform().setWorldRotation(this.toolSpawnPointsT[ind].getWorldRotation())

    this.latestObj[ind] = nObject
    this.latestObjT[ind] = nObject.getTransform()
  }
}
