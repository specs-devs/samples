/**
 * Specs Inc. 2026
 * Central game controller managing scores, session state, paddle ownership, and player avatars for the Air Hockey lens.
 */
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {AirHockeyPaddle} from "./AirHockeyPaddleTS"
import {AirHockeyPuck} from "./AirHockeyPuckTS"
import {PlayerSlotManager} from "./PlayerSlotManager"
import {AirHockeyBitmojiController} from "../Bitmoji/AirHockeyBitmojiController"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractableManipulation} from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"
import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {SessionController} from "SpectaclesSyncKit.lspkg/Core/SessionController"
import {StorageProperty} from "SpectaclesSyncKit.lspkg/Core/StorageProperty"
import {SyncEntity} from "SpectaclesSyncKit.lspkg/Core/SyncEntity"

@component
export class AirHockeyController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">AirHockeyController – Central game session manager</span><br/><span style="color: #94A3B8; font-size: 11px;">Manages scores, paddle ownership, start/restart flow, and player avatar state.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("PlayerSlotManager component tracking left/right player connection IDs")
  playerSlotManager: PlayerSlotManager

  @input
  @hint("AirHockeyPuck component")
  puck: AirHockeyPuck

  @input
  @hint("Physics collider that covers the left goal area")
  leftGoalCollider: ColliderComponent

  @input
  @hint("Physics collider that covers the right goal area")
  rightGoalCollider: ColliderComponent

  @input
  @hint("Left player paddle component")
  leftPaddle: AirHockeyPaddle

  @input
  @hint("Interactable on the left paddle for hover-to-join")
  leftPaddleInteractable: Interactable

  @input
  @hint("InteractableManipulation on the left paddle")
  leftPaddleManipulation: InteractableManipulation

  @input
  @hint("Right player paddle component")
  rightPaddle: AirHockeyPaddle

  @input
  @hint("Interactable on the right paddle for hover-to-join")
  rightPaddleInteractable: Interactable

  @input
  @hint("InteractableManipulation on the right paddle")
  rightPaddleManipulation: InteractableManipulation

  @input
  @allowUndefined
  @hint("Button that starts or restarts the game")
  startGameButton: RectangleButton

  @input
  @allowUndefined
  @hint("Text label on the start/restart button")
  startGameButtonText: Text

  @input
  @hint("Score display text for the left player (copy 1)")
  leftScore1: Text

  @input
  @hint("Score display text for the right player (copy 1)")
  rightScore1: Text

  @input
  @hint("Score display text for the left player (copy 2)")
  leftScore2: Text

  @input
  @hint("Score display text for the right player (copy 2)")
  rightScore2: Text

  @input
  @hint("AirHockeyBitmojiController component managing player avatars")
  playerAvatarManager: AirHockeyBitmojiController

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  isLeftPlayer: boolean = false
  isRightPlayer: boolean = false
  hasInitAsOwner: boolean = false
  syncEntity: SyncEntity
  sessionController: SessionController = SessionController.getInstance()

  private isGameStartedProp = StorageProperty.manualBool("isGameStarted", false)
  private leftScoreProp = StorageProperty.manualInt("leftScore", 0)
  private rightScoreProp = StorageProperty.manualInt("rightScore", 0)

  initAsClient(): void {
    this.refreshUI()
  }

  initAsOwner(): void {
    if (this.hasInitAsOwner) return

    this.hasInitAsOwner = true

    this.leftGoalCollider.onOverlapEnter.add((e) => this.onLeftGoalOverlap(e))
    this.rightGoalCollider.onOverlapEnter.add((e) => this.onRightGoalOverlap(e))
    if (this.startGameButton?.onTriggerUp) {
      this.startGameButton.onTriggerUp.add(() => this.startGame())
    }

    this.logger.debug("Trying to claim ownership of puck")
    this.puck.syncEntity.tryClaimOwnership(() => this.refreshUI())
    this.refreshUI()
  }

  isHost(): boolean {
    return this.syncEntity.isSetupFinished && this.syncEntity.doIOwnStore()
  }

  joinLeft(): void {
    if (
      !this.isLeftPlayer &&
      !this.isRightPlayer &&
      !this.leftPaddle.syncEntity.isStoreOwned()
    ) {
      this.setupForLeftSide()
    }
  }

  joinRight(): void {
    if (
      !this.isLeftPlayer &&
      !this.isRightPlayer &&
      !this.rightPaddle.syncEntity.isStoreOwned()
    ) {
      this.setupForRightSide()
    }
  }

  refreshUI(): void {
    const isGameStarted = this.isGameStartedProp.currentOrPendingValue
    if (this.startGameButtonText) {
      this.startGameButtonText.text = isGameStarted ? "Restart" : "Start Game"
    }
    this.logger.debug(`Is host: ${this.isHost()} | Game started: ${isGameStarted}`)
  }

  setLeftScore(newScore: number, oldScore: number): void {
    this.leftScore1.text = "" + newScore
    this.leftScore2.text = "" + newScore
  }

  setRightScore(newScore: number, oldScore: number): void {
    this.rightScore1.text = "" + newScore
    this.rightScore2.text = "" + newScore
  }

  setupForLeftSide(): void {
    this.leftPaddle.syncEntity.tryClaimOwnership(() => {
      this.isLeftPlayer = true
      this.leftPaddleManipulation.setCanTranslate(true)
      this.refreshUI()
    })
  }

  setupForRightSide(): void {
    this.rightPaddle.syncEntity.tryClaimOwnership(() => {
      this.isRightPlayer = true
      this.rightPaddleManipulation.setCanTranslate(true)
      this.refreshUI()
    })
  }

  startGame(): void {
    this.logger.debug("Start/Restart button pressed")
    this.leftScoreProp.setValueImmediate(this.syncEntity.currentStore, 0)
    this.rightScoreProp.setValueImmediate(this.syncEntity.currentStore, 0)
    this.isGameStartedProp.setValueImmediate(this.syncEntity.currentStore, true)
    this.puck.resetPuck()
    this.refreshUI()
    this.logger.info("Game started/restarted")
  }

  onLeftGoalOverlap(eventArgs): void {
    const overlap = eventArgs.overlap
    if (overlap.collider.isSame(this.puck.body)) {
      this.logger.debug("Goal on left!")
      this.puck.resetPuck()
      this.rightScoreProp.setPendingValue(this.rightScoreProp.currentOrPendingValue + 1)
    }
  }

  onRightGoalOverlap(eventArgs): void {
    const overlap = eventArgs.overlap
    if (overlap.collider.isSame(this.puck.body)) {
      this.logger.debug("Goal on right!")
      this.puck.resetPuck()
      this.leftScoreProp.setPendingValue(this.leftScoreProp.currentOrPendingValue + 1)
    }
  }

  onSyncEntityReady(): void {
    this.logger.debug("Sync entity ready")

    if (this.isHost()) {
      this.initAsOwner()
    } else {
      this.initAsClient()
    }

    this.leftPaddleInteractable.onHoverEnter.add(() => this.joinLeft())
    this.rightPaddleInteractable.onHoverEnter.add(() => this.joinRight())

    this.leftPaddle.syncEntity.onOwnerUpdated.add(() => {
      if (this.leftPaddle.syncEntity.isStoreOwned()) {
        const ownerConnectionId = this.leftPaddle.syncEntity.getOwnerId()
        if (ownerConnectionId && this.playerSlotManager) {
          this.playerSlotManager.setLeftPlayer(ownerConnectionId)
        }
      } else if (this.playerSlotManager) {
        this.playerSlotManager.clearLeftPlayer()
      }
      this.refreshUI()
    })

    this.rightPaddle.syncEntity.onOwnerUpdated.add(() => {
      if (this.rightPaddle.syncEntity.isStoreOwned()) {
        const ownerConnectionId = this.rightPaddle.syncEntity.getOwnerId()
        if (ownerConnectionId && this.playerSlotManager) {
          this.playerSlotManager.setRightPlayer(ownerConnectionId)
        }
      } else if (this.playerSlotManager) {
        this.playerSlotManager.clearRightPlayer()
      }
      this.refreshUI()
    })

    this.puck.syncEntity.onOwnerUpdated.add(() => {
      this.logger.debug("Puck owner updated")
      this.refreshUI()
    })

    if (this.playerAvatarManager) {
      this.playerAvatarManager.setGameStarted(this.isGameStartedProp.currentOrPendingValue)
    }

    if (this.playerSlotManager) {
      if (this.leftPaddle.syncEntity.isStoreOwned()) {
        const leftOwnerId = this.leftPaddle.syncEntity.getOwnerId()
        if (leftOwnerId) this.playerSlotManager.setLeftPlayer(leftOwnerId)
      }
      if (this.rightPaddle.syncEntity.isStoreOwned()) {
        const rightOwnerId = this.rightPaddle.syncEntity.getOwnerId()
        if (rightOwnerId) this.playerSlotManager.setRightPlayer(rightOwnerId)
      }
    }

    this.refreshUI()
  }

  onOwnershipUpdated(): void {
    if (!this.syncEntity.isStoreOwned()) {
      this.logger.debug("Controller is not owned, trying to claim")
      this.syncEntity.tryClaimOwnership(() => this.initAsOwner())
    }
    this.refreshUI()
  }

  onSessionReady(): void {
    this.logger.debug("Session ready")

    this.leftPaddleManipulation.setCanTranslate(false)
    this.leftPaddleManipulation.setCanScale(false)
    this.leftPaddleManipulation.setCanRotate(false)

    this.rightPaddleManipulation.setCanTranslate(false)
    this.rightPaddleManipulation.setCanScale(false)
    this.rightPaddleManipulation.setCanRotate(false)

    this.syncEntity = new SyncEntity(this, null, true)
    this.syncEntity.addStorageProperty(this.isGameStartedProp)
    this.syncEntity.addStorageProperty(this.leftScoreProp)
    this.syncEntity.addStorageProperty(this.rightScoreProp)

    this.setLeftScore(this.leftScoreProp.currentValue, 0)
    this.setRightScore(this.rightScoreProp.currentValue, 0)

    this.leftScoreProp.onAnyChange.add((newScore: number, oldScore: number) =>
      this.setLeftScore(newScore, oldScore)
    )
    this.rightScoreProp.onAnyChange.add((newScore: number, oldScore: number) =>
      this.setRightScore(newScore, oldScore)
    )

    this.isGameStartedProp.onAnyChange.add(() => this.refreshUI())

    this.syncEntity.notifyOnReady(() => this.onSyncEntityReady())
    this.syncEntity.onOwnerUpdated.add(() => this.onOwnershipUpdated())
  }

  resetGame(): void {
    this.logger.debug("Resetting game due to user leaving")

    if (!this.syncEntity?.currentStore) {
      this.logger.debug("SyncEntity not ready, skipping resetGame")
      return
    }

    this.isGameStartedProp.setValueImmediate(this.syncEntity.currentStore, false)
    this.isLeftPlayer = false
    this.isRightPlayer = false

    this.leftPaddleManipulation.setCanTranslate(false)
    this.rightPaddleManipulation.setCanTranslate(false)

    const session = this.sessionController.getSession()

    if (this.leftPaddle.syncEntity.isStoreOwned()) {
      session.clearRealtimeStoreOwnership(
        this.leftPaddle.syncEntity.currentStore,
        () => this.logger.debug("Left paddle ownership cleared"),
        (error) => this.logger.error("Error clearing left paddle ownership: " + error)
      )
    }

    if (this.rightPaddle.syncEntity.isStoreOwned()) {
      session.clearRealtimeStoreOwnership(
        this.rightPaddle.syncEntity.currentStore,
        () => this.logger.debug("Right paddle ownership cleared"),
        (error) => this.logger.error("Error clearing right paddle ownership: " + error)
      )
    }

    if (!this.syncEntity.doIOwnStore()) {
      this.syncEntity.tryClaimOwnership(() => {
        this.logger.debug("Controller ownership claimed after reset")
        this.initAsOwner()
      })
    }

    if (!this.puck.syncEntity.doIOwnStore()) {
      this.puck.syncEntity.tryClaimOwnership(() => {
        this.logger.debug("Puck ownership claimed after reset")
        this.refreshUI()
      })
    }

    this.puck.stopMovement()
    this.puck.getTransform().setLocalPosition(vec3.zero())
    this.refreshUI()
  }

  @bindStartEvent
  private onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")

    this.sessionController.notifyOnReady(() => this.onSessionReady())

    this.sessionController.onUserLeftSession.add((session, userInfo) => {
      if (this.playerAvatarManager) {
        this.playerAvatarManager.onPlayerLeftSide(userInfo.connectionId)
      }

      this.resetGame()

      const delayedEvent = this.createEvent("DelayedCallbackEvent")
      delayedEvent.bind(() => this.refreshUI())
      delayedEvent.reset(0.5)
    })
  }

  onAwake(): void {
    this.logger = new Logger("AirHockeyController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }
}
