/**
 * Specs Inc. 2026
 * Forces the button mesh material to match toggle state when changed programmatically.
 * Attach to the same scene object as the RoundButton.
 */
import {RoundButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton"
import {reportError} from "./ErrorUtils"

@component
export class ButtonFeedback_ForceVisualState extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ButtonFeedback_ForceVisualState – code-driven button visual sync</span><br/><span style="color: #94A3B8; font-size: 11px;">Forces the button mesh material to match toggle state when changed programmatically.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("RoundButton whose isOn state drives the material swap")
  roundButton: RoundButton

  @input
  @hint("Render mesh visual whose material is swapped to reflect button state")
  renderMeshVisual: RenderMeshVisual

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Materials</span>')
  @allowUndefined
  @input
  @hint("Material applied when the button is in its toggled-on state")
  toggledMaterial: Material

  @allowUndefined
  @input
  @hint("Material applied when the button is in its idle (off) state")
  idleMaterial: Material

  onAwake() {}

  public onCodeChangeButtonState() {
    try {
      this.changeButtonState(this.roundButton.isOn ? this.toggledMaterial : this.idleMaterial)
    } catch (error) {
      reportError(error)
    }
  }

  private changeButtonState(material: Material | undefined): void {
    if (material === undefined) return
    this.renderMeshVisual.mainMaterial = material
  }
}
