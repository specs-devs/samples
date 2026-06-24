/**
 * Specs Inc. 2026
 * Light Color Wheel Input Manager handling core logic for the BLE Playground lens.
 */
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import {unsubscribe} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {LightController} from "./LightController"

@component
export class LightColorWheelInputManager extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">LightColorWheelInputManager – color wheel drag input handler</span><br/><span style="color: #94A3B8; font-size: 11px;">Translates interactable trigger drag events into color wheel position updates on LightController.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Interactable component on the color wheel used to detect drag input")
  interactable: Interactable

  @input
  @hint("LightController that receives color selection updates from drag input")
  lightController: LightController

  private triggerUpdateRemover: unsubscribe

  onAwake() {}

  @bindStartEvent
  private onStart() {
    this.interactable.onTriggerStart.add(() => this.onTriggerStart())
    this.interactable.onTriggerEnd.add(() => this.onTriggerEnd())
    this.interactable.onTriggerCanceled(() => this.onTriggerCanceled())
  }

  private subscribe() {
    if (!this.triggerUpdateRemover) {
      this.triggerUpdateRemover = this.interactable.onTriggerUpdate.add((arg) => this.onTriggerUpdate(arg))
    }
  }

  private unsubscribe() {
    if (this.triggerUpdateRemover) {
      this.interactable.onTriggerUpdate.remove(this.triggerUpdateRemover)
      this.triggerUpdateRemover = undefined
    }
  }

  onTriggerStart() {
    this.subscribe()
  }

  onTriggerEnd() {
    this.unsubscribe()
  }

  onTriggerCanceled() {
    this.unsubscribe()
  }

  onTriggerUpdate(arg: InteractorEvent) {
    this.lightController.selectColorWheelWorldPos(arg.interactor.targetHitPosition)
  }
}
