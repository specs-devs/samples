/**
 * Specs Inc. 2026
 * Drag And Drop component for the Essentials Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractableManipulation} from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"
import {InteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"

// Interaction System https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/interactionsystem
// Instantiate https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.ObjectPrefab.html#instantiateasync or https://developers.snap.com/lens-studio/lens-studio-workflow/prefabs

@component
export class DragAndDrop extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">DragAndDrop – drag an object and drop with physics</span><br/><span style="color: #94A3B8; font-size: 11px;">Uses SIK Interactable to select, manipulate, and drop an object with a delayed auto-destroy.</span>')
  @ui.separator

  @input
  @allowUndefined
  @hint("The Interactable for select and release events")
  manipulateObject: Interactable

  @input
  @allowUndefined
  @hint("The InteractableManipulation component for manipulation events")
  manipulationComponent: InteractableManipulation

  @input
  @allowUndefined
  @hint("The BodyComponent to re-enable physics on drop")
  physicsBody: BodyComponent

  @input
  @hint("The delay time in seconds before the instantiated object is destroyed")
  destroyDelay: number = 5

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private latestObject: SceneObject = null
  private logger: Logger

  onAwake() {
    this.logger = new Logger("DragAndDrop", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.logger.info("Onstart event triggered")

    const onTriggerStartCallback = (event: InteractorEvent) => {
      this.objectIsSelected()
    }
    this.manipulateObject.onInteractorTriggerStart(onTriggerStartCallback)

    const onTriggerEndCallback = (event: InteractorEvent) => {
      this.objectIsDropped()
    }
    this.manipulateObject.onInteractorTriggerEnd(onTriggerEndCallback)

    if (this.manipulationComponent) {
      this.manipulationComponent.onManipulationStart.add((event) => {
        this.onManipulationStarted(event)
      })

      this.manipulationComponent.onManipulationEnd.add((event) => {
        this.onManipulationEnded(event)
      })
    } else {
      this.logger.warn("No InteractableManipulation component provided, advanced manipulation events won't be available")
    }
  }

  onManipulationStarted(event: any) {
    this.logger.info("Manipulation started")
  }

  onManipulationEnded(event: any) {
    this.logger.info("Manipulation ended")
    this.physicsBody.dynamic = true
  }

  objectIsSelected() {
    this.latestObject = this.manipulateObject.getSceneObject()
    this.logger.info("Object selected: " + this.latestObject.name)
  }

  objectIsDropped() {
    if (!this.latestObject) {
      this.logger.warn("No object to drop")
      return
    }

    const delayedEvent = this.createEvent("DelayedCallbackEvent")
    delayedEvent.bind(() => {
      if (this.latestObject) {
        this.latestObject.destroy()
        this.logger.info(`Object destroyed after ${this.destroyDelay} seconds`)
        this.latestObject = null
      }
    })

    delayedEvent.reset(this.destroyDelay)
    this.logger.info("Object dropped, will be destroyed in " + this.destroyDelay + " seconds")
  }
}
