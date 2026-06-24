/**
 * Specs Inc. 2026
 * Room Lights UI component for the BLE Playground Spectacles lens.
 * Manages hand control toggle for all connected lights.
 */
import {Switch} from "SpectaclesUIKit.lspkg/Scripts/Components/Switch/Switch"
import {LightHandInputManager} from "./LightHandInputManager"

@component
export class RoomLightsUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">RoomLightsUI – hand control toggle panel</span><br/><span style="color: #94A3B8; font-size: 11px;">Manages hand gesture control toggle for all connected lights.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @allowUndefined
  @input
  @hint("Scene object used as parent anchor for this panel when a light is connected")
  node: SceneObject

  @input
  @hint("Switch for toggling hand gesture light control on/off")
  handToggle: Switch

  @input
  @hint("Hand input manager driven by the hand toggle")
  lightHandInputManager: LightHandInputManager

  private so: SceneObject
  private tr: Transform
  private initialized: boolean

  onAwake() {
    this.initialized = false
    this.so = this.getSceneObject()
    this.tr = this.getTransform()

    if (this.node) {
      this.so.setParent(this.node)
    }
    this.tr.setLocalRotation(quat.quatIdentity())
    this.tr.setLocalPosition(new vec3(0, 3000, 0))
  }

  init() {
    if (!this.initialized) {
      this.tr.setLocalPosition(vec3.zero())

      this.handToggle.onValueChange.add((val) => this.onToggleHandInput(val !== 0))

      this.initialized = true
    }
  }

  onToggleHandInput(on: boolean) {
    this.lightHandInputManager.onToggle(on)
  }
}
