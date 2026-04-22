/**
 * Specs Inc. 2026
 * Climate Controller for the BLE Playground Spectacles lens experience.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {Thingy52Data} from "../Core/PeripheralTypeData"
import {reportError} from "../Helpers/ErrorUtils"

@component
export class ClimateController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ClimateController – Thingy52 climate data receiver</span><br/><span style="color: #94A3B8; font-size: 11px;">Subscribes to temperature, humidity and air quality BLE notifications from a Nordic Thingy52.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">UI References</span>')
  @input
  @hint("Text component displaying current temperature value")
  temperatureValueText: Text

  @input
  @hint("Text component displaying current humidity value")
  humidityValueText: Text

  @input
  @hint("Text component displaying current air quality value")
  airqualityValueText: Text

  @input
  @hint("Scene object for the rotation decoration visual")
  rotationBox: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private bluetoothGatt: Bluetooth.BluetoothGatt = undefined
  private weatherService: Bluetooth.BluetoothGattService = undefined
  private temperatureCharacteristic: Bluetooth.BluetoothGattCharacteristic = undefined
  private humidityCharacteristic: Bluetooth.BluetoothGattCharacteristic = undefined
  private airQualityCharacteristic: Bluetooth.BluetoothGattCharacteristic = undefined

  onAwake() {
    this.logger = new Logger("ClimateController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  init(myBluetoothGatt: Bluetooth.BluetoothGatt) {
    this.bluetoothGatt = myBluetoothGatt
    if (this.bluetoothGatt) {
      this.logger.debug("gatt defined " + this.bluetoothGatt)

      try {
        this.weatherService = this.bluetoothGatt.getService(Thingy52Data._weatherServiceUUID)
        if (this.weatherService) {
          this.logger.debug("weather service defined " + this.weatherService)

          try {
            this.temperatureCharacteristic = this.weatherService.getCharacteristic(Thingy52Data._temperatureCharUUID)
            if (this.temperatureCharacteristic) {
              this.logger.debug("temperatureCharacteristic defined " + this.temperatureCharacteristic.uuid)
              this.registerTemperature()
            }
          } catch (error) {
            reportError(error)
          }

          try {
            this.humidityCharacteristic = this.weatherService.getCharacteristic(Thingy52Data._humidityCharUUID)
            if (this.humidityCharacteristic) {
              this.logger.debug("humidityCharacteristic defined " + this.humidityCharacteristic.uuid)
              this.registerHumidity()
            }
          } catch (error) {
            reportError(error)
          }

          try {
            this.airQualityCharacteristic = this.weatherService.getCharacteristic(Thingy52Data._airqualityCharUUID)
            if (this.airQualityCharacteristic) {
              this.logger.debug("airQualityCharacteristic defined " + this.airQualityCharacteristic.uuid)
              this.registerAirQuality()
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

  registerTemperature() {
    this.temperatureCharacteristic
      .registerNotifications((arg) => this.temperatureNotification(arg))
      .catch((error) => {
        this.logger.error("registerTemperature error " + error)
      })
      .then(() => {
        this.logger.debug("registerTemperature then")
      })
  }

  temperatureNotification(val: Uint8Array) {
    this.logger.debug("temperatureNotification val " + val)
    if (val) {
      if (val.length > 0) {
        this.logger.debug("temperatureNotification val len " + val.length)
        this.temperatureValueText.text = val[0].toString()
      }
    }
  }

  registerHumidity() {
    this.humidityCharacteristic
      .registerNotifications((arg) => this.humidityNotification(arg))
      .catch((error) => {
        this.logger.error("registerHumidity error " + error)
      })
      .then(() => {
        this.logger.debug("registerHumidity then")
      })
  }

  humidityNotification(val: Uint8Array) {
    this.logger.debug("humidityNotification val " + val)
    if (val) {
      if (val.length > 0) {
        this.logger.debug("humidityNotification val len " + val.length)
        this.humidityValueText.text = val[0].toString() + "%"
      }
    }
  }

  registerAirQuality() {
    this.airQualityCharacteristic
      .registerNotifications((arg) => this.airQualityNotification(arg))
      .catch((error) => {
        this.logger.error("registerAirQuality error " + error)
      })
      .then(() => {
        this.logger.debug("registerAirQuality then")
      })
  }

  airQualityNotification(val: Uint8Array) {
    this.logger.debug("airQualityNotification val " + val)
    if (val) {
      if (val.length > 0) {
        this.logger.debug("airQualityNotification val len " + val.length)
        this.airqualityValueText.text = (val[0] + val[1]).toString()
      }
    }
  }
}
