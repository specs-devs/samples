/**
 * Specs Inc. 2026
 * Heart Rate Controller for the BLE Playground Spectacles lens experience.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {HeartRateMonitorData} from "../Core/PeripheralTypeData"
import {reportError} from "../Helpers/ErrorUtils"

@component
export class HeartRateController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">HeartRateController – heart rate monitor data receiver</span><br/><span style="color: #94A3B8; font-size: 11px;">Subscribes to BLE heart rate measurement notifications and updates the display text.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">UI References</span>')
  @input
  @hint("Text component displaying the current heart rate value in BPM")
  text: Text

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
  private baseService: Bluetooth.BluetoothGattService = undefined
  private heartRateCharacteristic: Bluetooth.BluetoothGattCharacteristic = undefined

  onAwake() {
    this.logger = new Logger("HeartRateController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  init(myBluetoothGatt: Bluetooth.BluetoothGatt) {
    this.bluetoothGatt = myBluetoothGatt
    if (this.bluetoothGatt) {
      this.logger.debug("gatt defined " + this.bluetoothGatt)

      try {
        this.baseService = this.bluetoothGatt.getService(HeartRateMonitorData._serviceUUIDHR)
        if (this.baseService) {
          this.logger.debug("base service defined " + this.baseService)

          try {
            this.heartRateCharacteristic = this.baseService.getCharacteristic(HeartRateMonitorData._charUUIDHR)
            if (this.heartRateCharacteristic) {
              this.logger.debug("char defined " + this.heartRateCharacteristic.uuid)
              this.registerHeartRate()
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

  registerHeartRate() {
    this.heartRateCharacteristic
      .registerNotifications((arg) => this.heartRateNotification(arg))
      .catch((error) => {
        this.logger.error("registerHeartRate error " + error)
      })
      .then(() => {
        this.logger.debug("registerHeartRate then")
      })
  }

  heartRateNotification(val: Uint8Array) {
    this.logger.debug("heartRateNotification val " + val)

    if (val) {
      if (val.length > 0) {
        this.logger.debug("heartRateNotification val len " + val.length)
        this.text.text = val[1].toString()
      }
    }
  }
}
