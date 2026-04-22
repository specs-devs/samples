/**
 * Specs Inc. 2026
 * Detection Container component for the SnapML Starter Spectacles lens.
 */
import {ClosedPolyline} from "./ClosedPolyline"

@component
export class DetectionContainer extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">DetectionContainer – bounding box display container</span><br/><span style="color: #94A3B8; font-size: 11px;">Holds UI component references for a single detected object overlay.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Display Components</span>')
  @input
  @hint("Text component showing category name and confidence percentage")
  categoryAndConfidence: Text

  @input
  @hint("Text component showing distance from the camera")
  distanceFromCamera: Text

  @input
  @hint("ClosedPolyline component that draws the bounding box outline")
  polyline: ClosedPolyline

  @input
  @hint("Scene objects representing the four corners of the bounding box")
  public polylinePoints: SceneObject[]
}
