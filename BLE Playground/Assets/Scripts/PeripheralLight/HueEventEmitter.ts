/**
 * Specs Inc. 2026
 * Defines Hue Event Emitter, Light State for the BLE Playground lens.
 */
// Note: If you are having trouble writing to hue bulb, you can try resetting bulb via Power Cycling:
// Power off: Turn off the power to the bulb for 10 seconds (either at the wall switch or by unplugging the lamp).
// Power on: Turn the power back on and leave it on for 3 seconds.
// Power off: Turn the power off again for 10 seconds.
// Repeat: Repeat the on and off cycle until the bulb flashes, with each on period lasting 3 seconds and each off period lasting 10 seconds.
// Confirm reset: The bulb should blink or cycle colors to indicate a successful reset.

import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {LensInitializer} from "../Core/LensInitializer"
import {HueLightData} from "../Core/PeripheralTypeData"
import {CursorVisualHelper} from "../Helpers/CursorVisualHelper"
import {reportError} from "../Helpers/ErrorUtils"
import {UniqueColorService} from "../Helpers/UniqueColorService"
import {LightStatusVisual} from "./LightStatusVisual"

// Store state data in two formats - for the debug visual, and bytes for the ble light
// To reduce ble message count on drag, store the next brightness or color, and only set it once the last value is received
export interface LightState {
  powerBool: boolean
  powerByteArray: Uint8Array
  brightnessNum: number
  brightnessByteArray: Uint8Array
  nextBrightnessNum: number
  preFlashBrightnessNum: number
  colorVec: vec4
  colorByteArray: Uint8Array
  nextColorVec: vec4
}

