/**
 * Specs Inc. 2026
 * ScanResultsManager — uses pre-existing grid button slots for scan results.
 * Instead of instantiating prefabs, wraps existing GridLayout children with
 * ScanResult instances when BLE devices are discovered.
 */
import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {GridLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/GridLayout/GridLayout"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {HelperFuntions} from "../Helpers/HelperFunctions"
import {BleServiceHandler} from "./BleServiceHandler"
import {ControllerFactory} from "./ControllerFactory"
import {LensInitializer} from "./LensInitializer"
import {HeartRateMonitorData, HueLightData, Thingy52Data} from "./PeripheralTypeData"
import {ScanResult, ScanResultTextures, ScanResultType} from "./ScanResult"

@component
export class ScanResultsManager extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ScanResultsManager – scan result card manager</span><br/><span style="color: #94A3B8; font-size: 11px;">Uses existing GridLayout button children as slots for discovered BLE devices.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("GridLayout scene object — existing button children are used as device card slots.")
  gridLayoutParent: SceneObject

  @allowUndefined
  @input
  @hint("Rectangle button (Toggleable on) that enables filtering to show only known device types")
  filterButtonToggle: RectangleButton

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Type Icons</span>')
  @allowUndefined
  @input
  @hint("Icon texture for Hue light peripheral type")
  lightTex: Texture

  @allowUndefined
  @input
  @hint("Icon texture for heart rate monitor peripheral type")
  hrmTex: Texture

  @allowUndefined
  @input
  @hint("Icon texture for climate sensor peripheral type")
  climateTex: Texture

  @allowUndefined
  @input
  @hint("Icon texture for unknown peripheral type")
  unknownTex: Texture

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Connection Icons</span>')
  @allowUndefined
  @input
  @hint("Texture shown on the connection image when the device is connected")
  connectedTex: Texture

  @allowUndefined
  @input
  @hint("Texture shown on the connection image when the device is disconnected")
  disconnectedTex: Texture

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @input
  @hint("Maximum number of scan result cards to display (capped by actual grid children count)")
  maxSlots: number = 12

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private bleServiceHandler: BleServiceHandler
  private controllerFactory: ControllerFactory

  private gridLayout: GridLayout

  // Pre-existing button SceneObjects used as card slots
  private slotObjects: SceneObject[]
  private nextSlotIndex: number

  // Typed result arrays for filtering and auto-connect
  private lightScanResults: ScanResult[]
  private hrmScanResults: ScanResult[]
  private climateScanResults: ScanResult[]
  private unknownScanResults: ScanResult[]
  private untypedScanResults: ScanResult[]

  private autoConnectScanResults: ScanResult[]
  private autoConnectIndex: number

  onAwake() {
    this.logger = new Logger("ScanResultsManager", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.slotObjects = []
    this.nextSlotIndex = 0
    this.lightScanResults = []
    this.hrmScanResults = []
    this.climateScanResults = []
    this.unknownScanResults = []
    this.untypedScanResults = []
    this.autoConnectScanResults = []
    this.autoConnectIndex = 0
  }

  @bindStartEvent
  onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")

    this.gridLayout = this.gridLayoutParent.getComponent(GridLayout.getTypeName()) as GridLayout

    // Read existing children as available slots (do NOT destroy them)
    // Keep them enabled — text updates do not render on disabled SceneObjects
    const children: SceneObject[] = this.gridLayoutParent.children
    const slotCount: number = Math.min(children.length, this.maxSlots)
    for (let i = 0; i < slotCount; i++) {
      this.slotObjects.push(children[i])
    }

    this.logger.info("Initialized with " + this.slotObjects.length + " grid button slots")

    // Self-wire the filter button so no editor callback wiring is needed
    if (this.filterButtonToggle) {
      this.filterButtonToggle.setIsToggleable(true)
      this.filterButtonToggle.onValueChange.add((val) => this.onFilterToggle(val === 1))
    }
  }

  init(myBleServiceHandler: BleServiceHandler, myControllerFactory: ControllerFactory) {
    this.bleServiceHandler = myBleServiceHandler
    this.controllerFactory = myControllerFactory
    this.bleServiceHandler.startScan.add(() => this.onStartScan())
    this.bleServiceHandler.scanResult.add((arg) => this.onScanResult(arg))
    this.bleServiceHandler.stopScan.add(() => this.onStopScan())
  }

  onStartScan() {}

  onScanResult(myScanResult: Bluetooth.ScanResult) {
    if (this.nextSlotIndex >= this.slotObjects.length) {
      this.logger.warn("No available grid slots (" + this.nextSlotIndex + "/" + this.slotObjects.length + ")")
      return
    }

    // Take the next available slot and wrap it with a ScanResult
    const slotSo: SceneObject = this.slotObjects[this.nextSlotIndex]
    this.nextSlotIndex++

    const textures: ScanResultTextures = {
      lightTex: this.lightTex,
      hrmTex: this.hrmTex,
      climateTex: this.climateTex,
      unknownTex: this.unknownTex,
      connectedTex: this.connectedTex,
      disconnectedTex: this.disconnectedTex
    }

    const scanResult: ScanResult = new ScanResult(slotSo, textures, this.enableLogging)
    scanResult.init(this, this.bleServiceHandler, this.controllerFactory, myScanResult, true)
    this.untypedScanResults.push(scanResult)
    this.organizeScanResults()

    if (this.gridLayout) {
      this.gridLayout.layout()
    }
  }

  onStopScan() {
    this.autoConnectScanResults = []
    this.autoConnectIndex = 0

    for (let i = 0; i < this.untypedScanResults.length; i++) {
      if (
        HelperFuntions.strIncludes(this.untypedScanResults[i].deviceName, [
          HueLightData._commonDeviceNameSubstring,
          HeartRateMonitorData._commonDeviceNameSubstring,
          Thingy52Data._commonDeviceNameSubstring
        ])
      ) {
        this.autoConnectScanResults.push(this.untypedScanResults[i])
      }
    }

    this.tryNextAutoConnect(undefined)
  }

  tryNextAutoConnect(lastScanResult: ScanResult) {
    if (this.autoConnectScanResults.length > 0) {
      if (this.autoConnectIndex === 0) {
        this.autoConnectScanResults[this.autoConnectIndex].tryConnect()
        this.autoConnectIndex++
      } else if (this.autoConnectIndex < this.autoConnectScanResults.length) {
        if (lastScanResult !== undefined) {
          if (
            HelperFuntions.uint8ArrayCompare(
              lastScanResult.deviceAddress,
              this.autoConnectScanResults[this.autoConnectIndex - 1].deviceAddress
            )
          ) {
            this.autoConnectScanResults[this.autoConnectIndex].tryConnect()
            this.autoConnectIndex++
          }
        }
      }
    }
  }

  onFilterToggle(on: boolean) {
    this.organizeScanResults()
  }

  registerScanResultType(scanResult: ScanResult, type: string) {
    // Remove from untyped
    for (let i = 0; i < this.untypedScanResults.length; i++) {
      if (global.deviceInfoSystem.isEditor() || LensInitializer.getInstance().isNoBleDebug) {
        if (
          scanResult
            .getSceneObject()
            .uniqueIdentifier.includes(this.untypedScanResults[i].getSceneObject().uniqueIdentifier)
        ) {
          this.untypedScanResults.splice(i, 1)
          break
        }
      } else {
        if (HelperFuntions.uint8ArrayCompare(scanResult.deviceAddress, this.untypedScanResults[i].deviceAddress)) {
          this.untypedScanResults.splice(i, 1)
          break
        }
      }
    }

    if (type === ScanResultType.Light) {
      this.lightScanResults.push(scanResult)
    } else if (type === ScanResultType.Hrm) {
      this.hrmScanResults.push(scanResult)
    } else if (type === ScanResultType.Climate) {
      this.climateScanResults.push(scanResult)
    } else if (type === ScanResultType.Unknown) {
      this.unknownScanResults.push(scanResult)
    } else {
      this.logger.warn("registerScanResultType: unrecognized type " + type)
    }

    this.organizeScanResults()
  }

  selectMeAndDeselectOthers(selectedScanResult: ScanResult) {
    const all: ScanResult[] = this.allResults()
    for (const result of all) {
      const isSelected: boolean =
        global.deviceInfoSystem.isEditor() || LensInitializer.getInstance().isNoBleDebug
          ? result.getSceneObject().uniqueIdentifier.includes(selectedScanResult.getSceneObject().uniqueIdentifier)
          : HelperFuntions.uint8ArrayCompare(result.deviceAddress, selectedScanResult.deviceAddress)

      result.setSelectionBackgroundAndWidgetUi(isSelected)
    }
  }

  private organizeScanResults() {
    const isFiltering: boolean = this.filterButtonToggle?.isOn ?? false

    // Known types are always shown
    for (const r of this.lightScanResults) r.show(true)
    for (const r of this.hrmScanResults) r.show(true)
    for (const r of this.climateScanResults) r.show(true)
    for (const r of this.unknownScanResults) r.show(true)

    // Untyped (pre-connection) are hidden when filter is active
    for (const r of this.untypedScanResults) r.show(!isFiltering)
  }

  private allResults(): ScanResult[] {
    return [
      ...this.lightScanResults,
      ...this.hrmScanResults,
      ...this.climateScanResults,
      ...this.unknownScanResults,
      ...this.untypedScanResults
    ]
  }
}
