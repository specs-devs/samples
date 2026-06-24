/**
 * Specs Inc. 2026
 * Player Object Manager handling core logic for the Think Out Loud lens.
 */
import { Instantiator } from "SpectaclesSyncKit.lspkg/Components/Instantiator"
import { SessionController } from "SpectaclesSyncKit.lspkg/Core/SessionController"
import { PlayerObjectController } from "./PlayerObjectController"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"

@component
export class PlayerObjectManager extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PlayerObjectManager – manages instantiation of the local player\'s synced object</span><br/><span style="color: #94A3B8; font-size: 11px;">Instantiates the player prefab once the session and instantiator are ready.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Instantiator component for creating synced player objects")
  instantiator: Instantiator

  @input
  @hint("Prefab to instantiate for each player's synced object")
  playerObjectPrefab: ObjectPrefab

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private myPlayerObject: PlayerObjectController

  onAwake(): void {
    this.logger = new Logger("PlayerObjectManager", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    SessionController.getInstance().notifyOnReady(() => {
      this.instantiator.notifyOnReady(() => {
        this.instantiatePlayerObject()
      })
    })
  }

  onUpdate(): void {
    this.myPlayerObject.onUpdate()
  }

  subscribe(playerObject: PlayerObjectController): void {
    this.myPlayerObject = playerObject
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  /**
   * Instantiate the player object for the local user.
   * Called when the session is ready and the instantiator is ready.
   */
  instantiatePlayerObject(): void {
    this.logger.info("Instantiating player object for " + SessionController.getInstance().getLocalUserName())
    this.instantiator.instantiate(this.playerObjectPrefab)
  }
}
