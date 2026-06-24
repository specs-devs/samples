/**
 * Specs Inc. 2026
 * Light Status Visual component for the BLE Playground Spectacles lens.
 */
import {Slider} from "SpectaclesUIKit.lspkg/Scripts/Components/Slider/Slider"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {Colors} from "Scripts/Helpers/Colors"

@component
export class LightStatusVisual extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">LightStatusVisual – UI mirror of Hue light state</span><br/><span style="color: #94A3B8; font-size: 11px;">Updates the sphere material color and slider position to reflect the current power, brightness and color.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @allowUndefined
  @input
  @hint("UIKit Slider whose knob position mirrors the current brightness (0–1)")
  slider: Slider

  @input
  @hint("Render mesh visual for the status sphere that mirrors the light color")
  sphereRmv: RenderMeshVisual

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private on: boolean
  private brightness: number
  private color: vec4

  private sphereMat: Material

  onAwake() {
    this.logger = new Logger("LightStatusVisual", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.sphereMat = this.sphereRmv.mainMaterial.clone()
    this.sphereRmv.mainMaterial = this.sphereMat

    this.brightness = 1
    this.color = Colors.black()
  }

  turnOn(on: boolean) {
    this.on = on
    this.logger.debug("turnOn " + on)
    if (on) {
      this.mergeBrightnessAndColor(this.brightness, this.color)
    } else {
      this.mergeBrightnessAndColor(0, this.color)
    }
  }

  setBrightness(brightness: number) {
    this.brightness = brightness
    if (this.slider) {
      this.slider.currentValue = brightness
    }
    this.mergeBrightnessAndColor(this.brightness, this.color)
  }

  setColor(col: vec4) {
    this.color = col
    this.mergeBrightnessAndColor(this.brightness, this.color)
  }

  getSphereMat() {
    return this.sphereMat
  }

  private mergeBrightnessAndColor(brightness: number, color: vec4) {
    let localBrightness = brightness
    if (!this.on) {
      localBrightness = 0
    }

    const blackColor = Colors.black()

    // Mix color and black to mimic brightness on the sphere indicator
    const mergedColor = color.uniformScale(localBrightness).add(blackColor.uniformScale(1 - localBrightness))
    this.sphereMat.mainPass.customColor = mergedColor
  }

  getColor() {
    return this.color
  }
}
