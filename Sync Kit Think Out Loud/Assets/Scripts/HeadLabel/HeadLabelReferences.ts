/**
 * Specs Inc. 2026
 * Head Label References component for the Think Out Loud Spectacles lens.
 */
@component
export class HeadLabelReferences extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">HeadLabelReferences – UI component references for the floating head label panel</span><br/><span style="color: #94A3B8; font-size: 11px;">Assign all text and material references used by HeadLabelObjectController.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Text</span>')
  @input
  @hint("Text component for user name")
  textUserName: Text

  @input
  @hint("Text component for main status")
  textStatus: Text

  @input
  @hint("Text component for sub status")
  textSubStatus: Text

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
