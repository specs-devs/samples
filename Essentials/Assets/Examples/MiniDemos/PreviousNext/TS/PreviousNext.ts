/**
 * Specs Inc. 2026
 * Defines Previous Next, Array Navigator for the Essentials lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"

@component
export class PreviousNext extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PreviousNext – navigate through a list of scene objects</span><br/><span style="color: #94A3B8; font-size: 11px;">Activates one SceneObject at a time from an array, cycling forward/backward via interactable buttons.</span>')
  @ui.separator

  @input
  @hint("Array of scene objects to navigate between")
  sceneObjects: SceneObject[]

  @input
  @allowUndefined
  @hint("Optional Text component to display the current object name")
  textObject: Text | undefined

  @input
  @allowUndefined
  @hint("Interactable button that advances to the next scene object")
  nextInteractable: Interactable | undefined

  @input
  @allowUndefined
  @hint("Interactable button that goes to the previous scene object")
  previousInteractable: Interactable | undefined

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  onAwake() {
    this.logger = new Logger("PreviousNext", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")

    if (!this.sceneObjects || this.sceneObjects.length === 0) {
      this.logger.warn("No scene objects to navigate.")
      return
    }

    const navigator = new ArrayNavigator(this.sceneObjects)

    this.activateCurrentObject(navigator.getCurrentItem())

    const onTriggerStartCallbackNext = (event: InteractorEvent) => {
      const nextItem = navigator.next()
      this.activateCurrentObject(nextItem)
    }

    const onTriggerStartCallbackPrevious = (event: InteractorEvent) => {
      const previousItem = navigator.previous()
      this.activateCurrentObject(previousItem)
    }

    if (this.nextInteractable) {
      this.nextInteractable.onInteractorTriggerStart(onTriggerStartCallbackNext)
    } else {
      this.logger.warn("Next interactable is not defined.")
    }

    if (this.previousInteractable) {
      this.previousInteractable.onInteractorTriggerStart(onTriggerStartCallbackPrevious)
    } else {
      this.logger.warn("Previous interactable is not defined.")
    }
  }

  activateCurrentObject(currentObject: SceneObject) {
    this.sceneObjects.forEach((obj) => {
      obj.enabled = false
    })

    currentObject.enabled = true
    this.logger.info(`Activated object: ${currentObject.name}`)

    if (this.textObject) {
      this.textObject.text = currentObject.name
      this.logger.info(`Updated text object with name: ${currentObject.name}`)
    } else {
      this.logger.warn("Text object is not defined.")
    }
  }
}

class ArrayNavigator {
  items: any[]
  currentIndex: number

  constructor(items: any[]) {
    this.items = items
    this.currentIndex = 0
  }

  next() {
    this.currentIndex = (this.currentIndex + 1) % this.items.length
    return this.items[this.currentIndex]
  }

  previous() {
    this.currentIndex = (this.currentIndex - 1 + this.items.length) % this.items.length
    return this.items[this.currentIndex]
  }

  getCurrentItem() {
    return this.items[this.currentIndex]
  }
}
