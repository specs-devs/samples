/**
 * Specs Inc. 2026
 * ScanResult — wraps an existing grid button SceneObject to act as a BLE device card.
 * Discovers UI children (RectangleButton, Image, Text) from the given SceneObject
 * instead of relying on prefab instantiation.
 */
import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {setTimeout} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {reportError} from "../Helpers/ErrorUtils"
import {RotateScreenTransform} from "../Helpers/RotateScreenTransform"
import {BleServiceHandler} from "./BleServiceHandler"
import {ControllerFactory} from "./ControllerFactory"
import {LensInitializer} from "./LensInitializer"
import {ScanResultsManager} from "./ScanResultsManager"
import {Widget} from "./Widget"

enum ScanResultState {
  ScanSuccess = "Found",
  Connecting = "Connecting...",
  ConnectionSuccess = "Connected",
  ConnectionFailure = "Failed",
  Disconnected = "Disconnected"
}

export enum ScanResultType {
  Light = "light",
  Hrm = "hrm",
  Climate = "climate",
  Unknown = "unknown"
}

export interface ScanResultTextures {
  lightTex?: Texture
  hrmTex?: Texture
  climateTex?: Texture
  unknownTex?: Texture
  connectedTex?: Texture
  disconnectedTex?: Texture
}

export class ScanResult {
  private so: SceneObject
  private toggleButton: RectangleButton
  private nameText: Text
  private detailsText: Text
  private logoImage: Image
  private connectionImage: Image

  private textures: ScanResultTextures
  private logger: Logger

  public deviceName: string
  public deviceAddress: Uint8Array

  private logoMat: Material
  private connectionMat: Material
  private rotateScript: RotateScreenTransform

  private scanResultsManager: ScanResultsManager
  private bluetoothGatt: Bluetooth.BluetoothGatt
  private bleServiceHandler: BleServiceHandler

  private controllerFactory: ControllerFactory
  private widget: Widget

  private onConnectionStateChangedEventRemover: any

  private type: ScanResultType
  private isFirstConnectAttempt: boolean
  private isSettingSelectionFromCode: boolean = false

  constructor(sceneObject: SceneObject, textures: ScanResultTextures, enableLogging: boolean) {
    this.so = sceneObject
    this.textures = textures
    this.logger = new Logger("ScanResult", enableLogging, true)
    this.type = undefined
    this.widget = undefined
    this.onConnectionStateChangedEventRemover = undefined
    this.isFirstConnectAttempt = true

    this.discoverUiElements()
  }

  private discoverUiElements(): void {
    // Find RectangleButton component on the scene object itself
    this.toggleButton = this.so.getComponent(RectangleButton.getTypeName()) as RectangleButton

    // Traverse children to find Image (logo) and Text (name, details) components
    // Lens Studio uses "Text" and "Image" as component type names (not "Component.Text")
    const texts: Text[] = []
    for (let i = 0; i < this.so.getChildrenCount(); i++) {
      const child: SceneObject = this.so.getChild(i)
      const childName: string = child.name

      const img: Image = child.getComponent("Image") as Image
      if (img && !this.logoImage) {
        this.logoImage = img
        this.logger.debug("Found logo Image on child: " + childName)
      }

      const txt: Text = child.getComponent("Text") as Text
      if (txt) {
        texts.push(txt)
        this.logger.debug("Found Text on child: " + childName + " text=" + txt.text)
      }
    }

    // First Text child is device name, second is status/details
    if (texts.length >= 1) this.nameText = texts[0]
    if (texts.length >= 2) this.detailsText = texts[1]

    this.logger.debug("discoverUiElements: found " + texts.length + " Text, logoImage=" + (this.logoImage !== undefined))

    // Clone logo material so each card can swap its texture independently
    if (this.logoImage) {
      this.logoMat = this.logoImage.mainMaterial.clone()
      this.logoImage.mainMaterial = this.logoMat
    }

    // Wire toggle button for selection
    // NOTE: buttons must have _toggleable=true set in the Inspector to avoid
    // runtime conversion which causes visual artifacts (state machine rebuild).
    if (this.toggleButton) {
      this.toggleButton.setIsToggleable(true)
      this.toggleButton.onValueChange.add((val: number) => {
        this.onToggleSelection(val === 1)
      })
    } else {
      this.logger.warn("No RectangleButton found on grid slot: " + this.so.name)
    }

    if (!this.nameText) {
      this.logger.warn("No name Text child found on grid slot: " + this.so.name)
    }
    if (!this.detailsText) {
      this.logger.warn("No details Text child found on grid slot: " + this.so.name)
    }
  }

  getSceneObject(): SceneObject {
    return this.so
  }

  init(
    scanResultsManager: ScanResultsManager,
    bleServiceHandler: BleServiceHandler,
    controllerFactory: ControllerFactory,
    scanResult: Bluetooth.ScanResult,
    isShown: boolean
  ): void {
    this.scanResultsManager = scanResultsManager
    this.bleServiceHandler = bleServiceHandler
    this.controllerFactory = controllerFactory

    this.deviceName = scanResult ? scanResult.deviceName : "Test Device"
    this.deviceAddress = scanResult ? scanResult.deviceAddress : new Uint8Array(0)

    this.show(isShown)

    // Delay text update so UIKit button async initialization settles first
    setTimeout(() => {
      this.setStatusMessage(ScanResultState.ScanSuccess)
      this.logger.debug("Delayed init: nameText='" + (this.nameText ? this.nameText.text : "NULL") + "' detailsText='" + (this.detailsText ? this.detailsText.text : "NULL") + "'")
    }, 0.1)
  }

