/**
 * Specs Inc. 2026
 * Custom Pinch Button component for the Path Pioneer Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {lerp} from "SpectaclesInteractionKit.lspkg/Utils/mathUtils"

@component
export class CustomPinchButton extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CustomPinchButton – pinch-interactive button</span><br/><span style="color: #94A3B8; font-size: 11px;">Animates button hover and trigger states driven by an Interactable.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Interactable component providing hover and trigger events for this button")
  interactable: Interactable

  @input
  @hint("RenderMeshVisual whose material hover parameter is animated on interaction")
  rmv: RenderMeshVisual

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private targetVal: number = 0
  private mat: Material = null

  onAwake() {
    this.logger = new Logger("CustomPinchButton", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");

    this.mat = this.rmv.mainMaterial
    this.interactable.onHoverEnter.add(() => this.onHoverEnter())
    this.interactable.onHoverExit.add(() => this.onHoverExit())
    this.interactable.onTriggerStart.add(() => this.onTriggerEnter())
    this.interactable.onTriggerEnd.add(() => this.onTriggerExit())
  }

  @bindUpdateEvent
  private onUpdate() {
    // Lerp to target
    let val = this.mat.mainPass.hover
    val = lerp(val, this.targetVal, 3 * getDeltaTime())
    this.mat.mainPass.hover = val
  }

  private onHoverEnter() {
    this.targetVal = 0.7
  }

  private onHoverExit() {
    this.targetVal = 0
  }

  private onTriggerEnter() {
    this.targetVal = 1
  }

  private onTriggerExit() {
    this.targetVal = 0
  }
}
