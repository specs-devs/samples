/**
 * Specs Inc. 2026
 * Ping Menu component for the Think Out Loud Spectacles lens.
 */
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import { SessionController } from "SpectaclesSyncKit.lspkg/Core/SessionController"
import { SyncEntity } from "SpectaclesSyncKit.lspkg/Core/SyncEntity"
import { HeadLabelObjectController } from "../HeadLabel/HeadLabelObjectController"
import { HeadLabelObjectManager } from "../HeadLabel/HeadLabelObjectManager"
import { PingMenuObjectController } from "./PingMenuObjectController"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"

/**
 * Main controller for the ping system.
 * Handles network events and ping state management via ContainerFrame interactions.
 */
@component
export class PingMenu extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PingMenu – manages ping request network events and visual connection state</span><br/><span style="color: #94A3B8; font-size: 11px;">Broadcasts ping requests and responses via SyncEntity events; updates head label materials on connection.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Reference to the head label manager to get all user head labels")
  headLabelManager: HeadLabelObjectManager

  @input
  @hint("PingMenu prefab to instantiate when receiving ping requests")
  pingMenuPrefab: ObjectPrefab

  @input
  @hint("Audio component to play when sending a ping")
  pingSendAudio: AudioComponent

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @input
  @hint("Prefer UserId over ConnectionId for targeting; enable for same user across devices, disable for device-specific targeting")
  preferUserId: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private syncEntity: SyncEntity

  private activePingMenu: SceneObject | null = null
  private pingMenuAutoCloseEvent: DelayedCallbackEvent | null = null

  private sentPings: Map<string, number> = new Map()
  private receivedPings: Map<string, number> = new Map()
  private activePingConnections: Set<string> = new Set()

  onAwake(): void {
    this.logger = new Logger("PingMenu", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.logger.info("Initializing ping system...")
    this.initializeSystem()
  }

  private initializeSystem(): void {
    SessionController.getInstance().notifyOnReady(() => {
      this.logger.info("Session ready, setting up ping events...")
      this.setupPingEvents()
    })
  }

  private setupPingEvents(): void {
    this.syncEntity = new SyncEntity(this, null, false, "Session")

    this.syncEntity.notifyOnReady(() => {
      this.syncEntity.onEventReceived.add("ping_request", (messageInfo) => {
        this.handlePingRequest(messageInfo)
      })

      this.syncEntity.onEventReceived.add("ping_response", (messageInfo) => {
        this.handlePingResponse(messageInfo)
      })

      this.syncEntity.onEventReceived.add("ping_connection_update", (messageInfo) => {
        this.handlePingConnectionUpdate(messageInfo)
      })

      this.logger.info("Ping events system initialized and ready")
    })
  }

  private sendPingToUser(targetHeadLabel: HeadLabelObjectController): void {
    if (targetHeadLabel.isLocalLabel()) {
      this.logger.warn("Cannot ping yourself")
      return
    }

    if (!this.syncEntity || !this.syncEntity.isSetupFinished) {
      this.logger.warn("Sync entity not ready")
      return
    }

    const targetUserInfo = targetHeadLabel.getUserInfo()
    const myUserInfo = SessionController.getInstance().getLocalUserInfo()
    const myUserId = myUserInfo?.connectionId || myUserInfo?.userId || "unknown"

    this.logger.info("Target head label user info:")
    if (targetUserInfo) {
      this.logger.info("  DisplayName: " + (targetUserInfo.displayName || "N/A"))
      this.logger.info("  ConnectionId: " + (targetUserInfo.connectionId || "N/A"))
      this.logger.info("  UserId: " + (targetUserInfo.userId || "N/A"))
    } else {
      this.logger.info("  No user info available")
    }

    if (!targetUserInfo) {
      this.logger.warn("No target user info available from head label")
      return
    }

    const targetUserId = this.preferUserId
      ? targetUserInfo.userId || targetUserInfo.connectionId
      : targetUserInfo.connectionId || targetUserInfo.userId

    this.logger.info("Using " + (this.preferUserId ? "UserId" : "ConnectionId") + " preference for targeting")
    this.logger.info(`Target ID: '${targetUserId}', My ID: '${myUserId}'`)

    if (!targetUserId) {
      this.logger.warn("Could not determine target user ID")
      return
    }

    const lastPingTime = this.sentPings.get(targetUserId) || 0
    const currentTime = Date.now()
    if (currentTime - lastPingTime < 3000) {
      this.logger.info("Ping cooldown active")
      return
    }

    const pingData = {
      to: targetUserId,
      timestamp: currentTime
    }

    this.syncEntity.sendEvent("ping_request", pingData)
    this.sentPings.set(targetUserId, currentTime)

    this.logger.info("Sent ping to user " + targetUserId)
  }

  private handlePingRequest(messageInfo: any): void {
    const myUserInfo = SessionController.getInstance().getLocalUserInfo()
    const myUserId = this.preferUserId
      ? myUserInfo?.userId || myUserInfo?.connectionId || "unknown"
      : myUserInfo?.connectionId || myUserInfo?.userId || "unknown"
    const pingData = messageInfo.data

    this.logger.info(`Checking ping target - My ID: '${myUserId}', Ping To: '${pingData.to}'`)
    this.logger.info(`My ConnectionId: '${myUserInfo?.connectionId}', My UserId: '${myUserInfo?.userId}'`)

    if (pingData.to !== myUserId) {
      this.logger.info("Ping not for me - ignoring")
      return
    }

    this.logger.info("Received ping request from " + messageInfo.senderUserId)

    this.receivedPings.set(messageInfo.senderUserId, pingData.timestamp)

    const allUsers = SessionController.getInstance().getUsers()
    const senderUserInfo = allUsers.find(
      (user) => user.userId === messageInfo.senderUserId || user.connectionId === messageInfo.senderUserId
    )
    const senderDisplayName = senderUserInfo?.displayName || messageInfo.senderUserId

    const pingRequestData = {
      from: messageInfo.senderUserId,
      displayName: senderDisplayName,
      to: pingData.to,
      timestamp: pingData.timestamp
    }

    this.showPingMenu(pingRequestData)
  }

  private handlePingResponse(messageInfo: any): void {
    const myUserInfo = SessionController.getInstance().getLocalUserInfo()
    const myUserId = this.preferUserId
      ? myUserInfo?.userId || myUserInfo?.connectionId || "unknown"
      : myUserInfo?.connectionId || myUserInfo?.userId || "unknown"
    const responseData = messageInfo.data

    if (responseData.to !== myUserId) {
      return
    }

    this.logger.info(
      `Received ping response from ${messageInfo.senderUserId}: ${responseData.accepted ? "ACCEPTED" : "REJECTED"}`
    )

    if (responseData.accepted) {
      this.activePingConnections.add(messageInfo.senderUserId)
      this.logger.info("Ping connection established with " + messageInfo.senderUserId)
    } else {
      this.logger.info("Ping rejected by " + messageInfo.senderUserId)
    }
  }

  private handlePingConnectionUpdate(messageInfo: any): void {
    const connectionData = messageInfo.data

    this.logger.info(
      `Received connection update: ${connectionData.userA} <-> ${connectionData.userB}, connected: ${connectionData.connected}`
    )

    if (connectionData.connected) {
      this.logger.info("Processing CONNECT event for users")
    } else {
      this.logger.info("Processing DISCONNECT event for users")
    }

    this.updatePingConnectionVisual(connectionData.userA, connectionData.connected)
    this.updatePingConnectionVisual(connectionData.userB, connectionData.connected)

    const myUserInfo = SessionController.getInstance().getLocalUserInfo()
    const myUserId = this.preferUserId
      ? myUserInfo?.userId || myUserInfo?.connectionId || "unknown"
      : myUserInfo?.connectionId || myUserInfo?.userId || "unknown"

    if (connectionData.userA === myUserId || connectionData.userB === myUserId) {
      this.updateMyPingConnectionVisual(connectionData.connected)

      const otherUserId = connectionData.userA === myUserId ? connectionData.userB : connectionData.userA
      if (connectionData.connected) {
        this.activePingConnections.add(otherUserId)
      } else {
        this.activePingConnections.delete(otherUserId)
      }
    }
  }

  private showPingMenu(pingData: any): void {
    if (this.activePingMenu) {
      this.activePingMenu.destroy()
    }

    if (!this.pingMenuPrefab) {
      this.logger.warn("No ping menu prefab assigned")
      return
    }

    this.activePingMenu = this.pingMenuPrefab.instantiate(null)

    const headPos = this.getHeadPosition()
    const cameraTransform = WorldCameraFinderProvider.getInstance().getTransform()
    const forward = cameraTransform.forward

    const flattenedForward = this.normalizeVector(new vec3(forward.x, 0, forward.z))
    const offset = new vec3(0, -5, -55)

    const targetPosition = new vec3(
      headPos.x + flattenedForward.x * offset.z,
      headPos.y + offset.y,
      headPos.z + flattenedForward.z * offset.z
    )

    this.activePingMenu.getTransform().setWorldPosition(targetPosition)

    const cameraPosition = cameraTransform.getWorldPosition()
    const menuToCamera = cameraPosition.sub(targetPosition).normalize()
    const lookAtRotation = quat.lookAt(menuToCamera, new vec3(0, 1, 0))
    this.activePingMenu.getTransform().setWorldRotation(lookAtRotation)

    this.logger.info(
      `Positioned at ${targetPosition.x.toFixed(1)}, ${targetPosition.y.toFixed(1)}, ${targetPosition.z.toFixed(1)}`
    )

    this.logger.info("Looking for PingMenuObjectController on instantiated prefab")

    let pingMenuController = this.activePingMenu.getComponent(
      PingMenuObjectController.getTypeName()
    ) as PingMenuObjectController

    if (!pingMenuController) {
      this.logger.info("getTypeName() failed, trying Component.ScriptComponent")
      pingMenuController = this.activePingMenu.getComponent("Component.ScriptComponent") as PingMenuObjectController
    }

    if (!pingMenuController) {
      this.logger.info("Searching child objects for PingMenuObjectController")
      for (let i = 0; i < this.activePingMenu.getChildrenCount(); i++) {
        const child = this.activePingMenu.getChild(i)
        pingMenuController = child.getComponent(PingMenuObjectController.getTypeName()) as PingMenuObjectController
        if (pingMenuController) {
          this.logger.info("Found PingMenuObjectController on child " + i)
          break
        }
      }
    }

    if (pingMenuController && pingMenuController.setupPingRequest) {
      this.logger.info("Found PingMenuObjectController, calling setupPingRequest")
      pingMenuController.setupPingRequest(pingData, this)
    } else {
      this.logger.warn("Could not find PingMenuObjectController on ping menu prefab or children")
      if (pingMenuController) {
        this.logger.warn("setupPingRequest method: " + (pingMenuController.setupPingRequest ? "EXISTS" : "MISSING"))
      }
    }

    this.setupAutoCloseTimer()

    this.logger.info("Ping menu displayed with 10s auto-close timer")
  }

  private getHeadPosition(): vec3 {
    const cameraProvider = WorldCameraFinderProvider.getInstance()
    return cameraProvider.getTransform().getWorldPosition()
  }

  private setupAutoCloseTimer(): void {
    if (this.pingMenuAutoCloseEvent) {
      this.pingMenuAutoCloseEvent.enabled = false
    }

    this.pingMenuAutoCloseEvent = this.createEvent("DelayedCallbackEvent")
    this.pingMenuAutoCloseEvent.bind(() => {
      this.logger.info("Auto-closing ping menu after 10 seconds")
      this.closePingMenu()
    })
    this.pingMenuAutoCloseEvent.reset(10.0)
  }

  private closePingMenu(): void {
    if (this.activePingMenu) {
      this.activePingMenu.destroy()
      this.activePingMenu = null
    }

    if (this.pingMenuAutoCloseEvent) {
      this.pingMenuAutoCloseEvent.enabled = false
      this.pingMenuAutoCloseEvent = null
    }
  }

  private updatePingConnectionVisual(userId: string, isConnected: boolean): void {
    this.logger.info(`updatePingConnectionVisual called for userId: ${userId}, isConnected: ${isConnected}`)

    const allRemoteHeadLabels = this.headLabelManager.getAllRemoteHeadLabels()
    this.logger.info("Found " + allRemoteHeadLabels.length + " remote head labels")

    for (const headLabel of allRemoteHeadLabels) {
      const userInfo = headLabel.getUserInfo()
      const headLabelUserId = this.preferUserId
        ? userInfo?.userId || userInfo?.connectionId
        : userInfo?.connectionId || userInfo?.userId

      if (headLabelUserId === userId) {
        this.logger.info("Found matching head label, calling updatePingVisual")
        headLabel.updatePingVisual(isConnected)
        this.logger.info("Updated ping visual for user " + userId)
        break
      }
    }
  }

  /**
   * Update the local user's head label ping visual
   */
  private updateMyPingConnectionVisual(isConnected: boolean): void {
    this.logger.info("updateMyPingConnectionVisual called, isConnected: " + isConnected)

    const myHeadLabel = this.headLabelManager.getMyHeadLabel()
    if (myHeadLabel) {
      this.logger.info("Found my head label, calling updatePingVisual")
      myHeadLabel.updatePingVisual(isConnected)
      this.logger.info("Updated my own ping visual - connected: " + isConnected)
    } else {
      this.logger.warn("Could not update my ping visual - local head label not available")
    }
  }

  /**
   * Public method called by PingMenuObjectController when user responds to ping
   */
  public respondToPing(pingData: any, accepted: boolean): void {
    this.logger.info("respondToPing called with accepted: " + accepted)

    if (!this.syncEntity || !this.syncEntity.isSetupFinished) {
      this.logger.warn("Cannot respond - sync entity not ready")
      return
    }

    const myUserInfo = SessionController.getInstance().getLocalUserInfo()
    const myUserId = this.preferUserId
      ? myUserInfo?.userId || myUserInfo?.connectionId || "unknown"
      : myUserInfo?.connectionId || myUserInfo?.userId || "unknown"

    const responseData = {
      to: pingData.from,
      timestamp: Date.now(),
      accepted: accepted,
      originalPingTimestamp: pingData.timestamp
    }

    this.syncEntity.sendEvent("ping_response", responseData)

    if (accepted) {
      this.activePingConnections.add(pingData.from)

      const connectionData = {
        userA: pingData.from,
        userB: myUserId,
        connected: true,
        timestamp: Date.now()
      }
      this.syncEntity.sendEvent("ping_connection_update", connectionData)

      this.logger.info(`Sent connection update to all users: ${pingData.from} <-> ${myUserId}`)
    }

    this.closePingMenu()

    this.logger.info("Responded to ping: " + (accepted ? "ACCEPTED" : "REJECTED"))
  }

  /**
   * Public method to exit an active ping connection
   */
  public exitPingConnection(userId: string): void {
    this.activePingConnections.delete(userId)

    const myUserInfo = SessionController.getInstance().getLocalUserInfo()
    const myId = this.preferUserId
      ? myUserInfo?.userId || myUserInfo?.connectionId || "unknown"
      : myUserInfo?.connectionId || myUserInfo?.userId || "unknown"

    const disconnectionData = {
      userA: userId,
      userB: myId,
      connected: false,
      timestamp: Date.now()
    }
    this.syncEntity.sendEvent("ping_connection_update", disconnectionData)

    this.logger.info(`Exited ping connection with ${userId} and sent disconnect to all users`)
  }

  /**
   * Get all active ping connections
   */
  public getActivePingConnections(): string[] {
    return Array.from(this.activePingConnections)
  }

  /**
   * Check if connected to a specific user
   */
  public isConnectedToUser(userId: string): boolean {
    return this.activePingConnections.has(userId)
  }

  private normalizeVector(v: vec3): vec3 {
    return v.length < 0.0001 ? new vec3(0, 0, 0) : v.normalize()
  }

  /**
   * Public method called by HeadLabelObjectController when ContainerFrame is triggered
   */
  public sendPingFromInteraction(targetHeadLabel: HeadLabelObjectController, interactorName: string): void {
    this.logger.info("Ping triggered via interaction from " + interactorName)

    if (this.pingSendAudio) {
      this.pingSendAudio.play(1)
    }

    this.sendPingToUser(targetHeadLabel)
  }
}