  show(show: boolean): void {
    this.so.enabled = show
  }

  private onToggleSelection(on: boolean): void {
    if (this.isSettingSelectionFromCode) return
    if (on) {
      if (!this.type) {
        this.tryConnect()
      } else {
        if (this.bluetoothGatt && this.bluetoothGatt.connectionState.toString() === "0") {
          this.tryConnect()
        } else {
          this.scanResultsManager.selectMeAndDeselectOthers(this)
        }
      }
    } else {
      this.setSelectionBackgroundAndWidgetUi(false)
    }
  }

  public tryConnect(): void {
    this.logger.info("tryConnect " + this.deviceName)
    this.setStatusMessage(ScanResultState.Connecting)

    if (this.connectionMat && this.textures.disconnectedTex) {
      this.connectionMat.mainPass.baseTex = this.textures.disconnectedTex
    }
    if (this.rotateScript) {
      this.rotateScript.startRotate()
    }

    if (global.deviceInfoSystem.isEditor() || LensInitializer.getInstance().isNoBleDebug) {
      this.onConnectSuccess()
    } else {
      this.bleServiceHandler.bluetoothModule
        .connectGatt(this.deviceAddress)
        .then((result) => {
          this.bluetoothGatt = result as Bluetooth.BluetoothGatt
          this.onConnectSuccess()
        })
        .catch((error) => {
          reportError(error)
          this.onConnectFailure()
        })
    }
  }

  private onConnectSuccess(): void {
    this.logger.info("onConnectSuccess " + this.deviceName)
    this.checkFirstConnectAttempt()
    this.setStatusMessage(ScanResultState.ConnectionSuccess)
    this.setConnectionIconUi(true)

    if (global.deviceInfoSystem.isEditor() || LensInitializer.getInstance().isNoBleDebug) {
      if (!this.widget) {
        this.onWidgetAssigned(this.controllerFactory.create(undefined))
      } else {
        this.scanResultsManager.selectMeAndDeselectOthers(this)
      }
    } else {
      if (!this.widget) {
        this.onConnectionStateChangedEventRemover = this.bluetoothGatt.onConnectionStateChangedEvent.add((arg) =>
          this.onConnectionStateChanged(arg)
        )
        this.onWidgetAssigned(this.controllerFactory.create(this.bluetoothGatt))
      } else {
        this.scanResultsManager.selectMeAndDeselectOthers(this)
      }
    }
  }

  private onConnectFailure(): void {
    this.logger.warn("onConnectFailure " + this.deviceName)
    this.checkFirstConnectAttempt()
    this.setStatusMessage(ScanResultState.ConnectionFailure)
    this.setConnectionIconUi(false)
  }

  private checkFirstConnectAttempt(): void {
    if (this.isFirstConnectAttempt) {
      this.isFirstConnectAttempt = false
      this.scanResultsManager.tryNextAutoConnect(this)
    }
  }

  private onWidgetAssigned(widget: Widget): void {
    this.widget = widget
    if (this.widget) {
      this.type = widget.getType()
      this.updateLogoForType(this.type)
    } else {
      this.type = ScanResultType.Unknown
      this.updateLogoForType(ScanResultType.Unknown)
    }
    this.scanResultsManager.registerScanResultType(this, this.type)
    this.scanResultsManager.selectMeAndDeselectOthers(this)
  }

  private updateLogoForType(type: ScanResultType): void {
    if (!this.logoMat) return
    const tex: Texture =
      type === ScanResultType.Light ? this.textures.lightTex :
      type === ScanResultType.Hrm ? this.textures.hrmTex :
      type === ScanResultType.Climate ? this.textures.climateTex :
      this.textures.unknownTex
    if (tex) this.logoMat.mainPass.baseTex = tex
  }

  private onConnectionStateChanged(arg: Bluetooth.ConnectionStateChangedEvent): void {
    if (arg.state.toString() === "0") {
      this.setStatusMessage(ScanResultState.Disconnected)
      this.setConnectionIconUi(false)
    } else if (arg.state.toString() === "1") {
      this.setStatusMessage(ScanResultState.ConnectionSuccess)
      this.setConnectionIconUi(true)
    }
  }

  private setConnectionIconUi(connected: boolean): void {
    if (this.connectionMat) {
      this.connectionMat.mainPass.baseTex = connected ? this.textures.connectedTex : this.textures.disconnectedTex
    }
    if (this.rotateScript) {
      this.rotateScript.endRotate()
    }
  }

  setSelectionBackgroundAndWidgetUi(select: boolean): void {
    // Keep all connected widgets visible — only update button highlight state
    if (this.toggleButton && this.toggleButton.isOn !== select) {
      this.isSettingSelectionFromCode = true
      this.toggleButton.toggle(select)
      this.isSettingSelectionFromCode = false
    }
  }

  // Show or hide this device's widget explicitly
  showWidget(show: boolean): void {
    if (this.widget) {
      this.widget.show(show)
    }
  }

  private setStatusMessage(msg: string): void {
    if (this.nameText) this.nameText.text = this.deviceName ?? ""
    if (this.detailsText) this.detailsText.text = msg
    this.logger.debug((this.deviceName ?? "") + " | " + msg)
  }
}
