/**
 * Specs Inc. 2026
 * Light Controller for the BLE Playground Spectacles lens experience.
 */
import {Colors} from "Scripts/Helpers/Colors"
import {Frame} from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame"
import {RoundButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {Widget} from "../Core/Widget"
import {UniqueColorService} from "../Helpers/UniqueColorService"
import {HueEventEmitter} from "./HueEventEmitter"
import {LightHandEventListener} from "./LightHandEventListener"
import {RoomLightsUI} from "./RoomLightsUI"

@component
export class LightController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">LightController – Hue light UI coordinator</span><br/><span style="color: #94A3B8; font-size: 11px;">Generates the color wheel, routes input events, and delegates to HueEventEmitter for BLE writes.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">UI References</span>')
  @input
  @hint("Image component used to display the procedurally generated color wheel")
  colorWheelImage: Image

  @allowUndefined
  @input
  @hint("RoomLightsUI panel managing AI and hand control toggles for this light")
  roomLightsUI: RoomLightsUI

  @input
  @hint("HueEventEmitter that writes power, brightness and color to the BLE light")
  hueEventEmitter: HueEventEmitter

  @input
  @hint("LightHandEventListener that handles hand gesture events for this light prefab")
  lightHandEventListener: LightHandEventListener

  @input
  @hint("Image component for the color selection marker on the color wheel")
  markerImage: Image

  @input
  @hint("Toggle button for toggling the light power on and off")
  powerToggleButton: RoundButton

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private isSettingPowerFromCode: boolean = false

  private frame: Frame

  private texture: Texture
  private resolution: number
  private colorWheelTr: Transform
  private markerTr: Transform
  private markerMat: Material
  private colorData: Uint8Array
  private channels: number
  private markerLocalPos: vec3

  private clampedToCircleVec2: vec2
  private colorLocalPos: vec3

  onAwake() {
    this.logger = new Logger("LightController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.clampedToCircleVec2 = vec2.zero()
    this.colorLocalPos = vec3.zero()
    this.markerLocalPos = new vec3(0, 0, 0.1)
    this.colorWheelTr = this.colorWheelImage.getTransform()
    this.resolution = 256
    this.markerTr = this.markerImage.getTransform()
    this.markerMat = this.markerImage.mainMaterial.clone()
    this.markerImage.mainMaterial = this.markerMat
    this.generateColorWheel()

    this.colorWheelImage.mainMaterial.mainPass.baseTex = this.generateColorWheel()
  }

  init(bluetoothGatt: any, widget: Widget) {
    this.frame = widget.frame

    // Generate a neon unique color that stands out against current lamp colors
    const startColor = UniqueColorService.getInstance().getUniqueColor()

    // Set our marker to this position
    this.markerTr.setLocalPosition(this.getLocalPositionAtColor(startColor))

    // Init
    if (this.roomLightsUI) this.roomLightsUI.init()
    this.hueEventEmitter.init(bluetoothGatt, startColor)
    this.lightHandEventListener.init()

    this.powerToggleButton.setIsToggleable(true)
    this.powerToggleButton.onValueChange.add((val) => {
      if (!this.isSettingPowerFromCode) {
        this.togglePower(val === 1)
      }
    })

    if (this.frame) {
      this.frame.onTranslationStart.add(() => this.hueEventEmitter.setFlash(true))
      this.frame.onTranslationEnd.add(() => this.hueEventEmitter.setFlash(false))
    }
  }

  private generateColorWheel() {
    this.texture = ProceduralTextureProvider.create(this.resolution, this.resolution, Colorspace.RGBA)
    this.channels = 4
    const radius = this.resolution / 2
    const center = new vec2(radius, radius)
    this.colorData = new Uint8Array(this.resolution * this.resolution * this.channels)

    for (let y = 0; y < this.resolution; y++) {
      for (let x = 0; x < this.resolution; x++) {
        const index = (y * this.resolution + x) * this.channels
        const p = new vec2(x, y)
        const dir = p.sub(center)
        const dist = dir.length / radius

        if (dist > 1) {
          this.colorData[index] = 0
          this.colorData[index + 1] = 0
          this.colorData[index + 2] = 0
          this.colorData[index + 3] = 0
        } else {
          const angle = Math.atan2(dir.y, dir.x)
          const hue = (angle / (2 * Math.PI) + 1) % 1
          const sat = dist
          const val = 1

          const rgb = this.HSVtoRGB(hue, sat, val)
          this.colorData[index] = rgb.r * 255
          this.colorData[index + 1] = rgb.g * 255
          this.colorData[index + 2] = rgb.b * 255
          this.colorData[index + 3] = 255
        }
      }
    }

    // cast
    ;(this.texture.control as ProceduralTextureProvider).setPixels(
      0,
      0,
      this.resolution,
      this.resolution,
      this.colorData
    )
    return this.texture
  }

  private HSVtoRGB(h: number, s: number, v: number) {
    let r: number = 0,
      g: number = 0,
      b: number = 0

    // Hue sector index
    const sectorIndex: number = Math.floor(h * 6)
    // Hue position in sector
    const fractionalSector: number = h * 6 - sectorIndex
    // Darker desaturated color
    const min: number = v * (1 - s)
    // Partially interpolated color (descending)
    const descending: number = v * (1 - fractionalSector * s)
    // Partially interpolated color (ascending)
    const ascending: number = v * (1 - (1 - fractionalSector) * s)

    switch (sectorIndex % 6) {
      case 0:
        r = v
        g = ascending
        b = min
        break
      case 1:
        r = descending
        g = v
        b = min
        break
      case 2:
        r = min
        g = v
        b = ascending
        break
      case 3:
        r = min
        g = descending
        b = v
        break
      case 4:
        r = ascending
        g = min
        b = v
        break
      case 5:
        r = v
        g = min
        b = descending
        break
    }

    return {r, g, b}
  }

  resetBrightnessAndColorStates() {
    this.hueEventEmitter.resetBrightnessAndColorStates()
  }

  setBrightness(value: number) {
    this.hueEventEmitter.setBrightnessUI(value)
  }

  aiSetBrightnessAndColor(brightness: number, color: vec4) {
    this.hueEventEmitter.setBrightnessUI(brightness)
    this.hueEventEmitter.setColorUI(color)
  }

  togglePowerFromGesture(value: boolean) {
    this.resetBrightnessAndColorStates()
    this.isSettingPowerFromCode = true
    this.powerToggleButton.toggle(value)
    this.isSettingPowerFromCode = false
    this.hueEventEmitter.togglePower(value)
  }

  togglePower(value: boolean) {
    this.resetBrightnessAndColorStates()
    this.hueEventEmitter.togglePower(value)
  }

  selectColorWheelWorldPos(worldPos: vec3) {
    const localPos = this.colorWheelTr.getInvertedWorldTransform().multiplyPoint(worldPos)
    localPos.z = 0
    this.selectColorLocalPos(localPos)
  }

  selectColorGestureScreenSpacePos(screenSpacePos: vec2) {
    // Screenspace is (0,0) at upper left corner and (1,1) at lower right corner.
    // The color wheel space expects a vec3 with (-.5,.5,0) at the upper left corner and (.5,-.5,0) at the lower right corner.
    screenSpacePos.x = MathUtils.remap(screenSpacePos.x, 0, 1, -0.49, 0.49)
    screenSpacePos.y = MathUtils.remap(screenSpacePos.y, 0, 1, 0.49, -0.49) // flip it
    screenSpacePos = this.clampToCircle(screenSpacePos)
    this.colorLocalPos.x = screenSpacePos.x
    this.colorLocalPos.y = screenSpacePos.y
    this.colorLocalPos.z = 0

    this.logger.debug("screenSpace " + screenSpacePos + " local pos " + this.colorLocalPos)
    this.selectColorLocalPos(this.colorLocalPos)
  }

  clampToCircle(pos: vec2, radius: number = 0.49): vec2 {
    const lengthSq = pos.x * pos.x + pos.y * pos.y

    if (lengthSq <= radius * radius) {
      return pos
    }

    const length = Math.sqrt(lengthSq)
    const scale = radius / length

    this.clampedToCircleVec2.x = pos.x * scale
    this.clampedToCircleVec2.y = pos.y * scale
    return this.clampedToCircleVec2
  }

  private getColorAtLocalPosition(localPos: vec3) {
    const px = Math.floor((localPos.x + 0.5) * this.resolution)
    const py = Math.floor((localPos.y + 0.5) * this.resolution)

    if (px >= 0 && py >= 0 && px < this.resolution && py < this.resolution) {
      const index = (py * this.resolution + px) * this.channels
      const r = this.colorData[index]
      const g = this.colorData[index + 1]
      const b = this.colorData[index + 2]
      const a = this.colorData[index + 3]

      const color = new vec4(r, g, b, a).uniformScale(1 / 255)
      return color
    }
    return Colors.white()
  }

  private getLocalPositionAtColor(targetColor: vec4): vec3 | undefined {
    const res = this.resolution
    const channels = this.channels

    for (let py = 0; py < res; py++) {
      for (let px = 0; px < res; px++) {
        const index = (py * res + px) * channels

        const r = this.colorData[index]
        const g = this.colorData[index + 1]
        const b = this.colorData[index + 2]
        const a = this.colorData[index + 3]

        // Convert stored RGBA to normalized vec4
        const currentColor = new vec4(r, g, b, a).uniformScale(1 / 255)

        // Compare colors
        if (this.areColorsEqualWithinTolerance(currentColor, targetColor, 0.1)) {
          // Convert pixel coordinates back to normalized local position
          const localX = px / res - 0.5
          const localY = py / res - 0.5
          return new vec3(localX, localY, 0)
        }
      }
    }

    return vec3.zero()
  }

  private areColorsEqualWithinTolerance(a: vec4, b: vec4, tolerance: number): boolean {
    return (
      Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance && Math.abs(a.z - b.z) <= tolerance
    )
  }

  private selectColorLocalPos(localPos: vec3) {
    const color = this.getColorAtLocalPosition(localPos)
    if (color) {
      this.markerLocalPos.x = localPos.x
      this.markerLocalPos.y = localPos.y
      this.markerTr.setLocalPosition(this.markerLocalPos)

      if (color.a > 0.01) {
        this.hueEventEmitter.setColorUI(color)
      } else {
        this.logger.warn("invalid color alpha at selected position")
      }
    } else {
      this.logger.error("color is undefined at selected position")
    }
  }
}
