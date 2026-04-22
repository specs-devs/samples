/**
 * Specs Inc. 2026
 * Controller Factory for the BLE Playground Spectacles lens experience.
 */
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {reportError} from "../Helpers/ErrorUtils"
import {ClimateController} from "../PeripheralClimate/ClimateController"
import {HeartRateController} from "../PeripheralHeartRate/HeartRateController"
import {LightController} from "../PeripheralLight/LightController"
import {LensInitializer} from "./LensInitializer"
import {HeartRateMonitorData, HueLightData, Thingy52Data} from "./PeripheralTypeData"
import {ScanResultType} from "./ScanResult"
import {Widget} from "./Widget"

@component
export class ControllerFactory extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ControllerFactory – peripheral controller spawner</span><br/><span style="color: #94A3B8; font-size: 11px;">Creates the appropriate widget and controller based on detected GATT services.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Prefabs</span>')
  @input
  @hint("Prefab for the generic peripheral widget container")
  pfbWidget: ObjectPrefab

  @input
  @hint("Prefab for the Hue light controller UI")
  pfbLightController: ObjectPrefab

  @input
  @hint("Prefab for the heart rate monitor controller UI")
  pfbHeartRateMonitorController: ObjectPrefab

  @input
  @hint("Prefab for the climate sensor controller UI")
  pfbClimateController: ObjectPrefab

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">References</span>')
  @allowUndefined
  @input
  @hint("Scene object used as position anchor for spawned widgets (optional — widgets spawn in front of camera if not set)")
  node: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private localPositionOffset = new vec3(0, 0, 0.5)
  private localScaleMult = 0.75
  private spawnDistance: number = 100

  onAwake() {
    this.logger = new Logger("ControllerFactory", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  private instantiateControllerContent(bluetoothGatt: Bluetooth.BluetoothGatt) {
    this.logger.debug("instantiateControllerContent " + bluetoothGatt)
    if (!global.deviceInfoSystem.isEditor() && !LensInitializer.getInstance().isNoBleDebug) {
      const gatt: Bluetooth.BluetoothGatt = bluetoothGatt as Bluetooth.BluetoothGatt

      try {
        const heartRateService = gatt.getService(HeartRateMonitorData._serviceUUIDHR)
        if (heartRateService) {
          this.logger.debug("instantiateControllerContent hrm " + heartRateService)
          return this.onFoundHRM(bluetoothGatt)
        }
      } catch (error) {
        reportError(error)
      }

      try {
        const climateService = gatt.getService(Thingy52Data._weatherServiceUUID)
        if (climateService) {
          this.logger.debug("instantiateControllerContent climate " + climateService)
          return this.onFoundClimate(bluetoothGatt)
        }
      } catch (error) {
        reportError(error)
      }

      try {
        const hueLightService = gatt.getService(HueLightData._baseServiceUUID)
        if (hueLightService) {
          this.logger.debug("instantiateControllerContent getService light " + hueLightService)
          return this.onFoundLight(bluetoothGatt)
        }
      } catch (error) {
        reportError(error)

        // This is our last stop to return undefined, which signals that we don't have a controller for this connection
        // NOTE: If you add more trycatch's, you need to put this in your last catch
        this.logger.warn("instantiateControllerContent can't find controller")
        return undefined
      }
    } else {
      // To debug ui in editor, this will spawn the ui, but it won't be functional
      // Select a random controller to test them all in editor
      const randomNumber = Math.random()
      this.logger.debug("instantiateControllerContent debug " + randomNumber)

      if (randomNumber < 0.25) {
        return this.onFoundLight(undefined)
      } else if (randomNumber < 0.5) {
        return this.onFoundHRM(undefined)
      } else if (randomNumber < 0.75) {
        return this.onFoundClimate(undefined)
      } else {
        return undefined
      }
    }
  }

  private onFoundLight(bluetoothGatt: Bluetooth.BluetoothGatt) {
    const widget = this.instantiateWidget()
    widget.init(this.node ?? null, ScanResultType.Light)

    const so = this.instantiateControllerContentHelper(this.pfbLightController, widget.getSceneObject())
    so.getTransform().setLocalScale(vec3.one().uniformScale(this.localScaleMult))
    const newLightController = so.getComponent("ScriptComponent") as LightController
    if (newLightController) {
      newLightController.init(bluetoothGatt, widget)
    }
    return widget
  }

  private onFoundHRM(bluetoothGatt: Bluetooth.BluetoothGatt) {
    const widget = this.instantiateWidget()
    widget.init(this.node ?? null, ScanResultType.Hrm)

    const so = this.instantiateControllerContentHelper(this.pfbHeartRateMonitorController, widget.getSceneObject())
    const newHeartRateController = so.getComponent("ScriptComponent") as HeartRateController
    if (newHeartRateController) {
      newHeartRateController.init(bluetoothGatt)
    }
    return widget
  }

  private onFoundClimate(bluetoothGatt: Bluetooth.BluetoothGatt) {
    const widget = this.instantiateWidget()
    widget.init(this.node ?? null, ScanResultType.Climate)

    const so = this.instantiateControllerContentHelper(this.pfbClimateController, widget.getSceneObject())
    const newClimateController = so.getComponent("ScriptComponent") as ClimateController
    if (newClimateController) {
      newClimateController.init(bluetoothGatt)
    }
    return widget
  }

  private instantiateControllerContentHelper(pfb: ObjectPrefab, uiSo: SceneObject) {
    const so = pfb.instantiate(uiSo)
    const tr = so.getTransform()
    tr.setLocalPosition(this.localPositionOffset)
    tr.setLocalRotation(quat.quatIdentity())
    tr.setLocalScale(vec3.one())
    return so
  }

  private instantiateWidget() {
    const so = this.pfbWidget.instantiate(null)
    const tr = so.getTransform()

    // Spawn in front of user using Solver pattern: flattened forward on XZ plane
    const cam: Camera = WorldCameraFinderProvider.getInstance().getComponent()
    const camTr: Transform = cam.getSceneObject().getTransform()
    const camPos: vec3 = camTr.getWorldPosition()
    const camRot: quat = camTr.getWorldRotation()

    // Get camera forward and flatten to XZ plane (ignore head tilt)
    const rawForward: vec3 = camRot.multiplyVec3(new vec3(0, 0, -1))
    const flatLen: number = Math.sqrt(rawForward.x * rawForward.x + rawForward.z * rawForward.z)
    const flatForward: vec3 = flatLen > 0.001
      ? new vec3(rawForward.x / flatLen, 0, rawForward.z / flatLen)
      : new vec3(0, 0, -1)

    // Position: camera pos + flattened forward * distance, at eye height
    const spawnPos: vec3 = new vec3(
      camPos.x + flatForward.x * this.spawnDistance,
      camPos.y,
      camPos.z + flatForward.z * this.spawnDistance
    )
    tr.setWorldPosition(spawnPos)

    // Do NOT set rotation — the Frame's billboard component will auto-face the camera

    const widget = so.getComponent("ScriptComponent") as Widget
    return widget
  }

  create(bluetoothGatt: Bluetooth.BluetoothGatt) {
    // Returning the controllerUi instance means we found the controller for a service on the device
    // Returning undefined means we did not find a controller for a service on this device
    return this.instantiateControllerContent(bluetoothGatt)
  }
}
