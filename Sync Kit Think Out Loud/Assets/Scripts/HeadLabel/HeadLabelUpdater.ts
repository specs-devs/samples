/**
 * Specs Inc. 2026
 * Head Label Updater component for the Think Out Loud Spectacles lens.
 */
import { HeadLabelObjectManager } from "./HeadLabelObjectManager"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"

/**
 * Bridge that connects local hand menu UI to synced head label data.
 * Provides a clean interface for hand menu to update the local player's head label,
 * which then syncs across all players via StorageProperties.
 */
@component
export class HeadLabelUpdater extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">HeadLabelUpdater – bridge between hand menu and the local player\'s head label data</span><br/><span style="color: #94A3B8; font-size: 11px;">Singleton; provides a clean API for HandMenuController to update status via HeadLabelObjectManager.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Reference to the head label object manager")
  headLabelObjectManager: HeadLabelObjectManager

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private static instance: HeadLabelUpdater

  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("HeadLabelUpdater", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    if (HeadLabelUpdater.instance) {
      this.logger.warn("Multiple instances detected! Using first instance.")
      return
    }

    HeadLabelUpdater.instance = this
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.logger.info("Initialized successfully")

    if (!this.headLabelObjectManager) {
      this.logger.warn("Missing HeadLabelObjectManager reference")
    } else {
      this.logger.info("HeadLabelObjectManager connected")
    }
  }

  /**
   * Get the singleton instance of HeadLabelUpdater
   */
  public static getInstance(): HeadLabelUpdater | null {
    return HeadLabelUpdater.instance || null
  }

  /**
   * Update the local player's head label status (called from hand menu)
   */
  public updateMyHeadLabelStatus(statusText: string, subStatus: string): void {
    if (!this.headLabelObjectManager) {
      this.logger.warn("Cannot update status - HeadLabelObjectManager not available")
      return
    }

    this.logger.info(`Updating local player status - "${statusText}" / "${subStatus}"`)
    this.headLabelObjectManager.updateMyStatus(statusText, subStatus)
  }

  /**
   * Update the local player's availability state (called from hand menu)
   */
  public updateMyHeadLabelAvailability(availabilityState: number): void {
    if (!this.headLabelObjectManager) {
      this.logger.warn("Cannot update availability - HeadLabelObjectManager not available")
      return
    }

    this.logger.info("Updating local player availability to " + availabilityState)
    this.headLabelObjectManager.updateMyAvailability(availabilityState)
  }

  /**
   * Get the local player's current head label data
   */
  public getMyHeadLabelData(): { statusText: string; subStatus: string; availability: number } | null {
    if (!this.headLabelObjectManager) {
      return null
    }

    const myHeadLabel = this.headLabelObjectManager.getMyHeadLabel()
    if (!myHeadLabel) {
      return null
    }

    return {
      statusText: myHeadLabel.getStatusText(),
      subStatus: myHeadLabel.getSubStatusText(),
      availability: myHeadLabel.getAvailability()
    }
  }

  /**
   * Register a callback for when the local head label is ready
   */
  public onMyHeadLabelReady(callback: () => void): void {
    if (!this.headLabelObjectManager) {
      this.logger.warn("Cannot register callback - HeadLabelObjectManager not available")
      return
    }

    this.headLabelObjectManager.subscribeToHeadLabelReady(() => {
      this.logger.info("Local head label is ready")
      callback()
    })
  }

  /**
   * Check if head label system is ready
   */
  public isHeadLabelSystemReady(): boolean {
    return this.headLabelObjectManager !== null && this.headLabelObjectManager.getMyHeadLabel() !== null
  }

  /**
   * Get head label manager for advanced use cases
   */
  public getHeadLabelManager(): HeadLabelObjectManager | null {
    return this.headLabelObjectManager
  }
}
