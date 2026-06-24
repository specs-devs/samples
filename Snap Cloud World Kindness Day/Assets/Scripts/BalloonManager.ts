/**
 * Specs Inc. 2026
 * Balloon Manager handling core logic for the World Kindness Day lens.
 */
import {LSTween} from "LSTween.lspkg/LSTween"
import Easing from "LSTween.lspkg/TweenJS/Easing"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"
import {KindnessCounter} from "./KindnessCounter"
import {PledgeReadInOrder} from "./PledgeReadInOrder"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"

@component
export class BalloonManager extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">BalloonManager – Balloon interaction controller</span><br/><span style="color: #94A3B8; font-size: 11px;">Handles balloon selection, pledge flow, and lift animation.</span>')
  @ui.separator

  @input
  @hint("KindnessCounter component that handles pledge submission")
  KindnessCounter: KindnessCounter

  @input
  @hint("Array of interactable balloon scene objects")
  balloons!: SceneObject[]

  @input
  @hint("Container for the end-screen balloon visuals")
  endScreenBalloons: SceneObject

  @input
  @hint("PledgeReadInOrder component that manages the voice pledge flow")
  PledgeReadInOrder: PledgeReadInOrder

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')

  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private selectedBalloon: SceneObject

  onAwake(): void {
    this.logger = new Logger("BalloonManager", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    const interactionManager = SIK.InteractionManager

    this.balloons.forEach((obj, i) => {
      if (!obj) return

      let interactable = obj.getComponent(Interactable.getTypeName()) as unknown as Interactable
      if (!interactable) {
        interactable = interactionManager.getInteractableBySceneObject(obj) as Interactable
      }
      if (!interactable) {
        this.logger.warn(`Balloon[${i}] "${obj.name}" has no Interactable + Collider.`)
        return
      }

      interactable.onInteractorTriggerEnd((_event: InteractorEvent) => {
        this.selectedBalloon = obj
        this.nextStep(obj)
        this.logger.info(`END ${obj.name}`)
      })
    })
  }

  public changeTransform(): void {
    const startPosition = this.selectedBalloon.getTransform().getLocalPosition()
    const destinationPosition = new vec3(startPosition.x, 50, startPosition.z)
    LSTween.moveFromToLocal(this.selectedBalloon.getTransform(), startPosition, destinationPosition, 1500)
      .easing(Easing.Cubic.InOut)
      .delay(100) // There is a bug in TweenJS where the yoyo value will jump if no delay is set.
      .yoyo(false)
      .repeat(0)
      .start()

    this.KindnessCounter.onBalloonSelected()
  }

  private nextStep(selected: SceneObject): void {
    this.delay(1, () => {
      this.balloons.forEach((obj) => {
        if (obj && obj !== selected) {
          obj.enabled = false
        }
      })
    })
    this.PledgeReadInOrder.init()
  }

  private delay(seconds: number, callback: () => void): void {
    const evt = this.createEvent("DelayedCallbackEvent")
    evt.bind(callback)
    evt.reset(seconds)
  }
}
