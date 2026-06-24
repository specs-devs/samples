/**
 * Specs Inc. 2026
 * Head Label Object Controller for the Think Out Loud Spectacles lens experience.
 */
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import { SessionController } from "SpectaclesSyncKit.lspkg/Core/SessionController"
import { StorageProperty } from "SpectaclesSyncKit.lspkg/Core/StorageProperty"
import { StoragePropertySet } from "SpectaclesSyncKit.lspkg/Core/StoragePropertySet"
import { StorageTypes } from "SpectaclesSyncKit.lspkg/Core/StorageTypes"
import { SyncEntity } from "SpectaclesSyncKit.lspkg/Core/SyncEntity"
import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import { PingMenu } from "../PingMenu/PingMenu"
import { HeadLabelObjectManager } from "./HeadLabelObjectManager"
import { HeadLabelReferences } from "./HeadLabelReferences"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent, bindUpdateEvent, bindDestroyEvent } from "SnapDecorators.lspkg/decorators"

/**
 * Availability states for the user
 */
export enum AvailabilityState {
  Available = 0,
  Busy = 1,
  Away = 2,
  DoNotDisturb = 3
}

@component
export class HeadLabelObjectController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">HeadLabelObjectController – controls data, position and visuals for a single synced head label</span><br/><span style="color: #94A3B8; font-size: 11px;">Local label follows head pose; remote labels receive data via StorageProperty callbacks.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Reference to the HeadLabelObjectManager that owns this controller")
  headLabelManager: HeadLabelObjectManager

  @input
  @hint("References to the head label UI components")
  headLabelReferences: HeadLabelReferences

  @input
  @hint("Cloud storage module for persistent data")
  cloudStorageModule: CloudStorageModule

  @input
  @hint("Ping menu for handling ping interactions")
  pingMenu: PingMenu

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  // Storage properties
  private userNameProp: StorageProperty<StorageTypes.string>
  private statusTextProp: StorageProperty<StorageTypes.string>
  private subStatusTextProp: StorageProperty<StorageTypes.string>
  private availabilityProp: StorageProperty<StorageTypes.int>
  private pingStateProp: StorageProperty<StorageTypes.bool>
  private storagePropertySet: StoragePropertySet
  public syncEntity: SyncEntity
  private cameraTransform: Transform = WorldCameraFinderProvider.getInstance().getTransform()
  private transform: Transform = this.sceneObject.getTransform()
  private previousPos: vec3 = new vec3(0, 0, 0)
  private cloudStore: CloudStore | null = null

  constructor() {
    super()

    this.userNameProp = StorageProperty.manualString("userName", "Unknown User")
    this.statusTextProp = StorageProperty.manualString("statusText", "Hello from Spectacles!")
    this.subStatusTextProp = StorageProperty.manualString("subStatusText", "Ready to connect")
    this.availabilityProp = StorageProperty.manualInt("availability", 0)
    this.pingStateProp = StorageProperty.manualBool("pingState", false)

    this.storagePropertySet = new StoragePropertySet([
      this.userNameProp,
      this.statusTextProp,
      this.subStatusTextProp,
      this.availabilityProp,
      this.pingStateProp
    ])

    this.syncEntity = new SyncEntity(this, this.storagePropertySet, true, "Owner")
  }

  private userInfo: ConnectedLensModule.UserInfo | null = null

  private readonly DEFAULT_STATUS = "Hello from Spectacles!"
  private readonly DEFAULT_SUB_STATUS = "Ready to connect"
  private readonly DEFAULT_AVAILABILITY = AvailabilityState.Available

  onAwake(): void {
    this.logger = new Logger(
      "HeadLabelObjectController",
      this.enableLogging || this.enableLoggingLifecycle,
      true
    )
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindUpdateEvent
  onUpdate(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onUpdate()")
    if (!this.syncEntity || !this.syncEntity.networkRoot.locallyCreated) {
      return
    }

    const headPos = this.cameraTransform.getWorldPosition()
    const headForward = this.cameraTransform.forward
    const worldUp = new vec3(0, 1, 0)

    const targetPos = headPos
      .add(headForward.uniformScale(20))
      .add(worldUp.uniformScale(20))

    const updatePos = vec3.lerp(this.previousPos, targetPos, getDeltaTime() * 5)
    this.transform.setWorldPosition(updatePos)
    this.previousPos = updatePos

    const headRotation = this.cameraTransform.getWorldRotation()
    const forward = headRotation.multiplyVec3(vec3.forward())
    const forwardXZ = new vec3(forward.x, 0, forward.z)

    if (forwardXZ.length > 0.001) {
      const normalizedForwardXZ = forwardXZ.normalize()
      const yRotationOnly = quat.lookAt(normalizedForwardXZ, vec3.up())
      this.transform.setWorldRotation(yRotationOnly)
    }
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.logger.info("onStart() called - SceneObject: " + this.sceneObject.name)

    this.initializeStorageProperties()

    this.syncEntity.notifyOnReady(() => {
      this.logger.info("SyncEntity ready")

      const userName = this.getUserNameFromSession()
      this.logUserInfo()
      this.initializeCloudStorage()

      if (this.syncEntity.networkRoot.locallyCreated) {
        this.logger.info("Setting up local head label for " + userName)

        const headPos = this.cameraTransform.getWorldPosition()
        const headForward = this.cameraTransform.forward
        const worldUp = new vec3(0, 1, 0)

        this.previousPos = headPos
          .add(headForward.uniformScale(20))
          .add(worldUp.uniformScale(20))
        this.transform.setWorldPosition(this.previousPos)

        this.initializeDefaultValues(userName)

        this.sceneObject.name = this.sceneObject.name + " (Local Head Label)"
        this.sceneObject.enabled = true
        this.headLabelManager.subscribe(this)
      } else {
        this.sceneObject.name = this.sceneObject.name + " (Remote Head Label)"
        this.sceneObject.enabled = true

        this.headLabelManager.subscribe(this)

        this.userInfo = this.syncEntity.networkRoot.ownerInfo

        if (!this.userInfo || (!this.userInfo.connectionId && !this.userInfo.userId)) {
          this.findUserInfoFromSession()
        }

        this.setupPingInteraction()

        const remoteName = this.getUserNameFromSession()

        if (this.headLabelReferences) {
          if (this.headLabelReferences.textUserName) {
            this.headLabelReferences.textUserName.text = remoteName
            this.logger.info(`Set remote username text to: "${remoteName}"`)
          }
          if (this.headLabelReferences.textStatus) {
            this.headLabelReferences.textStatus.text = this.DEFAULT_STATUS
          }
          if (this.headLabelReferences.textSubStatus) {
            this.headLabelReferences.textSubStatus.text = this.DEFAULT_SUB_STATUS
          }
        }
      }
    })
  }

  @bindDestroyEvent
  onDestroy(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onDestroy()")
    this.logger.info("Destroyed")
  }

  private initializeStorageProperties(): void {
    this.syncEntity.addStorageProperty(this.userNameProp)
    this.syncEntity.addStorageProperty(this.statusTextProp)
    this.syncEntity.addStorageProperty(this.subStatusTextProp)
    this.syncEntity.addStorageProperty(this.availabilityProp)
    this.syncEntity.addStorageProperty(this.pingStateProp)

    this.userNameProp.onAnyChange.add((newVal: string, oldVal: string) => this.onUserNameChanged())
    this.statusTextProp.onAnyChange.add((newVal: string, oldVal: string) => this.onStatusTextChanged())
    this.subStatusTextProp.onAnyChange.add((newVal: string, oldVal: string) => this.onSubStatusTextChanged())
    this.availabilityProp.onAnyChange.add((newVal: number, oldVal: number) => this.onAvailabilityChanged())
    this.pingStateProp.onAnyChange.add((newVal: boolean, oldVal: boolean) => this.onPingStateChanged())
  }

  private initializeDefaultValues(userName: string): void {
    try {
      this.logger.info("Initializing default values for " + userName)

      if (this.syncEntity.canIModifyStore()) {
        this.userNameProp.setValueImmediate(this.syncEntity.currentStore, userName)
        this.logger.info("Set username immediately to: " + userName)
      } else {
        this.userNameProp.setPendingValue(userName)
        this.logger.info("Set username as pending: " + userName)
      }

      this.statusTextProp.setPendingValue(this.DEFAULT_STATUS)
      this.subStatusTextProp.setPendingValue(this.DEFAULT_SUB_STATUS)
      this.availabilityProp.setPendingValue(this.DEFAULT_AVAILABILITY)
      this.pingStateProp.setPendingValue(false)

      this.logger.info("Default values set, updating UI...")

      if (this.headLabelReferences) {
        if (this.headLabelReferences.textUserName) {
          this.headLabelReferences.textUserName.text = userName
          this.logger.info(`Set username text to: "${userName}"`)
        }
        if (this.headLabelReferences.textStatus) {
          this.headLabelReferences.textStatus.text = this.DEFAULT_STATUS
          this.logger.info(`Set status text to: "${this.DEFAULT_STATUS}"`)
        }
        if (this.headLabelReferences.textSubStatus) {
          this.headLabelReferences.textSubStatus.text = this.DEFAULT_SUB_STATUS
          this.logger.info(`Set substatus text to: "${this.DEFAULT_SUB_STATUS}"`)
        }
      }

      this.logger.info("Initialization complete")
    } catch (error) {
      this.logger.error("Error in initializeDefaultValues - " + error)
    }
  }

  private getUserNameFromSession(): string {
    if (this.syncEntity.networkRoot && this.syncEntity.networkRoot.dataStore) {
      const dataStore = this.syncEntity.networkRoot.dataStore
      const displayNameFromStore = dataStore.getString("displayName")
      if (displayNameFromStore) {
        this.logger.info(`Found displayName in NetworkRootInfo.dataStore: "${displayNameFromStore}"`)
        return displayNameFromStore
      }
    }

    if (this.isLocalLabel()) {
      try {
        const localUserInfo = SessionController.getInstance().getLocalUserInfo()
        this.logger.info("Local user info check - exists: " + (localUserInfo ? "YES" : "NO"))

        if (localUserInfo && localUserInfo.displayName) {
          this.logger.info("DisplayName found: " + localUserInfo.displayName)
          return localUserInfo.displayName
        }

        if (localUserInfo && localUserInfo.userId) {
          this.logger.info("UserId found: " + localUserInfo.userId)
          return localUserInfo.userId
        }

        this.logger.info("No displayName/userId from getLocalUserInfo(), trying getLocalUserName()")
        const userName = SessionController.getInstance().getLocalUserName()
        this.logger.info("getLocalUserName() result: " + (userName || "N/A"))
        return userName || "Unknown User"
      } catch (error) {
        this.logger.error("Error getting local user info: " + error)
        try {
          const userName = SessionController.getInstance().getLocalUserName()
          this.logger.info("Fallback getLocalUserName() result: " + (userName || "N/A"))
          return userName || "Unknown User"
        } catch (fallbackError) {
          this.logger.error("Fallback also failed: " + fallbackError)
          return "Unknown User"
        }
      }
    } else {
      const ownerInfo = this.syncEntity.networkRoot.ownerInfo
      if (!ownerInfo) {
        return "Unknown User"
      }

      return ownerInfo.displayName || ownerInfo.userId || ownerInfo.connectionId || "Unknown User"
    }
  }

  private updateUIFromProperties(): void {
    if (!this.headLabelReferences) {
      this.logger.warn("No head label references assigned - skipping UI update")
      return
    }

    try {
      if (this.headLabelReferences.textUserName && this.userNameProp) {
        const userName = String(this.userNameProp.currentOrPendingValue || "Unknown User")
        this.headLabelReferences.textUserName.text = SessionController.getInstance().getLocalUserInfo().displayName
        this.logger.info("Updated username: " + userName)
      }

      if (this.headLabelReferences.textStatus && this.statusTextProp) {
        const status = String(this.statusTextProp.currentOrPendingValue || this.DEFAULT_STATUS)
        this.headLabelReferences.textStatus.text = status
        this.logger.info("Updated status: " + status)
      }

      if (this.headLabelReferences.textSubStatus && this.subStatusTextProp) {
        const subStatus = String(this.subStatusTextProp.currentOrPendingValue || this.DEFAULT_SUB_STATUS)
        this.headLabelReferences.textSubStatus.text = subStatus
        this.logger.info("Updated substatus: " + subStatus)
      }

      if (this.availabilityProp) {
        const availability = Number(this.availabilityProp.currentOrPendingValue) || this.DEFAULT_AVAILABILITY
        this.updateAvailabilityVisual(availability)
      }
    } catch (error) {
      this.logger.error("Error updating UI - " + error)
    }
  }

  private updateAvailabilityVisual(state: number): void {
    this.logger.info("Availability visual update for state " + state + " (not implemented)")
  }

  private onUserNameChanged(): void {
    if (this.headLabelReferences && this.headLabelReferences.textUserName) {
      const newName = this.userNameProp.currentOrPendingValue as string
      this.logger.info(`User name changed to "${newName}"`)
      this.headLabelReferences.textUserName.text = newName
    } else {
      this.logger.warn("Cannot update username - references not available")
    }
  }

  private onStatusTextChanged(): void {
    if (this.headLabelReferences && this.headLabelReferences.textStatus) {
      this.headLabelReferences.textStatus.text = this.statusTextProp.currentOrPendingValue as string
      this.logger.info(`Status changed to "${this.statusTextProp.currentOrPendingValue}"`)
    }
  }

  private onSubStatusTextChanged(): void {
    if (this.headLabelReferences && this.headLabelReferences.textSubStatus) {
      this.headLabelReferences.textSubStatus.text = this.subStatusTextProp.currentOrPendingValue as string
      this.logger.info(`Sub-status changed to "${this.subStatusTextProp.currentOrPendingValue}"`)
    }
  }

  private onAvailabilityChanged(): void {
    const state = this.availabilityProp.currentOrPendingValue as number
    this.updateAvailabilityVisual(state)
    this.logger.info("Availability changed to " + this.getAvailabilityString(state))
  }

  private onPingStateChanged(): void {
    const isPinged = this.pingStateProp.currentOrPendingValue as boolean
    this.logger.info("Ping state changed to " + (isPinged ? "PINGED" : "NOT PINGED"))
  }

  private getAvailabilityString(state: number): string {
    switch (state) {
      case AvailabilityState.Available:
        return "Available"
      case AvailabilityState.Busy:
        return "Busy"
      case AvailabilityState.Away:
        return "Away"
      case AvailabilityState.DoNotDisturb:
        return "Do Not Disturb"
      default:
        return "Unknown"
    }
  }

  updateStatus(statusText: string, subStatus: string): void {
    if (!this.isLocalLabel()) {
      this.logger.warn("Cannot update remote head label")
      return
    }

    this.logger.info(`Setting status to "${statusText}" and subStatus to "${subStatus}"`)
    this.statusTextProp.setPendingValue(statusText)
    this.subStatusTextProp.setPendingValue(subStatus)

    this.savePersistentData("statusText", statusText)
    this.savePersistentData("subStatusText", subStatus)

    this.updateUIFromProperties()
  }

  updateAvailability(state: number): void {
    if (!this.isLocalLabel()) {
      this.logger.warn("Cannot update remote head label")
      return
    }

    this.logger.info("Setting availability to " + this.getAvailabilityString(state))
    this.availabilityProp.setPendingValue(state)

    this.savePersistentData("availability", state)

    this.updateUIFromProperties()
  }

  updatePingState(isPinged: boolean): void {
    if (!this.isLocalLabel()) {
      this.logger.warn("Cannot update remote head label")
      return
    }

    this.logger.info("Setting ping state to " + (isPinged ? "PINGED" : "NOT PINGED"))
    this.pingStateProp.setPendingValue(isPinged)

    this.updatePingVisual(isPinged)

    this.updateUIFromProperties()
  }

  /**
   * Update ping visual state (called by PingMenu)
   */
  updatePingVisual(isConnected: boolean): void {
    this.logger.info("updatePingVisual called with isConnected: " + isConnected)

    if (!this.headLabelReferences) {
      this.logger.warn("No head label references available")
      return
    }

    const targetMaterial = isConnected
      ? this.headLabelReferences.pingAcceptedMaterial
      : this.headLabelReferences.pingDefaultMaterial

    this.logger.info("Using " + (isConnected ? "ACCEPTED" : "DEFAULT") + " material")

    if (!targetMaterial) {
      this.logger.warn("Ping materials not assigned in references")
      return
    }

    const targetColor = targetMaterial.mainPass.baseColor
    this.logger.info(
      `Target color: R=${targetColor.r.toFixed(2)}, G=${targetColor.g.toFixed(2)}, B=${targetColor.b.toFixed(2)}`
    )

    if (this.headLabelReferences.pingMaterialTargets && this.headLabelReferences.pingMaterialTargets.length > 0) {
      let targetsUpdated = 0

      this.headLabelReferences.pingMaterialTargets.forEach((target, index) => {
        if (target) {
          const renderMeshVisual = target.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
          if (renderMeshVisual) {
            renderMeshVisual.mainMaterial = targetMaterial
            this.logger.info(
              `Target ${index} - Material swapped to ${isConnected ? "accepted" : "default"}`
            )
            targetsUpdated++
          } else {
            this.logger.warn(`Ping material target ${index} has no RenderMeshVisual`)
          }
        } else {
          this.logger.warn(`Ping material target ${index} is null`)
        }
      })

      this.logger.info(
        `Updated ${targetsUpdated}/${this.headLabelReferences.pingMaterialTargets.length} targets with ${isConnected ? "accepted" : "default"} material`
      )
    } else {
      this.logger.warn("No ping material targets assigned in references")
    }

    this.logger.info("Updated ping visual state - connected: " + isConnected)
  }

  getStatusText(): string {
    return this.statusTextProp ? (this.statusTextProp.currentOrPendingValue as string) : this.DEFAULT_STATUS
  }

  getSubStatusText(): string {
    return this.subStatusTextProp
      ? (this.subStatusTextProp.currentOrPendingValue as string)
      : this.DEFAULT_SUB_STATUS
  }

  getAvailability(): number {
    return this.availabilityProp
      ? (this.availabilityProp.currentOrPendingValue as number)
      : this.DEFAULT_AVAILABILITY
  }

  isPinged(): boolean {
    return this.pingStateProp ? (this.pingStateProp.currentOrPendingValue as boolean) : false
  }

  isLocalLabel(): boolean {
    return this.syncEntity && this.syncEntity.networkRoot.locallyCreated
  }

  private logUserInfo(): void {
    const isLocal = this.isLocalLabel()
    const prefix = isLocal ? "LOCAL" : "REMOTE"

    if (isLocal) {
      try {
        const sessionController = SessionController.getInstance()
        const localUserInfo = sessionController.getLocalUserInfo()
        if (localUserInfo) {
          this.logger.info(`${prefix} User Info:`)
          this.logger.info(`   DisplayName: ${localUserInfo.displayName || "N/A"}`)
          this.logger.info(`   UserId: ${localUserInfo.userId || "N/A"}`)
          this.logger.info(`   ConnectionId: ${localUserInfo.connectionId || "N/A"}`)
        } else {
          this.logger.info(`${prefix} User Info: SessionController user info not available`)
        }
      } catch (error) {
        this.logger.error(`${prefix} User Info: Error accessing SessionController - ${error}`)
      }
    } else {
      const ownerInfo = this.syncEntity.networkRoot.ownerInfo
      if (ownerInfo) {
        this.logger.info(`${prefix} User Info:`)
        this.logger.info(`   DisplayName: ${ownerInfo.displayName || "N/A"}`)
        this.logger.info(`   UserId: ${ownerInfo.userId || "N/A"}`)
        this.logger.info(`   ConnectionId: ${ownerInfo.connectionId || "N/A"}`)
      } else {
        this.logger.info(`${prefix} User Info: Owner info not available`)
      }
    }
  }

  private findUserInfoFromSession(): void {
    const allUsers = SessionController.getInstance().getUsers()
    const localUserInfo = SessionController.getInstance().getLocalUserInfo()

    const remoteUsers = allUsers.filter((user) => {
      const userConnectionId = user.connectionId || user.userId
      const localConnectionId = localUserInfo?.connectionId || localUserInfo?.userId
      return userConnectionId !== localConnectionId
    })

    if (remoteUsers.length > 0) {
      this.userInfo = remoteUsers[0]
      this.logger.info(
        "Assigned user info from session - " + (this.userInfo.displayName || this.userInfo.connectionId)
      )
    }
  }

  public getUserInfo(): ConnectedLensModule.UserInfo | null {
    return this.userInfo
  }

  private initializeCloudStorage(): void {
    if (!this.cloudStorageModule) {
      this.logger.warn("No CloudStorageModule assigned")
      return
    }

    if (this.cloudStore) {
      this.logger.info("Cloud storage already initialized")
      return
    }

    const cloudStorageOptions = CloudStorageOptions.create()
    this.cloudStorageModule.getCloudStore(
      cloudStorageOptions,
      (store) => this.onCloudStoreReady(store),
      (code, message) => this.logger.error("Cloud storage error: " + code + " - " + message)
    )
  }

  private onCloudStoreReady(store: CloudStore): void {
    this.cloudStore = store
    this.logger.info("Cloud storage ready")

    if (this.isLocalLabel()) {
      this.loadPersistentData()
    }
  }

  private loadPersistentData(): void {
    if (!this.cloudStore) {
      this.logger.warn("Cloud store not ready for loading")
      return
    }

    const readOptions = CloudStorageReadOptions.create()
    readOptions.scope = StorageScope.User

    const userInfo = SessionController.getInstance().getLocalUserInfo()
    const keyPrefix = userInfo?.connectionId || userInfo?.userId || "default"

    this.cloudStore.getValue(
      `${keyPrefix}_statusText`,
      readOptions,
      (key, value) => {
        if (value) {
          this.statusTextProp.setPendingValue(value as string)
          this.logger.info("Loaded status: " + value)
        }
      },
      (code, message) => this.logger.info("No saved status found")
    )

    this.cloudStore.getValue(
      `${keyPrefix}_subStatusText`,
      readOptions,
      (key, value) => {
        if (value) {
          this.subStatusTextProp.setPendingValue(value as string)
          this.logger.info("Loaded subStatus: " + value)
        }
      },
      (code, message) => this.logger.info("No saved subStatus found")
    )

    this.cloudStore.getValue(
      `${keyPrefix}_availability`,
      readOptions,
      (key, value) => {
        if (value !== null && value !== undefined) {
          this.availabilityProp.setPendingValue(value as number)
          this.logger.info("Loaded availability: " + value)
        }
      },
      (code, message) => this.logger.info("No saved availability found")
    )
  }

  private savePersistentData(key: string, value: any): void {
    if (!this.cloudStore || !this.isLocalLabel()) {
      return
    }

    const userInfo = SessionController.getInstance().getLocalUserInfo()
    const keyPrefix = userInfo?.connectionId || userInfo?.userId || "default"

    const writeOptions = CloudStorageWriteOptions.create()
    writeOptions.scope = StorageScope.User

    this.cloudStore.setValue(
      `${keyPrefix}_${key}`,
      value,
      writeOptions,
      () => this.logger.info(`Saved ${key}: ${value}`),
      (code, message) => this.logger.error(`Save error: ${code} - ${message}`)
    )
  }

  private setupPingInteraction(): void {
    if (!this.pingMenu) {
      this.logger.warn("No ping menu assigned for interaction setup")
      return
    }

    const button = this.sceneObject.getComponent(RectangleButton.getTypeName()) as RectangleButton
    if (!button) {
      this.logger.warn("No RectangleButton component found for ping interaction")
      return
    }

    button.onTriggerUp.add(() => {
      this.onPingButtonTriggered()
    })

    this.logger.info("Ping interaction set up for remote head label")
  }

  private onPingButtonTriggered(): void {
    if (!this.pingMenu) {
      this.logger.warn("No ping menu available")
      return
    }

    const interactorName = "Remote Player"
    this.logger.info("Ping button triggered by " + interactorName)

    this.pingMenu.sendPingFromInteraction(this, interactorName)
  }
}