@component
export class HueEventEmitter extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">HueEventEmitter – Hue BLE light writer</span><br/><span style="color: #94A3B8; font-size: 11px;">Writes power, brightness and color to a connected Hue BLE device via GATT characteristics.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Status visual component that mirrors the light state in the UI sphere and slider")
  lightStatusVisual: LightStatusVisual

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private updateFlashEvent: SceneEvent

  // Spectacles
  private bluetoothGatt: Bluetooth.BluetoothGatt
  private baseService: Bluetooth.BluetoothGattService
  private powerCharacteristic: Bluetooth.BluetoothGattCharacteristic
  private brightnessCharacteristic: Bluetooth.BluetoothGattCharacteristic
  private colorCharacteristic: Bluetooth.BluetoothGattCharacteristic

  private state: LightState
  private inSetBrightnessState: boolean
  private inSetColorState: boolean

  private safeBytes = []

  onAwake() {
    this.logger = new Logger("HueEventEmitter", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.inSetBrightnessState = false
    this.inSetColorState = false

    // NOTE BUG: first bytes > 127 will crash - fix is coming
    // Define safe bytes for Hue bulb
    for (let i = 1; i <= 0x7f; i++) this.safeBytes.push(i) // ASCII range

    this.state = {} as LightState

    this.updateFlashEvent = this.createEvent("UpdateEvent")
    this.updateFlashEvent.enabled = false
    this.updateFlashEvent.bind(() => {
      this.onUpdateFlash()
    })
  }

  init(myBluetoothGatt: any, startColor: vec4) {
    this.bluetoothGatt = undefined
    this.baseService = undefined
    this.powerCharacteristic = undefined
    this.brightnessCharacteristic = undefined
    this.colorCharacteristic = undefined

    // Initialize state
    this.state.powerBool = true
    this.state.powerByteArray = new Uint8Array(1)
    this.state.brightnessNum = 1
    this.state.brightnessByteArray = new Uint8Array(1)
    this.state.nextBrightnessNum = undefined // Undefined flags no next brightness
    this.state.preFlashBrightnessNum = undefined
    this.state.colorVec = startColor
    this.state.colorByteArray = new Uint8Array(4) // We don't know the color yet
    this.state.nextColorVec = undefined // Undefined flags no next color

    // Set status visual
    this.lightStatusVisual.setColor(this.state.colorVec)

    // Register this visual with the Unique Color Service, which uses it to choose a unique start color for subsequent lights
    UniqueColorService.getInstance().registerLightVisualMat(this.lightStatusVisual.getSphereMat())

    if (global.deviceInfoSystem.isEditor() || LensInitializer.getInstance().isNoBleDebug) {
      return
    }

    this.updateFlashEvent.enabled = false

    this.bluetoothGatt = myBluetoothGatt as Bluetooth.BluetoothGatt
    if (this.bluetoothGatt) {
      try {
        this.baseService = this.bluetoothGatt.getService(HueLightData._baseServiceUUID)
        if (this.baseService) {
          try {
            this.powerCharacteristic = this.baseService.getCharacteristic(HueLightData._powerCharacteristicUUID)
          } catch (error) {
            reportError(error)
          }

          try {
            this.brightnessCharacteristic = this.baseService.getCharacteristic(
              HueLightData._brightnessCharacteristicUUID
            )
          } catch (error) {
            reportError(error)
          }

          try {
            this.colorCharacteristic = this.baseService.getCharacteristic(HueLightData._colorCharacteristicUUID)
            if (this.colorCharacteristic) {
              this.setColor(startColor)
            }
          } catch (error) {
            reportError(error)
          }
        }
      } catch (error) {
        reportError(error)
      }
    } else {
      this.logger.warn("gatt undefined " + this.bluetoothGatt)
    }
  }

  // In this case, update only handles flash.  We enable/disable event to control flash
  private onUpdateFlash() {
    // Emphasize highs and lows
    let flash = Math.sin(7 * getTime())
    const rimCrush = 0.5
    flash = rimCrush * (flash + 1)
    if (flash > rimCrush / 2) {
      flash += 1 - rimCrush / 2
    }
    flash = Math.min(1, Math.max(flash, 0))

    // Note: here is a bug where values >127 (half brightness) are invalid after a UTF-8 conversion
    this.setNextBrightness(flash)
  }

  // true or false
  togglePower(on: boolean) {
    this.updateFlashEvent.enabled = false

    this.state.powerBool = on
    this.lightStatusVisual.turnOn(this.state.powerBool)

    if (this.state.powerByteArray !== undefined && this.state.powerByteArray.length > 0) {
      this.state.powerByteArray[0] = on ? 1 : 0
      if (this.powerCharacteristic) {
        this.powerCharacteristic
          .writeValue(this.state.powerByteArray)
          .then(() => {})
          .catch((error) => {
            reportError(error)
          })
      }
    }
  }

  // We need these states in order to minimize ble messages while dragging.
  // However, sometimes we drop a read receipt - meaning the state is never reset to false
  // So we reset the states when input buttons are toggled as a fallback.
  resetBrightnessAndColorStates() {
    this.inSetBrightnessState = false
    this.inSetColorState = false
  }

  // Called from slider UI
  // From 0 to 1
  setBrightnessUI(val: number) {
    this.updateFlashEvent.enabled = false
    this.setNextBrightness(val)
  }

  private setNextBrightness(val: number) {
    if (global.deviceInfoSystem.isEditor() || LensInitializer.getInstance().isNoBleDebug) {
      this.lightStatusVisual.setBrightness(val)
    }

    if (!this.inSetBrightnessState) {
      this.inSetBrightnessState = true
      this.state.nextBrightnessNum = val
      this.setBrightness(this.state.nextBrightnessNum)
    } else {
      // Else only set the next brightness -- the promise will write once the last message has been received
      this.state.nextBrightnessNum = val
    }
  }

  private setBrightness(val: number) {
    this.state.brightnessNum = val

    // Brightness goes from 1 to 254
    this.state.brightnessByteArray = this.brightnessToHueByteArray(val)

    if (this.brightnessCharacteristic) {
      this.brightnessCharacteristic
        .writeValue(this.state.brightnessByteArray)
        .then(() => {
          this.lightStatusVisual.setBrightness(this.state.brightnessNum)

          // Reduce messages on drag by only sending the latest next brightness once the last brightness has been set
          if (this.state.nextBrightnessNum) {
            const nextBrightnessNum = this.state.nextBrightnessNum
            this.state.nextBrightnessNum = undefined
            this.setBrightness(nextBrightnessNum)
          } else {
            this.inSetBrightnessState = false
          }
        })
        .catch((error) => {
          reportError(error)
        })
    } else {
      if (global.deviceInfoSystem.isEditor() || LensInitializer.getInstance().isNoBleDebug) {
        this.state.nextBrightnessNum = undefined
      }
    }
  }

  // Called from LightUI.ts
  // rgba from 0 to 1
  setColorUI(color: vec4) {
    this.updateFlashEvent.enabled = false

    if (global.deviceInfoSystem.isEditor() || LensInitializer.getInstance().isNoBleDebug) {
      this.lightStatusVisual.setColor(color)
    } else {
      // If the next color is currently undefined, then set it and write
      if (!this.inSetColorState) {
        this.state.nextColorVec = color
        this.inSetColorState = true
        CursorVisualHelper.getInstance().showCursor(false)

        // Make the first call.  Subsequent calls will be made in the promise.
        this.setColor(this.state.nextColorVec)
      }
      // Else only set the next color -- the promise will write once the last message has been received
      else {
        this.state.nextColorVec = color
      }
    }
  }

  private setColor(color: vec4) {
    // Store state
    this.state.colorVec = color

    // Convert color for ble light and store state
    const colorXY = this.RGBtoXY(color.r, color.g, color.b)
    this.state.colorByteArray = this.xyToByteArray(colorXY.x, colorXY.y)

    if (this.colorCharacteristic) {
      this.colorCharacteristic
        .writeValue(this.state.colorByteArray)
        .then(() => {
          this.lightStatusVisual.setColor(this.state.colorVec)

          // Reduce messages on drag by only sending the latest next color once the last color has been set
          if (this.state.nextColorVec) {
            const nextColorVec = this.state.nextColorVec
            this.state.nextColorVec = undefined // This is a flag
            this.setColor(nextColorVec)
          } else {
            this.inSetColorState = false
            CursorVisualHelper.getInstance().showCursor(true)
          }
        })
        .catch((error) => {
          reportError(error)
        })
    } else {
      if (global.deviceInfoSystem.isEditor() || LensInitializer.getInstance().isNoBleDebug) {
        this.state.nextColorVec = undefined
      }
    }
  }

  private xyToByteArray(x: number, y: number): Uint8Array {
    // Use the Y value of XYZ as brightness The Y value indicates the brightness of the converted color.

    // Scale to 16-bit unsigned range
    const x16 = Math.round(x * 0xffff)
    const y16 = Math.round(y * 0xffff)

    // Encode as little-endian byte array
    const data = new Uint8Array(4)
    data[0] = x16 & 0xff
    data[1] = (x16 >> 8) & 0xff
    data[2] = y16 & 0xff
    data[3] = (y16 >> 8) & 0xff

    // BUG: It SHOULD be to 255, but due to a serialization bug, we only have half the color range
    data[0] = Math.min(127, Math.max(1, data[0]))
    data[1] = Math.min(127, Math.max(1, data[1]))
    data[2] = Math.min(127, Math.max(1, data[2]))
    data[3] = Math.min(127, Math.max(1, data[3]))

    return data
  }

  private brightnessToHueByteArray(brightness: number): Uint8Array {
    // Clamp brightness between 0.0 and 1.0
    this.logger.debug("brightnessToHueByteArray brightness " + brightness)
    brightness = Math.max(0, Math.min(1, brightness))

    // Due to a serialization bug, we only have half the brightness range
    // Scale brightness to 0–safeBytes[safeBytes.length - 1]
    const index = Math.round(brightness * (this.safeBytes.length - 1))
    const byte = this.safeBytes[index]
    this.logger.debug("brightnessToHueByteArray byte " + byte)

    return new Uint8Array([byte])
  }

  // Reference: https://github.com/PhilipsHue/PhilipsHueSDK-iOS-OSX/blob/00187a3db88dedd640f5ddfa8a474458dff4e1db/ApplicationDesignNotes/RGB%20to%20xy%20Color%20conversion.md
  private RGBtoXY(r: number, g: number, b: number) {
    // Clamp
    r = Math.max(0, Math.min(1, r))
    g = Math.max(0, Math.min(1, g))
    b = Math.max(0, Math.min(1, b))

    // Apply Gamma
    r = r > 0.04045 ? Math.pow((r + 0.055) / (1.0 + 0.055), 2.4) : r / 12.92
    g = g > 0.04045 ? Math.pow((g + 0.055) / (1.0 + 0.055), 2.4) : g / 12.92
    b = b > 0.04045 ? Math.pow((b + 0.055) / (1.0 + 0.055), 2.4) : b / 12.92

    // Convert to XYZ using the Wide RGB D65 conversion formula
    const X = r * 0.649926 + g * 0.103455 + b * 0.197109
    const Y = r * 0.234327 + g * 0.743075 + b * 0.022598
    const Z = r * 0.0 + g * 0.053077 + b * 1.035763

    let cx = X / (X + Y + Z)
    let cy = Y / (X + Y + Z)

    // For the hue bulb the corners of the triangle are:
    // Red: 0.675, 0.322
    // Green: 0.4091, 0.518
    // Blue: 0.167, 0.04

    // Clamp with the closest point on the color gamut triangle
    // TODO: find the closest valid point rather than clamping
    cx = Math.max(0.167, Math.min(0.675, cx))
    cy = Math.max(0.04, Math.min(0.518, cy))

    this.logger.debug("RGBtoXY " + cx + " " + cy)

    return new vec2(cx, cy)
  }

  setFlash(on: boolean) {
    this.logger.debug("setFlash " + on)

    if (on) {
      this.state.preFlashBrightnessNum = this.state.brightnessNum
      this.updateFlashEvent.enabled = true
    } else {
      this.updateFlashEvent.enabled = false

      // Reset brightness
      this.state.nextBrightnessNum = undefined
      this.setNextBrightness(this.state.preFlashBrightnessNum)
    }
  }
}
