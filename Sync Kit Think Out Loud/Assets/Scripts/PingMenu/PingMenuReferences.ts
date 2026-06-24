/**
 * Specs Inc. 2026
 * Ping Menu References component for the Think Out Loud Spectacles lens.
 */
import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"

@component
export class PingMenuReferences extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PingMenuReferences – UI component references for the ping request menu</span><br/><span style="color: #94A3B8; font-size: 11px;">Assign all UI elements for the incoming ping accept/reject dialog.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Buttons</span>')
  @input
  @hint("Rectangle button for accepting ping requests")
  acceptButton: RectangleButton

  @input
  @hint("Rectangle button for rejecting ping requests")
  rejectButton: RectangleButton

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Text</span>')
  @input
  @hint("Text component showing who is pinging")
  pingerNameText: Text
}
