/**
 * SPECS Inc. 2027
 * Piece component for the Tic Tac Toe Glasses lens.
 */
import {InteractableOutlineFeedback} from "InteractionKit.lspkg/Components/Helpers/InteractableOutlineFeedback"
import {InteractableManipulation} from "InteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"
import {SyncTransform} from "SyncKit.lspkg/Components/SyncTransform"
import {SyncEntity} from "SyncKit.lspkg/Core/SyncEntity"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import type {Controller} from "./Controller"

// CSS cubic-bezier control points. Linear matches LSTween's default (no .easing());
// the exponential in-out preset replaces Easing.Exponential.InOut on the snap move.
const LINEAR = [0, 0, 1, 1] as const
const EXPONENTIAL_IN_OUT = [1, 0, 0, 1] as const

// Clip names for the runtime-built AnimationPlayer clips on the piece transform.
const CLIP_PULSE = "piecePulse"
const CLIP_SETTLE = "pieceSettle"
const CLIP_SNAP = "pieceSnap"
const CLIP_WINNER = "pieceWinner"

@component
export class Piece extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Piece – Tic Tac Toe game piece</span><br/><span style="color: #94A3B8; font-size: 11px;">Attached to each spawned piece prefab; handles movement, snapping, and win animation.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Controller component managing game state and piece placement")
  controller: Controller

  @input
  @hint("InteractableManipulation component for piece dragging")
  manipulatable: InteractableManipulation

  @input
  @hint("Outline feedback component shown while piece is interactable")
  interactableOutlineFeedback: InteractableOutlineFeedback

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  position: {layer: number; row: number; col: number}

  sceneObj: SceneObject
  syncEntity: SyncEntity
  isTurnFinished: boolean = false
  private player: AnimationPlayer | null = null
  syncTransform: SyncTransform

  finishTurn() {
    if (!this.isTurnFinished) {
      if (this.player && this.syncTransform.syncEntity.doIOwnStore()) {
        // stop the pulse and scale back to 1.0
        this.player.stopClip(CLIP_PULSE)
        const transform = this.manipulatable.getSceneObject().getTransform()
        this.playTransformClip(
          CLIP_SETTLE,
          AnimationPropertyLayer.TransformScale,
          transform.getLocalScale(),
          new vec3(1.0, 1.0, 1.0),
          500,
          LINEAR,
          PlaybackMode.Single
        )
      }
      this.isTurnFinished = true
      // Can't move again after I placed my piece, piece goes dormant
      this.manipulatable.setCanTranslate(false)
      this.interactableOutlineFeedback.enabled = false
    }
  }

  smoothSnapToPosition(attachedPosition: vec3) {
    if (this.syncTransform.syncEntity.doIOwnStore()) {
      const transform = this.manipulatable.getSceneObject().getTransform()
      // TransformPosition is local-space; convert the world target through the parent.
      this.playTransformClip(
        CLIP_SNAP,
        AnimationPropertyLayer.TransformPosition,
        transform.getLocalPosition(),
        this.worldToLocal(attachedPosition),
        500,
        EXPONENTIAL_IN_OUT,
        PlaybackMode.Single
      )
    }
  }

  onManipulationEnd() {
    this.controller.onPieceUpdated(this.sceneObj, this.finishTurn.bind(this))
  }

  playWinnerAnimation(delay: number) {
    const transform = this.manipulatable.getSceneObject().getTransform()
    const startScale = transform.getLocalScale()
    // delay is in milliseconds (matching the original LSTween .delay()).
    this.delayCall(delay / 1000, () => {
      this.playTransformClip(
        CLIP_WINNER,
        AnimationPropertyLayer.TransformScale,
        startScale,
        new vec3(1.5, 1.5, 1.5),
        500,
        LINEAR,
        PlaybackMode.Single
      )
    })
  }

  onReady() {
    if (this.syncEntity.networkRoot.locallyCreated) {
      this.syncTransform.syncEntity.requestOwnership(
        () => {
          // Piece belongs to me, I can move it. PingPong gives the looping
          // 1.2 <-> 1.0 yoyo pulse natively (no repeat/yoyo bookkeeping).
          this.manipulatable.setCanTranslate(true)
          this.player = this.playTransformClip(
            CLIP_PULSE,
            AnimationPropertyLayer.TransformScale,
            new vec3(1.2, 1.2, 1.2),
            new vec3(1.0, 1.0, 1.0),
            750,
            LINEAR,
            PlaybackMode.PingPong
          )
          this.manipulatable.onManipulationEnd.add(this.onManipulationEnd.bind(this))
        },
        (e) => {
          this.logger.error(String(e))
        }
      )
    } else {
      // Piece belongs to other player, I can't move it
      this.manipulatable.setCanTranslate(false)
      this.interactableOutlineFeedback.enabled = false
    }
  }

  /**
   * Build and play a runtime AnimationPlayer clip that drives a single vec3
   * transform property (scale or position) from `from` to `to`.
   *
   * The easing curves span t = 0..1 (a one second clip); playbackSpeed scales
   * that to durationMs. Returns the AnimationPlayer so loops can be stopped later.
   */
  private playTransformClip(
    name: string,
    property: string,
    from: vec3,
    to: vec3,
    durationMs: number,
    easing: readonly number[],
    mode: PlaybackMode
  ): AnimationPlayer {
    const obj = this.manipulatable.getSceneObject()
    const player = this.getPlayer()
    const [x1, y1, x2, y2] = easing

    if (property === AnimationPropertyLayer.TransformScale) {
      obj.getTransform().setLocalScale(from)
    } else if (property === AnimationPropertyLayer.TransformPosition) {
      obj.getTransform().setLocalPosition(from)
    }

    const track = AnimationPropertyTrack.createVec3FromCurves(
      AnimationCurve.createEasingCurve(from.x, to.x, x1, y1, x2, y2),
      AnimationCurve.createEasingCurve(from.y, to.y, x1, y1, x2, y2),
      AnimationCurve.createEasingCurve(from.z, to.z, x1, y1, x2, y2)
    )
    const layer = AnimationPropertyLayer.create()
    layer.setProperty(property, track)

    const asset = AnimationAsset.create()
    asset.addLayer(obj.name, layer)

    player.removeClip(name)
    const clip = AnimationClip.createFromAnimation(name, asset)
    clip.playbackMode = mode
    clip.playbackSpeed = durationMs > 0 ? 1000 / durationMs : 1
    player.addClip(clip)
    player.playClip(name)
    return player
  }

  /** Get (or create) the AnimationPlayer on the manipulatable piece transform. */
  private getPlayer(): AnimationPlayer {
    const obj = this.manipulatable.getSceneObject()
    return (
      (obj.getComponent("Component.AnimationPlayer") as AnimationPlayer) ??
      (obj.createComponent("Component.AnimationPlayer") as AnimationPlayer)
    )
  }

  /** Convert a world-space point into the piece's local space (via its parent). */
  private worldToLocal(worldPos: vec3): vec3 {
    const parent = this.manipulatable.getSceneObject().getParent()
    if (!parent) {
      return worldPos
    }
    return parent.getTransform().getInvertedWorldTransform().multiplyPoint(worldPos)
  }

  /** Fire `cb` after `seconds` using a DelayedCallbackEvent. */
  private delayCall(seconds: number, cb: () => void): void {
    const event = this.createEvent("DelayedCallbackEvent")
    event.bind(cb)
    event.reset(seconds)
  }

  onAwake() {
    this.logger = new Logger("Piece", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.sceneObj = this.getSceneObject()

    // Get sync entity for SyncTransform script
    this.syncEntity = SyncEntity.getSyncEntityOnSceneObject(this.sceneObj)
    this.syncTransform = this.sceneObject.getComponent(SyncTransform.getTypeName())

    // Check sync entity is ready before using it
    this.syncTransform.syncEntity.notifyOnReady(() => this.onReady())
  }
}
