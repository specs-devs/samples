/**
 * Specs Inc. 2026
 * Line Controller for the Path Pioneer Spectacles lens experience.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import {LinearAlgebra} from "./Helpers/LinearAlgebra"
import {PathCollisionEvents} from "./PathCollisionEvents"
import {PathWalker} from "./PathWalker"
import {SoundController} from "./SoundController"

@component
export class LineController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">LineController – start/finish line manager</span><br/><span style="color: #94A3B8; font-size: 11px;">Controls visuals, countdown, and collision events for path endpoint lines.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Visuals</span>')
  @input
  @hint("Root visual scene object for the line that can be repositioned")
  visualSo: SceneObject

  @input
  @hint("Scene object shown when this line acts as the start line")
  startVisual: SceneObject

  @input
  @hint("Scene object shown when this line acts as the finish line")
  finishVisual: SceneObject

  @input
  @hint("Parent scene object for the final real-look visual assets")
  realVisualsParent: SceneObject

  @input
  @hint("Parent scene object for the hint/preview visual assets")
  hintVisualsParent: SceneObject

  @input
  @hint("Arrow shown on the start line indicating the turn direction")
  startLineTurnArrow: SceneObject

  @input
  @hint("Arrow shown on the finish line indicating the turn direction")
  finishLineTurnArrow: SceneObject

  @input
  @hint("Hint visual used when this line is in start position")
  hintStartVisual: SceneObject

  @input
  @hint("Hint visual used when this line is in finish position")
  hintFinishVisual: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Countdown</span>')
  @input
  @hint("Root scene object shown during the walk countdown sequence")
  countdownSo: SceneObject

  @input
  @hint("Array of countdown digit scene objects shown in sequence")
  countdownSoArray: SceneObject[]

  @input
  @hint("Collider that detects the player standing inside the countdown zone")
  countdownCollider: ColliderComponent

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Collision & Lap</span>')
  @input
  @hint("Collider attached to the camera used for line crossing detection")
  camCol: ColliderComponent

  @input
  @hint("3D text showing the current lap number above the start line")
  lapCounter3Dtext: Text3D

  @input
  @hint("PathCollisionEvents component handling enter/exit collision callbacks")
  pathCollisionEvents: PathCollisionEvents

  @input
  @hint("PathWalker notified when start area collision is detected")
  pathWalker: PathWalker

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private enableWalkCountdown: boolean = false
  private lapCounterSo: SceneObject = null
  private visualTr: Transform = null
  private isStart: boolean | undefined
  private collisionStayRemover: EventRegistration | undefined

  onAwake(): void {
    this.logger = new Logger("LineController", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
  }

  init(beginsAsStartLine: boolean) {
    this.countdownSo.enabled = false
    this.collisionStayRemover = this.countdownCollider.onCollisionStay.add((e: CollisionStayEventArgs) =>
      this.onCollisionStay(e)
    )
    this.lapCounterSo = this.lapCounter3Dtext.getSceneObject()
    this.lapCounterSo.enabled = false

    this.isStart = beginsAsStartLine
    if (!beginsAsStartLine) {
      const pos = this.countdownCollider.getTransform().getLocalPosition()
      pos.z = -pos.z
      this.countdownCollider.getTransform().setLocalPosition(pos)
    }
    this.setVisual()
    this.visualTr = this.visualSo.getTransform()
    this.setHintVisual()

    this.pathCollisionEvents.init(
      this.isStart ? "start" : "finish",
      this.camCol.getSceneObject().getParent().getTransform(),
      this.camCol,
      this.pathWalker
    )
  }

  setHintVisual() {
    this.hintStartVisual.enabled = this.isStart
    this.hintFinishVisual.enabled = !this.isStart

    this.realVisualsParent.enabled = false
    this.hintVisualsParent.enabled = true
  }

  setRealVisual() {
    this.realVisualsParent.enabled = true
    this.hintVisualsParent.enabled = false
  }

  setEnableWalkCountdown() {
    this.enableWalkCountdown = true
  }

  private startCountDown() {
    const delay = 1
    for (let i = 0; i < this.countdownSoArray.length + 1; i++) {
      const evt = this.createEvent("DelayedCallbackEvent")
      evt.bind(() => {
        this.countdownSoArray.forEach((so) => {
          so.enabled = false
        })

        if (i == 0) {
          SoundController.getInstance().playSound("onCountdown")
        }

        if (i < this.countdownSoArray.length) {
          this.countdownSo.enabled = true
          this.countdownSoArray[i].enabled = true
        }

        if (i == this.countdownSoArray.length) {
          this.countdownSo.enabled = false
        }
      })
      evt.reset(delay * i)
    }

    return delay * (this.countdownSoArray.length + 1)
  }

  onStartSprint() {
    this.startLineTurnArrow.enabled = true
    this.finishLineTurnArrow.enabled = true
  }

  setVisual() {
    this.startVisual.enabled = this.isStart
    this.finishVisual.enabled = !this.isStart
  }

  onSprintStartAreaCollision() {
    this.enableWalkCountdown = false
    if (this.collisionStayRemover) {
      this.countdownCollider.onCollisionStay.remove(this.collisionStayRemover)
    }
    this.countdownCollider.enabled = false

    if (this.isStart) {
      this.startCountDown()
    }
  }

  onReverseSprintTrackVisuals() {
    this.isStart = !this.isStart
    this.setVisual()

    const rot = LinearAlgebra.flippedRot(this.visualTr.getWorldRotation(), this.visualTr.up)
    this.visualTr.setWorldRotation(rot)
  }

  // This is only called on the start visual
  onIncrementLoop(nextLapCount: number) {
    this.startVisual.enabled = false
    this.lapCounterSo.enabled = true
    this.lapCounter3Dtext.text = "LAP " + nextLapCount
  }

  onCollisionStay(e: CollisionEnterEventArgs) {
    if (this.enableWalkCountdown) {
      if (e.collision.collider.isSame(this.camCol)) {
        this.pathWalker.onSprintStartAreaCollision(!this.isStart)
        this.enableWalkCountdown = false
      }
    }
  }
}
