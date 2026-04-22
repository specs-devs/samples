/**
 * Specs Inc. 2026
 * Hand Menu Tester component for the Think Out Loud Spectacles lens.
 */
import { HandMenu } from "../HandMenu/HandMenu"
import { PingMenu } from "../PingMenu/PingMenu"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"

/**
 * Simple testing script to invoke the hand menu via tap event
 * This allows testing the hand menu functionality without hand tracking
 */
@component
export class HandMenuTester extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">HandMenuTester – test helper for triggering hand menu and ping via tap</span><br/><span style="color: #94A3B8; font-size: 11px;">Tap the screen to show/hide the hand menu or exit ping connections without needing hand tracking.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Reference to the HandMenu component to activate")
  handMenu: HandMenu

  @input
  @hint("Reference to the PingMenu component for exit ping testing")
  pingMenu: PingMenu

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Testing</span>')
  @input
  @hint("Enable tap to show hand menu (for testing)")
  enableTapToShow: boolean = true

  @input
  @hint("Enable tap to exit ping connections (for testing)")
  enableTapToExitPing: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("HandMenuTester", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    if (!this.enableTapToShow && !this.enableTapToExitPing) {
      this.logger.info("All tap testing disabled")
      return
    }

    if (this.enableTapToShow && !this.handMenu) {
      this.logger.warn("No HandMenu component assigned for tap to show")
      return
    }

    if (this.enableTapToExitPing && !this.pingMenu) {
      this.logger.warn("No PingMenu component assigned for tap to exit ping")
      return
    }

    this.createEvent("TapEvent").bind((eventData) => {
      this.onTapEvent(eventData)
    })

    if (this.enableTapToShow) {
      this.logger.info("Tap to show/hide hand menu enabled")
    }

    if (this.enableTapToExitPing) {
      this.logger.info("Tap to exit ping connections enabled")
    }

    this.logger.info("Tap anywhere on screen to trigger enabled actions")
  }

  private onTapEvent(eventData: any): void {
    if (this.enableTapToExitPing && this.pingMenu) {
      this.exitAllPingConnections()
    }

    if (this.enableTapToShow && this.handMenu) {
      this.toggleHandMenuVisibility()
    }

    this.logger.info("Tap detected - executed enabled actions")
  }

  private toggleHandMenuVisibility(): void {
    if (!this.handMenu) {
      return
    }

    const isCurrentlyEnabled = this.handMenu.sceneObject.enabled

    if (isCurrentlyEnabled) {
      this.handMenu.sceneObject.enabled = false
      this.logger.info("Hand menu hidden via tap")
    } else {
      this.handMenu.sceneObject.enabled = true
      this.logger.info("Hand menu shown via tap")
    }
  }

  private exitAllPingConnections(): void {
    if (!this.pingMenu) {
      return
    }

    const activeConnections = this.pingMenu.getActivePingConnections()

    if (activeConnections.length === 0) {
      this.logger.info("No active ping connections to exit")
      return
    }

    activeConnections.forEach((userId) => {
      this.pingMenu.exitPingConnection(userId)
    })

    this.logger.info(`Exited ${activeConnections.length} ping connection(s) via tap`)
  }

  /**
   * Public method to manually show the hand menu
   */
  public showHandMenu(): void {
    if (this.handMenu) {
      this.handMenu.sceneObject.enabled = true
      this.logger.info("Hand menu shown via script call")
    }
  }

  /**
   * Public method to manually hide the hand menu
   */
  public hideHandMenu(): void {
    if (this.handMenu) {
      this.handMenu.sceneObject.enabled = false
      this.logger.info("Hand menu hidden via script call")
    }
  }

  /**
   * Toggle the hand menu state
   */
  public toggleHandMenu(): void {
    if (this.handMenu) {
      const isCurrentlyEnabled = this.handMenu.sceneObject.enabled
      this.handMenu.sceneObject.enabled = !isCurrentlyEnabled
      this.logger.info(`Hand menu ${!isCurrentlyEnabled ? "shown" : "hidden"} via toggle`)
    }
  }
}
