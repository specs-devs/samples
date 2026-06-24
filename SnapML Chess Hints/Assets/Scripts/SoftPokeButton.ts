/**
 * Specs Inc. 2026
 * Soft Poke Button component for the SnapML Chess Hints Spectacles lens.
 */
import {InteractableAudioFeedback} from "SpectaclesInteractionKit.lspkg/Components/Helpers/InteractableAudioFeedback"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"
import { bindStartEvent, bindUpdateEvent } from "SnapDecorators.lspkg/decorators"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class SoftPokeButton extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SoftPokeButton – physical finger poke interaction</span><br/><span style="color: #94A3B8; font-size: 11px;">Detects fingertip Z-axis penetration to trigger a soft poke callback.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Interaction Settings</span>')
  @input
  @hint("Z depth (in local units) at which the button registers a full poke")
  activationDepth: number = -3.0

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private didFullPoke = false
  private isPoking = false
  private maxZ: number = 1.0
  private targetZ: number = 0
  private currentJoint = null
  private isEditor = global.deviceInfoSystem.isEditor()

  public onPoke: () => void = () => {}

  private logger: Logger

  onAwake() {
    this.logger = new Logger("SoftPokeButton", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")

    const interactable = this.getSceneObject().getComponent(Interactable.getTypeName()) as Interactable

    if (this.isEditor) {
      interactable.onInteractorTriggerEnd(() => {
        this.onPoke()
      })
    } else {
      interactable.enabled = false
    }
  }

  getPokePosition() {
    const lh = SIK.HandInputData.getHand("left")
    const rh = SIK.HandInputData.getHand("right")

    const transform = this.getSceneObject().getTransform().getInvertedWorldTransform()

    if (this.currentJoint != null) {
      return [this.currentJoint, transform.multiplyPoint(this.currentJoint.position)]
    }

    const joints = [
      lh.indexTip,
      rh.indexTip,
      lh.indexDistal,
      rh.indexDistal,
      lh.middleTip,
      rh.middleTip,
      lh.middleDistal,
      rh.middleDistal
    ]
    let minLength = Number.MAX_VALUE
    let minPos = vec3.zero()
    let minJoint = null
    for (const joint of joints) {
      if (joint.position != null) {
        const transformedPos = transform.multiplyPoint(joint.position)
        if (transformedPos.length < minLength) {
          minLength = transformedPos.length
          minPos = transformedPos
          minJoint = joint
        }
      }
    }

    return [minJoint, minPos]
  }

  @bindUpdateEvent
  onUpdate() {
    const [joint, pos] = this.getPokePosition()

    const audioFeedback = this.getSceneObject().getComponent(
      InteractableAudioFeedback.getTypeName()
    ) as InteractableAudioFeedback

    const xDist = Math.abs(pos.x)
    const yDist = Math.abs(pos.y)
    const frame = this.getSceneObject().getChild(0).getChild(1)
    const sideScale = frame.getTransform().getLocalScale().uniformScale(0.75)
    if (xDist < sideScale.x && yDist < sideScale.y && pos.z < this.maxZ && (this.isPoking || pos.z > 0.0)) {
      if (!this.isPoking) {
        this.currentJoint = joint
        audioFeedback.hoverAudioComponent.play(1)
      }
      this.isPoking = true
      this.targetZ = Math.min(Math.max(pos.z, this.activationDepth), 0.0)
    } else {
      this.isPoking = false
      this.targetZ = 0
      this.didFullPoke = false
      this.currentJoint = null
    }

    if (this.isPoking) {
      if (this.targetZ <= this.activationDepth) {
        if (!this.didFullPoke) {
          this.didFullPoke = true
          audioFeedback.triggerEndAudioComponent.play(1)
          this.onPoke()
        }
      }
    }
    const transform = this.getSceneObject().getChild(0).getTransform()
    const currentPosition = transform.getLocalPosition()
    const newPosition = vec3.lerp(currentPosition, new vec3(0, 0, this.targetZ), 0.5)
    transform.setLocalPosition(newPosition)
  }
}
