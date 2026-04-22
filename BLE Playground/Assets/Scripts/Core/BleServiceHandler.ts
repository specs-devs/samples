/**
 * Specs Inc. 2026
 * v1.0 This class handles Ble Service start and stop scan events. It configures what we're scanning
 * for, and how those results are displayed. It manages the scan toggle button ui state. It makes sure
 * we're not scanning and connecting at the same time.
 */
import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {CancelToken, clearTimeout, setTimeout} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {reportError} from "../Helpers/ErrorUtils"
import {HelperFuntions} from "../Helpers/HelperFunctions"
import {LensInitializer} from "./LensInitializer"

@component
export class BleServiceHandler extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">BleServiceHandler – BLE scan & stop scan manager</span><br/><span style="color: #94A3B8; font-size: 11px;">Handles BLE scanning, result dispatch and scan toggle button state.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Bluetooth central module for BLE operations")
  bluetoothModule: Bluetooth.BluetoothCentralModule

  @input
  @hint("Rectangle button (Toggleable on) for starting and stopping scans")
  scanToggle: RectangleButton

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  get startScan() {
    return this.startScanEvent.publicApi()
  }
  get scanResult() {
    return this.scanResultEvent.publicApi()
  }
  get stopScan() {
    return this.stopScanEvent.publicApi()
  }

  private startScanEvent: Event = new Event()
  private scanResultEvent: Event<any> = new Event()
  private stopScanEvent: Event = new Event()

  // Note: these are type Bluetooth.ScanResult, not type ScanResult
  private allScanSessionBluetoothScanResults: Bluetooth.ScanResult[]

  private isScanning: boolean

  private timeoutCancelToken: CancelToken

  onAwake() {
    this.logger = new Logger("BleServiceHandler", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.isScanning = false
    this.allScanSessionBluetoothScanResults = []

    // Self-wire the scan toggle button so no editor callback wiring is needed
    this.createEvent("OnStartEvent").bind(() => {
      if (this.scanToggle) {
        this.scanToggle.setIsToggleable(true)
        this.scanToggle.onValueChange.add((val) => this.onScanToggle(val === 1))
      }
    })
  }

  // Called from the scan toggle button onValueChange and when code calls scanToggle.toggle()
  onScanToggle(on: boolean) {
    if (on) {
      this.onStartScan()
    } else {
      this.onStopScan()
    }

  }

  private onStartScan() {
    // Reset
    this.isScanning = true

    // Debug or Editor
    if (global.deviceInfoSystem.isEditor() || LensInitializer.getInstance().isNoBleDebug) {
      this.logger.debug("BleServiceHandler onStartScan in editor or debug.")
      this.startScanEvent.invoke()
      this.timeoutCancelToken = setTimeout(() => {
        clearTimeout(this.timeoutCancelToken)
    this.scanToggle.toggle(false)
      this.onScanResult(undefined)
      }, 0.5)
    }
    // Ble on Device
    else {
      this.logger.debug("BleServiceHandler onStartScan on Spectacles - multiple devices flow.")

      // This empty filter returns every result
      const genericFilter = new Bluetooth.ScanFilter()

      const scanSettings = new Bluetooth.ScanSettings()
      scanSettings.uniqueDevices = true
      scanSettings.timeoutSeconds = 10

      // Note: startScan is an async function.  You can use the following syntax OR async/await syntax.
      this.bluetoothModule
        .startScan(
          [genericFilter],
          scanSettings,
          // I hit this predicate function with EVERY scan result
          // If this.predicate returns true ANYWHERE IN THE ENSUING CALLSTACK, the scan will stop
          // If this.predicate returns false ANYWHERE IN THE ENSUING CALLSTACK, the scan will continue until timeout
          (result) => this.predicate(result)
        )
        // Note: if you use the second error callback parameter in .then, your error will catch there INSTEAD of in catch -- use one or the other.
        .then((result) => {
          // Fires ONLY when the predicate resolves with true
          // Set isScanning false first to prevent onStopScan from calling stopScan again
          this.isScanning = false
          this.scanToggle.toggle(false)
          this.stopScanEvent.invoke()
          this.logger.info("startScan scan is over -- success -- .then " + result)
        })
        .catch((error) => {
          // Fires on calling bluetoothModule.stopScan() AND on scan timing out
          this.isScanning = false
          this.scanToggle.toggle(false)
          this.stopScanEvent.invoke()
          this.logger.info("startScan scan is over -- stop, timeout, or error -- .catch " + error)
          reportError(error)
        })
    }
  }

  private predicate(result?: Bluetooth.ScanResult) {
    this.logger.debug("predicate " + result)

    // NOTE: If you return true in this event stack,
    // the scan will receive "true" from the predicate,
    // and the scan will stop.
    this.onScanResult(result)
    // Returning "false" from the predicate continues the scan until timeout
    return false
  }

  // Determine if we add result to our lists, which we can act on when the scan stops
  private onScanResult(scanResult?: Bluetooth.ScanResult) {
    this.logger.debug("onScanResults\n" + scanResult)

    // Debug or Editor
    if (global.deviceInfoSystem.isEditor() || LensInitializer.getInstance().isNoBleDebug) {
      this.scanToggle.toggle(false)
      this.logger.debug("onScanResults in editor debug\n" + scanResult)
      const testCount = 30
      for (let i = 0; i < testCount; i++) {
        this.scanResultEvent.invoke(scanResult)
      }
    }
    // Ble on Device
    else if (scanResult) {
      if (scanResult.deviceName !== undefined && scanResult.deviceName !== "") {
        if (this.allScanSessionBluetoothScanResults.length > 0) {
          // Check if this results is already stored from a prior scan session.
          let alreadyExists: boolean = false
          for (let i = 0; i < this.allScanSessionBluetoothScanResults.length; i++) {
            if (
              HelperFuntions.uint8ArrayCompare(
                scanResult.deviceAddress,
                this.allScanSessionBluetoothScanResults[i].deviceAddress
              )
            ) {
              this.logger.debug(
                "onScanResults in loop same address as\n" +
                  this.allScanSessionBluetoothScanResults[i].deviceAddress
              )
              alreadyExists = true
              break
            }
          }
          if (!alreadyExists) {
            this.addScanResult(scanResult)
          }
        } else {
          this.addScanResult(scanResult)
        }
      }
    }
  }

  // Add result to our lists to act on when the scan stops
  private addScanResult(scanResult: Bluetooth.ScanResult) {
    this.allScanSessionBluetoothScanResults.push(scanResult)
    this.scanResultEvent.invoke(scanResult)
    this.logger.debug("onScanResults pushing\n" + scanResult.deviceName)
  }

  // Called from scanToggle, which could be set by user or by code.
  private onStopScan() {
    this.logger.debug("onStopScan isScanning " + this.isScanning)
    if (this.isScanning) {
      if (!global.deviceInfoSystem.isEditor()) {
        this.bluetoothModule.stopScan()
      }
      this.isScanning = false
      this.stopScanEvent.invoke()
    }
  }
}
