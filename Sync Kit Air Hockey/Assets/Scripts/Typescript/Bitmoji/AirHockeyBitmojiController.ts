/**
 * Specs Inc. 2026
 * Manages per-player bitmoji avatars with inverse kinematics arm and neck tracking for the Air Hockey lens.
 */
import {bindUpdateEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {SessionController} from "SpectaclesSyncKit.lspkg/Core/SessionController"
import {Bitmoji3D} from "Bitmoji 3D.lsc/Bitmoji 3D.lsc/Bitmoji 3D"
import {PlayerSlotManager} from "../GameLogic/PlayerSlotManager"
import {ArmIK} from "./IK/ArmIK"
import {
  getBitmojiJoints,
  createPlayerBitmoji,
  PlayerBitmoji,
  BitmojiJoints
} from "./BitmojiUtils"
import {NeckTorsoIK} from "./IK/NeckTorsoIK"
import * as BitmojiConstants from "./BitmojiConstants"
import {BITMOJI_SCALE, POLE_SCALE_DIVISOR} from "./BitmojiConstants"

@component
export class AirHockeyBitmojiController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">AirHockeyBitmojiController – Per-player bitmoji avatars with IK arm tracking</span><br/><span style="color: #94A3B8; font-size: 11px;">Downloads and animates bitmoji avatars for both players using FABRIK inverse kinematics.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Bitmoji3D component for left player")
  leftBitmoji: Bitmoji3D

  @input
  @hint("Bitmoji3D component for right player")
  rightBitmoji: Bitmoji3D

  @input
  @hint("PlayerSlotManager component for tracking player connection IDs")
  playerSlotManager: PlayerSlotManager

  @input
  @hint("Parent SceneObject for the left player avatar hierarchy")
  leftPlayerAvatarParent: SceneObject

  @input
  @hint("Parent SceneObject for the right player avatar hierarchy")
  rightPlayerAvatarParent: SceneObject

  @input
  @hint("Left player paddle SceneObject used as IK arm target")
  leftPaddle: SceneObject

  @input
  @hint("Right player paddle SceneObject used as IK arm target")
  rightPaddle: SceneObject

  @input
  @hint("Target for left player rest arm (e.g. table edge)")
  leftPlayerRestTarget: SceneObject

  @input
  @hint("Target for right player rest arm (e.g. table edge)")
  rightPlayerRestTarget: SceneObject

  @input
  @hint("Puck object to track with neck rotation (leave empty to disable)")
  puck: SceneObject | null = null

  @input
  @hint("Enable neck tracking to follow the puck")
  enableNeckTracking: boolean = true

  @input
  @hint("Enable FABRIK arm IK solving")
  enableIK: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private readonly paddleVerticalOffset: number = BitmojiConstants.PADDLE_VERTICAL_OFFSET
  private readonly paddleHorizontalOffset: number = BitmojiConstants.PADDLE_HORIZONTAL_OFFSET
  private readonly paddleDepthOffset: number = BitmojiConstants.PADDLE_DEPTH_OFFSET
  private readonly restingArmVerticalOffset: number = BitmojiConstants.RESTING_ARM_VERTICAL_OFFSET
  private readonly restingArmHorizontalOffset: number = BitmojiConstants.RESTING_ARM_HORIZONTAL_OFFSET
  private readonly restingArmDepthOffset: number = BitmojiConstants.RESTING_ARM_DEPTH_OFFSET
  private readonly armResponsiveness: number = BitmojiConstants.ARM_RESPONSIVENESS

  private get poleOffsetMultiplier(): number { return BITMOJI_SCALE / POLE_SCALE_DIVISOR }

  private isGameStarted: boolean = false
  private pendingDownloads: number = 0
  private loadingConnectionId: { left: string | null; right: string | null } = { left: null, right: null }
  private readonly sessionController: SessionController = SessionController.getInstance()

  private readonly leftPlayer: PlayerBitmoji = createPlayerBitmoji()
  private readonly rightPlayer: PlayerBitmoji = createPlayerBitmoji()

  public setGameStarted(isStarted: boolean): void {
    this.isGameStarted = isStarted
    this.logger?.debug(`Game started state: ${isStarted}`)
  }

  onPlayerJoinedLeft(connectionId: string): void {
    this.leftPlayer.connectionId = connectionId
    this.loadLeftPlayerBitmoji(connectionId)
  }

  onPlayerJoinedRight(connectionId: string): void {
    this.rightPlayer.connectionId = connectionId
    this.loadRightPlayerBitmoji(connectionId)
  }

  onPlayerLeftSide(connectionId: string): void {
    if (connectionId === this.leftPlayer.connectionId) {
      this.cleanupPlayer(this.leftPlayer)
    } else if (connectionId === this.rightPlayer.connectionId) {
      this.cleanupPlayer(this.rightPlayer)
    }
  }

  private onSlotUpdate(leftPlayerId: string | null, rightPlayerId: string | null): void {
    this.handlePlayerSlotChange(leftPlayerId, this.leftPlayer, (id) => this.onPlayerJoinedLeft(id))
    this.handlePlayerSlotChange(rightPlayerId, this.rightPlayer, (id) => this.onPlayerJoinedRight(id))
  }

  private handlePlayerSlotChange(
    newPlayerId: string | null,
    currentPlayer: PlayerBitmoji,
    onJoined: (id: string) => void
  ): void {
    if (newPlayerId && newPlayerId !== currentPlayer.connectionId) {
      onJoined(newPlayerId)
    } else if (!newPlayerId && currentPlayer.connectionId) {
      this.onPlayerLeftSide(currentPlayer.connectionId)
    }
  }

  public async loadLeftPlayerBitmoji(connectionId: string): Promise<void> {
    await this.loadPlayerBitmoji(connectionId, "left")
  }

  public async loadRightPlayerBitmoji(connectionId: string): Promise<void> {
    await this.loadPlayerBitmoji(connectionId, "right")
  }

  private async loadPlayerBitmoji(connectionId: string, playerSide: "left" | "right"): Promise<void> {
    if (this.loadingConnectionId[playerSide] === connectionId) {
      this.logger.debug(`Already loading bitmoji for ${playerSide} (${connectionId}), skipping`)
      return
    }

    const player = this.getPlayer(playerSide)
    if (player.connectionId === connectionId && player.bitmoji && !isNull(player.bitmoji)) {
      this.logger.debug(`Bitmoji already loaded for ${playerSide} (${connectionId}), skipping`)
      return
    }

    const paddle = playerSide === "left" ? this.leftPaddle : this.rightPaddle
    const restTarget = playerSide === "left" ? this.leftPlayerRestTarget : this.rightPlayerRestTarget
    const bitmoji3D = playerSide === "left" ? this.leftBitmoji : this.rightBitmoji
    const avatarParent = playerSide === "left" ? this.leftPlayerAvatarParent : this.rightPlayerAvatarParent

    if (!bitmoji3D) {
      this.logger.error(`No Bitmoji3D component assigned for ${playerSide} player`)
      return
    }

    this.loadingConnectionId[playerSide] = connectionId
    this.cleanupPlayer(player)

    if (avatarParent) avatarParent.enabled = true
    const existingPlaceholder = bitmoji3D.getAvatar()
    if (existingPlaceholder && !isNull(existingPlaceholder)) {
      existingPlaceholder.enabled = false
    }

    this.pendingDownloads++
    this.updateStatusText()

    try {
      const isMixamoEnabled = bitmoji3D.mixamoAnimation === true
      if (isMixamoEnabled) {
        this.logger.error(`Adapt to Mixamo is enabled on ${playerSide} Bitmoji 3D component.`)
        return
      }

      const user = await this.getSnapchatUser(connectionId)

      if (this.loadingConnectionId[playerSide] !== connectionId) {
        this.logger.debug(`Load for ${playerSide} superseded, aborting`)
        return
      }

      await bitmoji3D.downloadAvatarForUser(user)

      if (this.loadingConnectionId[playerSide] !== connectionId) {
        this.logger.debug(`Load for ${playerSide} superseded after download, aborting`)
        return
      }

      const bitmoji = bitmoji3D.getAvatar()
      if (!bitmoji || isNull(bitmoji)) {
        this.logger.error(`Failed to get avatar for ${playerSide} player after download`)
        return
      }

      bitmoji.enabled = true
      player.bitmoji = bitmoji

      bitmoji.getTransform().setLocalPosition(vec3.zero())
      bitmoji.getTransform().setLocalRotation(quat.quatIdentity())
      bitmoji.getTransform().setLocalScale(new vec3(BITMOJI_SCALE, BITMOJI_SCALE, BITMOJI_SCALE))

      const joints = getBitmojiJoints(bitmoji)
      this.setupArmIK(bitmoji, joints, paddle, playerSide, true)
      this.setupArmIK(bitmoji, joints, restTarget, playerSide, false)

      if (this.enableNeckTracking && this.puck) {
        this.setupNeckTracking(bitmoji, joints, playerSide)
      }

      this.logger.info(`Bitmoji loaded for ${playerSide} player (${connectionId})`)
    } catch (e) {
      this.logger.error(`Failed to load bitmoji for ${playerSide} player: ${e}`)
      this.updateStatusText()
    } finally {
      if (this.loadingConnectionId[playerSide] === connectionId) {
        this.loadingConnectionId[playerSide] = null
      }
      this.pendingDownloads = Math.max(0, this.pendingDownloads - 1)
      this.updateStatusText()
    }
  }

  private getSnapchatUser(connectionId: string): Promise<SnapchatUser> {
    return new Promise<SnapchatUser>((resolve, reject) => {
      const session = this.sessionController.getSession()
      const matchingUserInfo = session.activeUsersInfo.find(
        (userInfo) => !isNull(userInfo) && userInfo.connectionId === connectionId
      )

      if (matchingUserInfo) {
        session.getSnapchatUser(matchingUserInfo, (snapchatUser: SnapchatUser) => {
          if (snapchatUser) {
            resolve(snapchatUser)
          } else {
            reject(`Failed to get SnapchatUser for ${connectionId}`)
          }
        })
      } else {
        reject(`User ${connectionId} not found in active users`)
      }
    })
  }

  private cleanupPlayer(player: PlayerBitmoji): void {
    if (player.bitmoji && !isNull(player.bitmoji)) {
      player.bitmoji.destroy()
    }
    player.bitmoji = null
    player.connectionId = null
    player.armIK = null
    player.restingArmIK = null
    player.neckTorsoIK = null
  }

  private createIKHelperObjects(): void {
    this.createPlayerIKObjects(this.leftPlayer, this.leftPlayerAvatarParent, "Left")
    this.createPlayerIKObjects(this.rightPlayer, this.rightPlayerAvatarParent, "Right")
  }

  private createPlayerIKObjects(player: PlayerBitmoji, parent: SceneObject, side: string): void {
    player.poleObject = this.createAndParent(`${side}ArmPole`, parent)
    player.targetObject = this.createAndParent(`${side}ArmTarget`, parent)
    player.restPoleObject = this.createAndParent(`${side}RestPole`, parent)
    player.restTargetObject = this.createAndParent(`${side}RestTarget`, parent)

    const activePole = new vec3(
      BitmojiConstants.ACTIVE_ARM_POLE_BASE.x,
      BitmojiConstants.ACTIVE_ARM_POLE_BASE.y,
      BitmojiConstants.ACTIVE_ARM_POLE_BASE.z
    ).uniformScale(this.poleOffsetMultiplier)
    const restingPole = new vec3(
      BitmojiConstants.RESTING_ARM_POLE_BASE.x,
      BitmojiConstants.RESTING_ARM_POLE_BASE.y,
      BitmojiConstants.RESTING_ARM_POLE_BASE.z
    ).uniformScale(this.poleOffsetMultiplier)

    player.poleObject.getTransform().setLocalPosition(activePole)
    player.restPoleObject.getTransform().setLocalPosition(restingPole)
  }

  private setupArmIK(
    bitmoji: SceneObject,
    bitmojiJoints: BitmojiJoints,
    target: SceneObject,
    playerSide: "left" | "right",
    isActiveArm: boolean
  ): void {
    if (!target || !this.enableIK) return

    const joints = isActiveArm ? bitmojiJoints.rightArm : bitmojiJoints.leftArm
    const armType: "left" | "right" = isActiveArm ? "right" : "left"

    if (!joints.shoulder || !joints.elbow || !joints.wrist) {
      this.logger.warn(`Could not find ${armType} arm joints`)
      return
    }

    const poleObj = this.getHelperObject(playerSide, isActiveArm, true)
    const targetObj = this.getHelperObject(playerSide, isActiveArm, false)

    if (!isActiveArm) {
      this.positionRestingArmTarget(bitmoji, target, targetObj)
    }

    const armIK = new ArmIK(
      bitmoji,
      joints.shoulder,
      joints.elbow,
      joints.wrist,
      poleObj,
      targetObj,
      armType,
      this.armResponsiveness
    )

    this.assignArmIK(playerSide, isActiveArm, armIK)
  }

  private setupNeckTracking(bitmoji: SceneObject, bitmojiJoints: BitmojiJoints, playerSide: "left" | "right"): void {
    if (!this.puck) return

    const neckJoint = bitmojiJoints.neck
    if (!neckJoint) return

    const torsoJoint = bitmojiJoints.torso

    const shoulderTransforms = [
      bitmojiJoints.leftArm.shoulder?.transform,
      bitmojiJoints.rightArm.shoulder?.transform
    ].filter(t => t !== null && t !== undefined)

    this.getPlayer(playerSide).neckTorsoIK = new NeckTorsoIK(
      neckJoint.getTransform(),
      this.puck.getTransform(),
      bitmoji.getTransform(),
      torsoJoint?.getTransform() ?? null,
      shoulderTransforms
    )
  }

  @bindUpdateEvent
  private onUpdate(): void {
    if (this.enableIK) {
      if (this.leftPaddle && this.leftPlayer.bitmoji && !isNull(this.leftPlayer.bitmoji)) {
        this.updateArmIK(this.leftPlayer, this.leftPaddle)
        this.leftPlayer.restingArmIK?.update()
      }
      if (this.rightPaddle && this.rightPlayer.bitmoji && !isNull(this.rightPlayer.bitmoji)) {
        this.updateArmIK(this.rightPlayer, this.rightPaddle)
        this.rightPlayer.restingArmIK?.update()
      }
    }

    if (this.enableNeckTracking && this.puck) {
      if (this.leftPlayer.bitmoji && !isNull(this.leftPlayer.bitmoji)) {
        this.leftPlayer.neckTorsoIK?.update()
      }
      if (this.rightPlayer.bitmoji && !isNull(this.rightPlayer.bitmoji)) {
        this.rightPlayer.neckTorsoIK?.update()
      }
    }
  }

  private updateArmIK(player: PlayerBitmoji, paddle: SceneObject): void {
    if (!player.bitmoji || isNull(player.bitmoji) || !player.armIK) return

    const paddleWorldPos = paddle.getTransform().getWorldPosition()

    let targetPos = paddleWorldPos
    if (this.paddleHorizontalOffset !== 0 || this.paddleVerticalOffset !== 0 || this.paddleDepthOffset !== 0) {
      const bitmojiTransform = player.bitmoji.getTransform()
      const worldOffset = bitmojiTransform.getWorldRotation().multiplyVec3(
        new vec3(this.paddleHorizontalOffset, this.paddleVerticalOffset, this.paddleDepthOffset)
      )
      targetPos = paddleWorldPos.add(worldOffset)
    }

    player.targetObject.getTransform().setWorldPosition(targetPos)
    player.armIK.update()
  }

  private positionRestingArmTarget(
    bitmoji: SceneObject,
    target: SceneObject,
    targetObj: SceneObject
  ): void {
    const targetWorldPos = target.getTransform().getWorldPosition()
    const bitmojiTransform = bitmoji.getTransform()

    const localOffset = new vec3(
      -this.restingArmHorizontalOffset,
      this.restingArmVerticalOffset,
      this.restingArmDepthOffset
    )

    const worldOffset = bitmojiTransform.getWorldRotation().multiplyVec3(localOffset)
    const offsetPos = targetWorldPos.add(worldOffset)
    targetObj.getTransform().setWorldPosition(offsetPos)
  }

  private assignArmIK(playerSide: "left" | "right", isActiveArm: boolean, armIK: ArmIK): void {
    const player = this.getPlayer(playerSide)

    if (isActiveArm) {
      player.armIK = armIK
    } else {
      player.restingArmIK = armIK
      for (let i = 0; i < BitmojiConstants.RESTING_ARM_PRESOLVE_ITERATIONS; i++) {
        armIK.update()
      }
    }
  }

  private updateStatusText(): void {
    if (this.pendingDownloads > 0) {
      this.logger.debug(`Loading avatar${this.pendingDownloads > 1 ? "s" : ""}...`)
    }
  }

  private getPlayer(playerSide: "left" | "right"): PlayerBitmoji {
    return playerSide === "left" ? this.leftPlayer : this.rightPlayer
  }

  private getHelperObject(playerSide: "left" | "right", isActiveArm: boolean, isPole: boolean): SceneObject {
    const player = this.getPlayer(playerSide)
    if (isActiveArm) {
      return isPole ? player.poleObject : player.targetObject
    } else {
      return isPole ? player.restPoleObject : player.restTargetObject
    }
  }

  private createAndParent(name: string, parent: SceneObject): SceneObject {
    const obj = global.scene.createSceneObject(name)
    obj.setParent(parent)
    return obj
  }

  onAwake(): void {
    this.logger = new Logger("AirHockeyBitmojiController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.createIKHelperObjects()

    this.sessionController.notifyOnReady(() => {
      if (this.playerSlotManager) {
        this.playerSlotManager.onSlotChange((leftPlayerId: string | null, rightPlayerId: string | null) => {
          this.onSlotUpdate(leftPlayerId, rightPlayerId)
        })
      }
    })
  }
}
