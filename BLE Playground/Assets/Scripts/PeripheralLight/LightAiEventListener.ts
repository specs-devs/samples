/**
 * Specs Inc. 2026
 * Light Ai Event Listener component for the BLE Playground Spectacles lens.
 */
import {Colors} from "Scripts/Helpers/Colors"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {LightAiInputManager} from "./LightAiInputManager"
import {LightController} from "./LightController"

@component
export class LightAiEventListener extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">LightAiEventListener – AI light command receiver</span><br/><span style="color: #94A3B8; font-size: 11px;">Listens to LightAiInputManager events and forwards brightness and color to LightController.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @allowUndefined
  @input
  @hint("Shared AI input manager that dispatches light keyframe events")
  lightAiInputManager: LightAiInputManager

  @input
  @hint("Light controller that applies the received brightness and color values")
  lightController: LightController

  private color: vec4

  onAwake() {
    this.color = Colors.black()
  }

  @bindStartEvent
  private onStart() {
    if (this.lightAiInputManager && typeof (this.lightAiInputManager as any).addListener === "function") {
      this.lightAiInputManager.addListener(this)
    }
  }

  onToggleButton(on: boolean) {
    this.lightController.resetBrightnessAndColorStates()
  }

  // Called from lightAiController
  onAiSetBrightnessAndColor(brightness: number, r: number, g: number, b: number) {
    ;(this.color.r = r), (this.color.g = g), (this.color.b = b), (this.color.a = 1)
    this.lightController.aiSetBrightnessAndColor(brightness, this.color)
  }
}
