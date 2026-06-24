/**
 * Specs Inc. 2026
 * Head Label Object Manager handling core logic for the Think Out Loud lens.
 */
import { Instantiator } from "SpectaclesSyncKit.lspkg/Components/Instantiator"
import { SessionController } from "SpectaclesSyncKit.lspkg/Core/SessionController"
import { HeadLabelObjectController } from "./HeadLabelObjectController"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"

@component
export class HeadLabelObjectManager extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">HeadLabelObjectManager – manages instantiation and tracking of all head labels in session</span><br/><span style="color: #94A3B8; font-size: 11px;">Instantiates the local player\'s head label and tracks all labels in the session.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Instantiator component for creating synced head label objects")
  instantiator: Instantiator

  @input
  @hint("Prefab to instantiate for each player's floating head label")
  headLabelPrefab: ObjectPrefab

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private static managerCount: number = 0

  private logger: Logger
  private myHeadLabel: HeadLabelObjectController
  private allHeadLabels: HeadLabelObjectController[] = []
  private hasInstantiated: boolean = false

  private onHeadLabelReadyCallbacks: ((headLabel: HeadLabelObjectController) => void)[] = []

  onAwake(): void {
    this.logger = new Logger("HeadLabelObjectManager", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    HeadLabelObjectManager.managerCount++
    this.logger.info(
      "onStart() called - Instance: " +
        this.sceneObject.name +
        " - UniqueId: " +
        this.sceneObject.uniqueIdentifier
    )
    this.logger.info("This is manager instance #" + HeadLabelObjectManager.managerCount)
    this.logger.info("Scene object path: " + this.getSceneObjectPath())

    if (HeadLabelObjectManager.managerCount > 1) {
      this.logger.warn("Multiple HeadLabelObjectManager instances detected! This will cause duplicate head label instantiation!")
    }

    SessionController.getInstance().notifyOnReady(() => {
      this.logger.info(
        "SessionController ready - Instance: " +
          this.sceneObject.name +
          " - UniqueId: " +
          this.sceneObject.uniqueIdentifier
      )
      this.instantiator.notifyOnReady(() => {
        this.logger.info(
          "Instantiator ready, calling instantiateHeadLabel - Instance: " +
            this.sceneObject.name +
            " - UniqueId: " +
            this.sceneObject.uniqueIdentifier
        )
        this.logger.info("Instantiator object name: " + this.instantiator.sceneObject.name)
        this.logger.info(
          "Head label prefab assigned: " + (this.headLabelPrefab ? this.headLabelPrefab.name : "NULL")
        )
        this.instantiateHeadLabel()
      })
    })
  }

  onUpdate(): void {
    this.allHeadLabels.forEach((headLabel) => {
      if (headLabel && headLabel.isLocalLabel()) {
        headLabel.onUpdate()
      }
    })
  }

  subscribe(headLabel: HeadLabelObjectController): void {
    this.allHeadLabels.push(headLabel)

    if (headLabel.isLocalLabel()) {
      this.myHeadLabel = headLabel
      this.logger.info("Subscribed to local head label")
      this.notifyHeadLabelReady(headLabel)
    } else {
      this.logger.info("Subscribed to remote head label")
    }

    if (this.allHeadLabels.length === 1) {
      this.createEvent("UpdateEvent").bind(() => this.onUpdate())
    }
  }

  /**
   * Instantiate the head label for the local user.
   * Called when the session is ready and the instantiator is ready.
   */
  instantiateHeadLabel(): void {
    if (this.hasInstantiated) {
      this.logger.info("Head label already instantiated, skipping - Instance: " + this.sceneObject.name)
      return
    }

    const localUserInfo = SessionController.getInstance().getLocalUserInfo()
    this.logger.info("Local user info check - exists: " + (localUserInfo ? "YES" : "NO"))

    let displayName = "Unknown User"
    let userId = "Unknown"

    if (localUserInfo) {
      this.logger.info("DisplayName: " + (localUserInfo.displayName || "N/A"))
      this.logger.info("UserId: " + (localUserInfo.userId || "N/A"))
      this.logger.info("ConnectionId: " + (localUserInfo.connectionId || "N/A"))

      if (localUserInfo.displayName) {
        displayName = localUserInfo.displayName
        userId = localUserInfo.userId || "Unknown"
      } else if (localUserInfo.userId) {
        displayName = localUserInfo.userId
        userId = localUserInfo.userId
      }
    }

    if (displayName === "Unknown User") {
      this.logger.info("No good name from getLocalUserInfo(), trying getLocalUserName()")
      const userName = SessionController.getInstance().getLocalUserName()
      this.logger.info("getLocalUserName() result: " + (userName || "N/A"))
      if (userName) {
        displayName = userName
        userId = userName
      }
    }

    this.logger.info("Instantiating head label for " + displayName + " (userId: " + userId + ")")

    const customDataStore = GeneralDataStore.create()
    customDataStore.putString("displayName", displayName)
    customDataStore.putString("userId", userId)
    this.logger.info("Created customDataStore with displayName=\"" + displayName + "\"")

    this.hasInstantiated = true

    this.instantiator.instantiate(this.headLabelPrefab, {
      overrideNetworkId: (localUserInfo?.connectionId || userId) + "_headLabel",
      persistence: "Owner",
      claimOwnership: true,
      customDataStore: customDataStore,
      onSuccess: (networkRoot) => {
        this.logger.info("Head label instantiated successfully with Owner persistence")
        this.logger.info("Network ID: " + (userId + "_headLabel"))
      },
      onError: (error) => {
        this.logger.error("Error instantiating head label: " + error)
        this.hasInstantiated = false
      }
    })
  }

  getMyHeadLabel(): HeadLabelObjectController | null {
    return this.myHeadLabel || null
  }

  getAllRemoteHeadLabels(): HeadLabelObjectController[] {
    return this.allHeadLabels.filter((label) => !label.isLocalLabel())
  }

  updateMyStatus(statusText: string, subStatus: string): void {
    if (this.myHeadLabel) {
      this.myHeadLabel.updateStatus(statusText, subStatus)
      this.logger.info("Updated local status - \"" + statusText + "\" / \"" + subStatus + "\"")
    } else {
      this.logger.warn("Cannot update status - local head label not ready")
    }
  }

  updateMyAvailability(availabilityState: number): void {
    if (this.myHeadLabel) {
      this.myHeadLabel.updateAvailability(availabilityState)
      this.logger.info("Updated availability state to " + availabilityState)
    } else {
      this.logger.warn("Cannot update availability - local head label not ready")
    }
  }

  subscribeToHeadLabelReady(callback: (headLabel: HeadLabelObjectController) => void): void {
    this.onHeadLabelReadyCallbacks.push(callback)

    if (this.myHeadLabel) {
      callback(this.myHeadLabel)
    }
  }

  private notifyHeadLabelReady(headLabel: HeadLabelObjectController): void {
    this.onHeadLabelReadyCallbacks.forEach((callback) => callback(headLabel))
  }

  private getSceneObjectPath(): string {
    let path = this.sceneObject.name
    let parent = this.sceneObject.getParent()
    while (parent) {
      path = parent.name + "/" + path
      parent = parent.getParent()
    }
    return path
  }
}
