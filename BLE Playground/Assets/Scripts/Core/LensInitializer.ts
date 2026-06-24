/**
 * Specs Inc. 2026
 * v1.0 Singleton. This class starts the lens. Initializes BleServiceHandler and ScanResultsHandler.
 * Selecting "isNoBleDebug" will utilize the debug renderer flow through the lens, without the ble
 * service. This is useful for debugging ui/art on device when you don't have the ble devices.
 */
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {BleServiceHandler} from "./BleServiceHandler"
import {ControllerFactory} from "./ControllerFactory"
import {ScanResultsManager} from "./ScanResultsManager"

@component
export class LensInitializer extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">LensInitializer – lens entry point singleton</span><br/><span style="color: #94A3B8; font-size: 11px;">Bootstraps BLE and scan manager. Enable isNoBleDebug to test UI without BLE hardware.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("BLE service handler responsible for scan operations")
  bleServiceHandler: BleServiceHandler

  @input
  @hint("Manager that spawns and organizes scan result UI elements")
  scanResultsManager: ScanResultsManager

  @input
  @hint("Factory that creates peripheral controllers from GATT data")
  controllerFactory: ControllerFactory

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Debug</span>')
  @input
  @hint("Simulate BLE scanning and connections without real hardware")
  isNoBleDebug: boolean

  public uiState = false

  private static instance: LensInitializer

  private constructor() {
    super()
  }

  public static getInstance(): LensInitializer {
    if (!LensInitializer.instance) {
      throw new Error("Trying to get LensInitializer instance, but it hasn't been set.  You need to call it later.")
    }
    return LensInitializer.instance
  }

  onAwake() {
    if (!LensInitializer.instance) {
      LensInitializer.instance = this
    } else {
      throw new Error("LensInitializer already has an instance.  Aborting.")
    }
  }

  @bindStartEvent
  onStart() {
    this.scanResultsManager.init(this.bleServiceHandler, this.controllerFactory)
  }
}
