/**
 * Specs Inc. 2026
 * Tracks left/right player connection IDs and notifies subscribers on slot changes in the Air Hockey lens.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class PlayerSlotManager extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PlayerSlotManager – Player slot tracking for paddle and bitmoji assignment</span><br/><span style="color: #94A3B8; font-size: 11px;">Tracks connection IDs locally; ownership is synced via paddle SyncEntities.</span>')
  @ui.separator

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private leftPlayerId: string | null = null
  private rightPlayerId: string | null = null
  private onSlotChangeCallbacks: Array<(leftPlayerId: string | null, rightPlayerId: string | null) => void> = []

  onAwake(): void {
    this.logger = new Logger("PlayerSlotManager", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  setLeftPlayer(connectionId: string): void {
    if (this.leftPlayerId !== connectionId) {
      this.leftPlayerId = connectionId
      this.logger.debug(`Left player set: ${connectionId}`)
      this.notifySlotChange()
    }
  }

  setRightPlayer(connectionId: string): void {
    if (this.rightPlayerId !== connectionId) {
      this.rightPlayerId = connectionId
      this.logger.debug(`Right player set: ${connectionId}`)
      this.notifySlotChange()
    }
  }

  clearLeftPlayer(): void {
    if (this.leftPlayerId !== null) {
      this.leftPlayerId = null
      this.logger.debug("Left player cleared")
      this.notifySlotChange()
    }
  }

  clearRightPlayer(): void {
    if (this.rightPlayerId !== null) {
      this.rightPlayerId = null
      this.logger.debug("Right player cleared")
      this.notifySlotChange()
    }
  }

  getLeftPlayer(): string | null {
    return this.leftPlayerId
  }

  getRightPlayer(): string | null {
    return this.rightPlayerId
  }

  onSlotChange(callback: (leftPlayerId: string | null, rightPlayerId: string | null) => void): void {
    this.onSlotChangeCallbacks.push(callback)
    callback(this.leftPlayerId, this.rightPlayerId)
  }

  private notifySlotChange(): void {
    for (const callback of this.onSlotChangeCallbacks) {
      callback(this.leftPlayerId, this.rightPlayerId)
    }
  }
}
