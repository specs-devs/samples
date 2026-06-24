/**
 * Specs Inc. 2026
 * Response UI component for the BLE Playground Spectacles lens.
 */
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {MeasureLine} from "./MeasureLine"
import {WorldLabel} from "./WorldLabel"

@component
export class ResponseUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ResponseUI – Gemini response display panel</span><br/><span style="color: #94A3B8; font-size: 11px;">Manages the response bubble and world-space labels created from Gemini JSON output.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @allowUndefined
  @input
  @hint("Root container that wraps the response bubble panel")
  responseBubble: SceneObject

  @input
  @hint("Text component inside the response bubble that shows the Gemini text response")
  responseText: Text

  @input
  @hint("Prefab instantiated for each labelled point in the scene")
  worldLabelPrefab: ObjectPrefab

  @input
  @hint("Prefab instantiated for each measurement line in the scene")
  measureLinePrefab: ObjectPrefab

  @input
  @hint("Parent scene object under which world labels and measure lines are created")
  labelsParent: SceneObject

  private activeLabels: SceneObject[] = []

  onAwake() {
    if (this.responseBubble) {
      this.responseBubble.enabled = false
    }
  }

  @bindStartEvent
  private onStart() {}

  showLabels(val: boolean) {
    this.labelsParent.enabled = val
  }

  clearLabels() {
    for (const label of this.activeLabels) {
      label.destroy()
    }
    this.activeLabels = []
  }

  openResponseBubble(message: string) {
    this.responseText.text = message
    if (this.responseBubble) {
      this.responseBubble.enabled = true
    }
  }

  closeResponseBubble() {
    if (this.responseBubble) {
      this.responseBubble.enabled = false
    }
  }

  loadWorldLabel(labelText: string, worldPosition: vec3, showArrow: boolean) {
    const labelObj = this.worldLabelPrefab.instantiate(this.labelsParent)
    const worldLabel = labelObj.getComponent(WorldLabel.getTypeName())
    worldLabel.textComp.text = labelText
    labelObj.getTransform().setWorldPosition(worldPosition)
    this.activeLabels.push(labelObj)
  }

  loadWorldLine(startPos: vec3, endPos: vec3) {
    const lineObj = this.measureLinePrefab.instantiate(this.labelsParent)
    const measureLine = lineObj.getComponent(MeasureLine.getTypeName())
    measureLine.setPoints(startPos, endPos)
    measureLine.setVisible(true)
    this.activeLabels.push(lineObj)
  }
}
