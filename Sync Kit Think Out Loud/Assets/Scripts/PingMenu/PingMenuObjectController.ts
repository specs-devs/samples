/**
 * Specs Inc. 2026
 * Ping Menu Object Controller for the Think Out Loud Spectacles lens experience.
 */
import { PingMenuReferences } from "../PingMenu/PingMenuReferences"
import { PingMenu } from "./PingMenu"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"

/**
 * Controller for the ping menu UI that appears when a user receives a ping request.
 * Handles accept/reject button interactions and communicates with the main ping system.
 */
@component
export class PingMenuObjectController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PingMenuObjectController – handles accept/reject interactions for incoming ping requests</span><br/><span style="color: #94A3B8; font-size: 11px;">Connects ping request UI buttons to the PingMenu network response flow.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Reference to the ping menu UI components")
  pingMenuReferences: PingMenuReferences

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @input
  @hint("Time in seconds before ping request auto-expires")
  autoExpireTime: number = 15

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private pingData: any = null
  private pingMenu: PingMenu = null
  private expireTimer: DelayedCallbackEvent = null

  onAwake(): void {
    this.logger = new Logger("PingMenuObjectController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    if (!this.pingMenuReferences) {
      this.logger.warn("No ping menu references assigned")
      return
    }

    this.setupButtonHandlers()
  }

  private setupButtonHandlers(): void {
    if (this.pingMenuReferences.acceptButton) {
      this.pingMenuReferences.acceptButton.onTriggerUp.add(() => {
        this.onAcceptButtonPressed()
      })

      this.logger.info("Connected accept button")
    }

    if (this.pingMenuReferences.rejectButton) {
      this.pingMenuReferences.rejectButton.onTriggerUp.add(() => {
        this.onRejectButtonPressed()
      })

      this.logger.info("Connected reject button")
    }
  }

  /**
   * Called by PingMenu to set up this ping menu with request data
   */
  public setupPingRequest(pingData: any, pingMenu: PingMenu): void {
    this.logger.info("setupPingRequest called")
    this.logger.info("pingData: " + (pingData ? "RECEIVED" : "NULL"))
    this.logger.info("pingMenu: " + (pingMenu ? "RECEIVED" : "NULL"))

    this.pingData = pingData
    this.pingMenu = pingMenu

    this.logger.info("Setting up ping request from user " + pingData.from)

    this.updateUIForPingRequest()
    this.startAutoExpireTimer()
  }

  private updateUIForPingRequest(): void {
    if (this.pingMenuReferences.pingerNameText && this.pingData) {
      const pingerName = this.getPingerDisplayName()
      this.pingMenuReferences.pingerNameText.text = `${pingerName} wants to connect`
    }

    this.logger.info("Updated UI for ping from " + this.pingData.from)
  }

  private getPingerDisplayName(): string {
    if (this.pingData && this.pingData.from) {
      return this.pingData.displayName || this.pingData.from || "Unknown User"
    }
    return "Unknown User"
  }

  private startAutoExpireTimer(): void {
    if (this.expireTimer) {
      this.expireTimer.reset(this.autoExpireTime)
    } else {
      this.expireTimer = this.createEvent("DelayedCallbackEvent")
      this.expireTimer.bind(() => {
        this.onAutoExpire()
      })
      this.expireTimer.reset(this.autoExpireTime)
    }

    this.logger.info("Auto-expire timer set for " + this.autoExpireTime + " seconds")
  }

  private onAutoExpire(): void {
    this.logger.info("Ping request auto-expired")
    this.handlePingResponse(false)
  }

  private onAcceptButtonPressed(): void {
    this.logger.info("Accept button pressed")
    this.handlePingResponse(true)
  }

  private onRejectButtonPressed(): void {
    this.logger.info("Reject button pressed")
    this.handlePingResponse(false)
  }

  private handlePingResponse(accepted: boolean): void {
    this.logger.info("handlePingResponse called with accepted: " + accepted)
    this.logger.info("pingMenu is " + (this.pingMenu ? "ASSIGNED" : "NULL"))
    this.logger.info("pingData is " + (this.pingData ? "ASSIGNED" : "NULL"))

    if (this.expireTimer) {
      this.expireTimer.cancel()
      this.expireTimer = null
    }

    if (this.pingMenu && this.pingData) {
      this.logger.info("Calling respondToPing on pingMenu")
      this.pingMenu.respondToPing(this.pingData, accepted)
    } else {
      this.logger.warn(
        "Cannot call respondToPing - pingMenu: " + (this.pingMenu ? "OK" : "NULL") +
        ", pingData: " + (this.pingData ? "OK" : "NULL")
      )
    }

    this.showResponseFeedback(accepted)

    this.logger.info("Ping " + (accepted ? "accepted" : "rejected"))
  }

  private showResponseFeedback(accepted: boolean): void {
    const feedbackMessage = accepted ? "Connection established!" : "Ping declined"
    this.logger.info(feedbackMessage)
  }

  /**
   * Called externally to force close this ping menu
   */
  public closePingMenu(): void {
    if (this.expireTimer) {
      this.expireTimer.cancel()
      this.expireTimer = null
    }

    this.sceneObject.destroy()

    this.logger.info("Ping menu closed")
  }
}
