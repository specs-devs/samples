/**
 * SPECS Inc. 2027
 * Defines Controller, Player for the Tic Tac Toe lens.
 */
import {InstantiationOptions, Instantiator} from "SyncKit.lspkg/Components/Instantiator"
import {NetworkRootInfo} from "SyncKit.lspkg/Core/NetworkRootInfo"
import {SessionController} from "SyncKit.lspkg/Core/SessionController"
import {SyncEntity} from "SyncKit.lspkg/Core/SyncEntity"
import {BaseButton} from "UIKit.lspkg/Scripts/Components/Button/BaseButton"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {COLS, GRID_SPACING, GRID_X_OFFSET, GRID_Z_OFFSET, LAYERS, MAX_TURNS, ROWS, SNAP_DISTANCE} from "./constants"
import {GameManager} from "./GameManager"
import {GridPosition} from "./GridPosition"
import {Piece} from "./Piece"
import {GridPointCoordinate, SpatialGrid} from "./SpatialGrid"
import {SyncEntityGrid} from "./SyncEntityGrid"

export const PLAYERS = ["X", "O"] as const
export type Player = (typeof PLAYERS)[number]
enum EventKeys {
  RESTART = "restart",
  PRESENCE = "presence"
}

@component
export class Controller extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Controller – Tic Tac Toe game controller</span><br/><span style="color: #94A3B8; font-size: 11px;">Manages player assignment, piece spawning, and game state sync.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Prefabs & Instantiator</span>')
  @input
  @hint("Instantiator component used to spawn synced prefabs")
  instantiator: Instantiator

  @input
  @hint("Prefab for the X player piece")
  xPrefab: ObjectPrefab

  @input
  @hint("Prefab for the O player piece")
  oPrefab: ObjectPrefab

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">UI</span>')
  @input
  @hint("Text component showing the current score")
  scoreTextSceneObj: Text

  @input
  @hint("Text component showing the game result message")
  gameResultTextSceneObj: Text

  @input
  @hint("Scene object for the winner announcement panel")
  winnerPanelSceneObj: SceneObject

  @input
  @hint("Button that triggers a game restart")
  restartButton: BaseButton

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Audio & Scene</span>')
  @input
  @hint("Audio component played when a piece snaps to the grid")
  gridSnapAudio: AudioComponent

  @input
  @hint("Scene object containing the grid snap point children")
  gridSceneObj: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  isGameOver: boolean = false
  private player: Player | null = null
  private syncEntity: SyncEntity
  private instantiatedNetworkObjects: SceneObject[] = []
  gameManager: GameManager
  private spatialGrid: SpatialGrid = new SpatialGrid()
  private gameGrid = new SyncEntityGrid(LAYERS, ROWS, COLS)

  // Presence handshake — phantom-immune peer discovery. SessionController.getUsers()
  // returns phantom entries in two-pane mock preview (see SyncKit pitfalls §10), so
  // real peers are counted by the connectionIds that actually broadcast a PRESENCE event.
  private readonly presenceConns = new Set<string>()
  private presenceBroadcasted = false
  private gameStarted = false
  private isSolo = false

  private setScoreText(xScore: number, oScore: number): void {
    this.scoreTextSceneObj.text = `X: ${xScore}
        O: ${oScore}`
  }

  private getPieceComponent(obj: SceneObject) {
    return obj.getComponent(Piece.getTypeName())
  }

  /**
   * Attach the object to a snapping point
   * @param {SceneObject} objectToSnap
   * @returns { boolean } true if the object was attached to a snapping point, false otherwise
   */
  private attachObjectToSnappingPoint(objectToSnap: SceneObject) {
    if (!this.spatialGrid) return false

    const closestPoint = this.spatialGrid.findClosestPoint(
      objectToSnap.getTransform().getWorldPosition(),
      SNAP_DISTANCE
    )

    if (!closestPoint) return false
    const isEmpty =
      this.gameGrid.getValueAtPosition(closestPoint.layer, closestPoint.row, closestPoint.col) ===
      this.gameGrid.EMPTY_SPACE

    if (closestPoint && isEmpty && this.player) {
      this.gameGrid.setPositionOnSyncGrid(closestPoint.layer, closestPoint.row, closestPoint.col, this.player)
      const pieceComponent = this.getPieceComponent(objectToSnap)
      pieceComponent.position = {layer: closestPoint.layer, row: closestPoint.row, col: closestPoint.col}
      pieceComponent.smoothSnapToPosition(closestPoint.coords)
      this.gridSnapAudio.play(1)
      return true
    }
    return false
  }

  public sendRestartEvent() {
    this.syncEntity.sendEvent(EventKeys.RESTART)
  }

  private restart() {
    this.gameManager.restartGame()
    this.gameGrid.resetGrid()
    // Destroy all instantiated network objects, reset scene for both players
    this.instantiatedNetworkObjects.forEach((object) => {
      object.destroy()
    })
    this.instantiatedNetworkObjects = []
    this.winnerPanelSceneObj.enabled = false
    this.setupGrid()
    // Player X re-spawns the first piece to start the next game
    if (this.player === "X") {
      this.instantiator.notifyOnReady(() => this.spawnPlayerPrefab(this.xPrefab))
    }
  }

  private getGridPositionComponent(obj: SceneObject) {
    return obj.getComponent(GridPosition.getTypeName())
  }

  // Build the local snapping grid (enable dots + spatial lookup). Pure local scene
  // setup — independent of role or peers — so every pane shows the board immediately
  // on session-ready: the first joiner before an opponent arrives, and late-joining
  // spectators that missed the original start signal. Idempotent.
  private setupGrid() {
    if (this.spatialGrid.grid.size !== 0) return
    this.gridSceneObj.children.forEach((child) => {
      child.enabled = true
      const {layer, row, col} = this.getGridPositionComponent(child).getCoordinates()
      const position = this.getGridPositionComponent(child).getPosition()
      this.spatialGrid.addPoint(position, layer, row, col)
    })
  }

  spawnPlayerPrefab(prefab: ObjectPrefab, side: Player | null = this.player) {
    if (this.instantiator.isReady()) {
      // Spawn piece using the Sync Framework instantiator, set local start position
      const xPosition = new vec3(GRID_X_OFFSET, 0, -GRID_Z_OFFSET)
      const oPosition = new vec3(GRID_X_OFFSET, 0, -GRID_Z_OFFSET - GRID_SPACING * LAYERS)
      this.spawnSyncPrefab(prefab, side === "X" ? xPosition : oPosition, (networkRootInfo) => {
        this.instantiatedNetworkObjects.push(networkRootInfo.instantiatedObject)
      })
    }
  }

  spawnSyncPrefab(
    prefab: ObjectPrefab,
    position: vec3,
    onRenderedCallback: (networkRootInfo: NetworkRootInfo) => void
  ) {
    const options = new InstantiationOptions()
    options.localPosition = position
    this.instantiator.instantiate(prefab, options, (networkRootInfo) => {
      onRenderedCallback(networkRootInfo)
    })
  }

  // External hook for completed manipulation of a piece
  public onPieceUpdated(object: SceneObject, onSuccessCallback?: () => void) {
    const wasAttachingSuccessful = this.attachObjectToSnappingPoint(object)
    if (wasAttachingSuccessful) {
      onSuccessCallback?.()
    }
  }

  private setupSyncEntity() {
    this.syncEntity = new SyncEntity(this)

    // Networked events
    this.syncEntity.onEventReceived.add(EventKeys.RESTART, () => this.restart())
    this.syncEntity.onEventReceived.add(EventKeys.PRESENCE, (msg: {data?: {connId?: string}}) =>
      this.onPresenceReceived(msg)
    )
    // Use storage property to keep track of turns, used to figure out whose turn it is
    this.syncEntity.addStorageProperty(this.gameGrid.storageProperty)
    this.syncEntity.notifyOnReady(() => this.onReady())
  }

  onWinnerSet(winner: Player, winningLine: GridPointCoordinate[]) {
    this.gameResultTextSceneObj.text = winner + " won!"
    this.winnerPanelSceneObj.enabled = true
    if (this.player === null) {
      this.restartButton.enabled = false
    }
    winningLine.forEach((coordinate, index) => {
      const object = this.instantiatedNetworkObjects.find((object) => {
        const position = this.getPieceComponent(object).position
        return position.layer === coordinate.layer && position.row === coordinate.row && position.col === coordinate.col
      })
      if (object) {
        this.getPieceComponent(object).playWinnerAnimation(index * 500)
      }
    })
  }

  onTieSet() {
    this.gameResultTextSceneObj.text = "It's a tie!"
    this.winnerPanelSceneObj.enabled = true
  }

  onNewTurn(newCount: number) {
    // Check whose turn it is and spawn their piece
    if (this.isSolo) {
      this.spawnPlayerPrefab(newCount % 2 === 0 ? this.xPrefab : this.oPrefab, newCount % 2 === 0 ? "X" : "O")
      return
    }
    if (newCount % 2 === 0 && this.player === "X") {
      this.spawnPlayerPrefab(this.xPrefab)
    } else if (newCount % 2 === 1 && this.player === "O") {
      this.spawnPlayerPrefab(this.oPrefab)
    }
  }

  private onReady() {
    // Local scene setup (grid dots + spatial lookup) — independent of role/peers.
    this.setupGrid()

    // Presence handshake: register self, announce to peers, then try to start.
    // This replaces the old getUsers().length count, which is unreliable in
    // two-pane mock preview — phantom entries inflate the count and mis-assign
    // every player (see SyncKit pitfalls §10).
    const myConn = SessionController.getInstance().getLocalConnectionId()
    if (myConn) this.presenceConns.add(myConn)
    this.broadcastPresence()

    this.tryStartGame()
  }

  private broadcastPresence() {
    const myConn = SessionController.getInstance().getLocalConnectionId()
    if (!myConn) return
    this.syncEntity.sendEvent(EventKeys.PRESENCE, {connId: myConn})
    this.presenceBroadcasted = true
  }

  private onPresenceReceived(msg: {data?: {connId?: string}}) {
    const connId = msg.data?.connId
    if (!connId || this.presenceConns.has(connId)) return
    this.presenceConns.add(connId)
    // Re-announce so a peer that joined after our first broadcast learns our id
    // (sendEvent is not replayed for late joiners).
    if (this.presenceBroadcasted) this.broadcastPresence()
    this.tryStartGame()
  }

  // Resolve this pane's role from the sorted set of REAL connection ids:
  // smallest id -> "X", next -> "O", any further joiner -> spectator (null).
  // Deterministic and identical on every pane, so exactly one X and one O.
  private resolveLocalPlayer(): Player | null {
    const myConn = SessionController.getInstance().getLocalConnectionId()
    if (!myConn) return null
    const sorted = Array.from(this.presenceConns)
      .filter((c) => !!c)
      .sort((a, b) => a.localeCompare(b))
    const idx = sorted.indexOf(myConn)
    return idx === 0 ? "X" : idx === 1 ? "O" : null
  }

  // Assign role + start the game exactly once, after a real opponent is present.
  // Waiting for two presence ids guarantees the role is final (no X->O flip as
  // the second id arrives) before we create the GameManager or spawn a piece.
  // Solo (Sync Kit single player): there is no opponent, so start right away and
  // play both sides from this pane.
  private tryStartGame() {
    if (this.gameStarted) return
    this.isSolo = SessionController.getInstance().isSingleplayer()
    if (!this.isSolo && this.presenceConns.size < 2) return // wait for an opponent
    this.gameStarted = true

    this.player = this.isSolo ? "X" : this.resolveLocalPlayer()

    this.gameManager = new GameManager(this.player, MAX_TURNS, this.gameGrid, {
      onWinnerSet: (winner: Player, winningLine: GridPointCoordinate[]) => this.onWinnerSet(winner, winningLine),
      onTieSet: () => this.onTieSet(),
      onNewTurn: (newCount: number) => this.onNewTurn(newCount)
    }, this.isSolo)

    this.syncEntity.addStorageProperty(this.gameManager.xScoreStorageProp)
    this.syncEntity.addStorageProperty(this.gameManager.oScoreStorageProp)

    this.gameManager.xScoreStorageProp.onAnyChange.add((xScore: number) =>
      this.setScoreText(xScore, this.gameManager.oScoreStorageProp.currentValue)
    )
    this.gameManager.oScoreStorageProp.onAnyChange.add((oScore: number) =>
      this.setScoreText(this.gameManager.xScoreStorageProp.currentValue, oScore)
    )

    // X kicks off the game by spawning the first piece.
    if (this.player === "X") {
      this.instantiator.notifyOnReady(() => this.spawnPlayerPrefab(this.xPrefab))
    }
  }

  onAwake() {
    this.logger = new Logger("Controller", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.setupSyncEntity()
    this.restartButton.onTriggerDown.add(() => this.sendRestartEvent())
  }
}
