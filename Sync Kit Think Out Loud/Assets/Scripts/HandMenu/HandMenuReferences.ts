/**
 * Specs Inc. 2026
 * Hand Menu References component for the Think Out Loud Spectacles lens.
 */
import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import { RoundButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton"
import { TextInputField } from "SpectaclesUIKit.lspkg/Scripts/Components/TextInputField/TextInputField"
import { SwitchToggleGroup } from "SpectaclesUIKit.lspkg/Scripts/Components/Toggle/SwitchToggleGroup"

@component
export class HandMenuReferences extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">HandMenuReferences – UI component references for the hand menu panel</span><br/><span style="color: #94A3B8; font-size: 11px;">Assign all UI elements used by HandMenuController for status updates and ping management.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Inputs</span>')
  @input
  @hint("Text input field for status text")
  textStatusInputField: TextInputField

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Buttons</span>')
  @input
  @hint("Rectangle button for exiting ping connections")
  exitPingButton: RectangleButton

  @input
  @hint("Round button for closing the hand menu")
  closeButton: RoundButton

  @input
  @hint("Rectangle button for submitting status updates")
  updateStatusButton: RectangleButton

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Toggles</span>')
  @input
  @hint("Switch toggle group for availability status options")
  switchToggleGroupSubStatus: SwitchToggleGroup

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Ping Materials</span>')
  @input
  @hint("Default material for normal/denied ping state")
  pingDefaultMaterial: Material

  @input
  @hint("Material for accepted ping state")
  pingAcceptedMaterial: Material

  @input
  @hint("Array of scene objects with MeshRenderVisual for ping material swapping")
  pingMaterialTargets: SceneObject[] = []
}
