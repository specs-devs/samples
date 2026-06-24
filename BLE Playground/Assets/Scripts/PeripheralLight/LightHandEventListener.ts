/**
 * Specs Inc. 2026
 * This script listens for events from the Light Hand Input Manager and passes them to the Light
 * Controller If the user clicks the "place" toggle button on the light's ui panel, this script will
 * use the world query to place the light in space, and add that position to the Light Hand Input
 * Manager.
 */
import {CancelToken, clearTimeout, setTimeout} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {LightController} from "./LightController"
import {LightHandInputManager} from "./LightHandInputManager"

@component
export class LightHandEventListener extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">LightHandEventListener – per-prefab hand event receiver</span><br/><span style="color: #94A3B8; font-size: 11px;">Receives hand gesture events from LightHandInputManager.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @allowUndefined
  @input
  @hint("Camera used as the origin for placement ray cast")
  cam: Camera

  @input
  @hint("Light controller that receives color and power commands from gesture events")
  lightController: LightController

  @allowUndefined
  @input
  @hint("Shared hand input manager this listener registers with on awake")
  lightHandInputManager: LightHandInputManager

  @allowUndefined
  @input
  @hint("Text component displaying the current placement instruction to the user")
  text: Text

  public surfaceDetectionPosition: vec3

  private timeoutCancelToken: CancelToken

  onAwake() {
    this.surfaceDetectionPosition = undefined
    if (this.text) this.text.text = "Place light"
  }

  @bindStartEvent
  private onStart() {
    if (this.lightHandInputManager && typeof (this.lightHandInputManager as any).addListener === "function") {
      this.lightHandInputManager.addListener(this)
    }
  }

  init() {}

  onPinch() {
    if (this.text) {
      this.text.text = "Look at light"
      this.timeoutCancelToken = setTimeout(() => {
        clearTimeout(this.timeoutCancelToken)
        if (this.text) this.text.text = "Place light"
      }, 4)
    }
    print("[LightHandEventListener] onPinch — surface detection removed, skipping placement")
  }

  resetBrightnessAndColorStates() {
    this.lightController.resetBrightnessAndColorStates()
  }

  selectColorGestureScreenSpacePos(screenSpacePos: vec2) {
    this.lightController.selectColorGestureScreenSpacePos(screenSpacePos)
  }

  togglePowerFromGesture(val: boolean) {
    this.lightController.togglePowerFromGesture(val)
  }
}
