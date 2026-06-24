/**
 * Specs Inc. 2026
 * Touch Down Button component for the Depth Cache Spectacles lens.
 */
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractorEvent} from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {createCallback} from "SpectaclesInteractionKit.lspkg/Utils/InspectorCallbacks"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"

@component
export class TouchDownButton extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">TouchDownButton – pinch interaction button</span><br/><span style="color: #94A3B8; font-size: 11px;">Requires an Interactable on the same SceneObject.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Callbacks</span>')
  @input
  @hint("Enable this to add functions from another script to this component's callback events")
  editEventCallbacks: boolean = false

  @ui.group_start("On Button Pinched Callbacks")
  @showIf("editEventCallbacks")
  @input("Component.ScriptComponent")
  @allowUndefined
  @hint("Script component to invoke on pinch down")
  private customFunctionForOnButtonPinchedDown: ScriptComponent | undefined

  @input("Component.ScriptComponent")
  @allowUndefined
  @hint("Script component to invoke on pinch up")
  private customFunctionForOnButtonPinchedUp: ScriptComponent | undefined

  @input
  @allowUndefined
  @hint("Function names to call on pinch down")
  private onButtonPinchedDownFunctionNames: string[] = []

  @input
  @allowUndefined
  @hint("Function names to call on pinch up")
  private onButtonPinchedUpFunctionNames: string[] = []
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private interactable: Interactable | null = null

  private onButtonPinchedEventDown = new Event<InteractorEvent>()
  public readonly onButtonPinchedDown = this.onButtonPinchedEventDown.publicApi()
  private onButtonPinchedEventUp = new Event<InteractorEvent>()
  public readonly onButtonPinchedUp = this.onButtonPinchedEventUp.publicApi()

  onAwake(): void {
    this.logger = new Logger("TouchDownButton", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.interactable = this.getSceneObject().getComponent(Interactable.getTypeName())
    if (this.editEventCallbacks && this.customFunctionForOnButtonPinchedDown) {
      this.onButtonPinchedDown.add(
        createCallback<InteractorEvent>(
          this.customFunctionForOnButtonPinchedDown,
          this.onButtonPinchedDownFunctionNames
        )
      )
      if (this.editEventCallbacks && this.customFunctionForOnButtonPinchedUp) {
        this.onButtonPinchedUp.add(
          createCallback<InteractorEvent>(this.customFunctionForOnButtonPinchedUp, this.onButtonPinchedUpFunctionNames)
        )
      }
    }
  }

  @bindStartEvent
  private onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    if (!this.interactable) {
      throw new Error(
        "Pinch Button requires an Interactable Component on the same Scene object in order to work - please ensure one is added."
      )
    }
    this.interactable.onTriggerStart.add((interactorEvent: InteractorEvent) => {
      try {
        if (this.enabled) {
          this.onButtonPinchedEventDown.invoke(interactorEvent)
        }
      } catch (e) {
        this.logger.error("Error invoking onButtonPinchedEvent!")
        this.logger.error(String(e))
      }
    })
    this.interactable.onTriggerEnd.add((interactorEvent: InteractorEvent) => {
      try {
        if (this.enabled) {
          this.onButtonPinchedEventUp.invoke(interactorEvent)
        }
      } catch (e) {
        this.logger.error("Error invoking onButtonPinchedEvent!")
        this.logger.error(String(e))
      }
    })
  }
}
