/**
 * Specs Inc. 2026
 * Pinhole Capture component for the SnapML Starter Spectacles lens.
 */
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {PinholeCameraModel} from "./PinholeCameraModel"

@component
export class PinholeCapture extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PinholeCapture – pinhole camera projection helper</span><br/><span style="color: #94A3B8; font-size: 11px;">Builds a pinhole camera model from the tracking camera and provides UV-to-world projection methods.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private cameraModule: CameraModule = require("LensStudio:CameraModule")
  private cameraRequest: CameraModule.CameraRequest
  cameraModel: any
  cameraDevice: any
  mainCamera: any
  viewToWorld: any
  private isInitialized: boolean = false
  private initPromise: Promise<boolean>
  private initResolve: (value: boolean) => void

  onAwake() {
    this.logger = new Logger("PinholeCapture", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.initPromise = new Promise((resolve) => {
      this.initResolve = resolve
    })
  }

  @bindStartEvent
  private onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.logger.info("Initializing PinholeCapture...")

    try {
      this.cameraRequest = CameraModule.createCameraRequest()
      this.cameraRequest.cameraId = CameraModule.CameraId.Right_Color
      const cameraTexture = this.cameraModule.requestCamera(this.cameraRequest)

      if (!cameraTexture) {
        this.logger.error("Failed to request camera texture")
        this.initResolve(false)
        return
      }

      this.cameraDevice = global.deviceInfoSystem.getTrackingCameraForId(this.cameraRequest.cameraId)

      if (!this.cameraDevice) {
        this.logger.error("Failed to get tracking camera device")
        this.initResolve(false)
        return
      }

      this.cameraModel = PinholeCameraModel.create(this.cameraDevice)

      if (!this.cameraModel) {
        this.logger.error("Failed to create pinhole camera model")
        this.initResolve(false)
        return
      }

      const cameraProvider = WorldCameraFinderProvider.getInstance()
      if (!cameraProvider) {
        this.logger.error("Failed to get camera provider")
        this.initResolve(false)
        return
      }

      this.mainCamera = cameraProvider.getComponent()

      if (!this.mainCamera) {
        this.logger.error("Failed to get main camera component")
        this.initResolve(false)
        return
      }

      if (!this.saveMatrix()) {
        this.logger.warn("Initial matrix save failed, will try again later")
      }

      this.isInitialized = true
      this.logger.info("PinholeCapture initialization complete")
      this.initResolve(true)
    } catch (e) {
      this.logger.error("Error during initialization: " + e)
      this.initResolve(false)
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.mainCamera != null
  }

  getInitPromise(): Promise<boolean> {
    return this.initPromise
  }

  saveMatrix(): boolean {
    if (!this.mainCamera) {
      this.logger.error("mainCamera is not initialized")
      return false
    }

    try {
      this.viewToWorld = this.mainCamera.getTransform().getWorldTransform()
      if (this.enableLogging) {
        this.logger.debug("Matrix saved successfully")
      }
      return true
    } catch (e) {
      this.logger.error("Error saving matrix: " + e)
      return false
    }
  }

  captureToWorldTransform(captureUV: vec2, depth: number): vec3 {
    if (!this.isReady() || !this.viewToWorld) {
      this.logger.error("PinholeCapture not ready for captureToWorldTransform")
      return new vec3(0, 0, 0)
    }

    const capturePos = this.cameraModel.unprojectFromUV(captureUV, depth)
    const viewPos = this.cameraDevice.pose.multiplyPoint(capturePos)
    const worldPos = this.viewToWorld.multiplyPoint(viewPos)
    return worldPos
  }

  worldToCaptureTransform() {
    if (!this.isReady() || !this.viewToWorld) {
      this.logger.error("PinholeCapture not ready for worldToCaptureTransform")
      return new mat4()
    }
    return this.viewToWorld.mult(this.cameraDevice.pose).inverse()
  }

  worldSpaceOfTrackingCamera(): vec3 {
    if (!this.isReady() || !this.viewToWorld) {
      this.logger.error("PinholeCapture not ready for worldSpaceOfTrackingCamera")
      return new vec3(0, 0, 0)
    }
    return this.viewToWorld.mult(this.cameraDevice.pose).multiplyPoint(vec3.zero())
  }

  public getCameraModel(): PinholeCameraModel {
    if (!this.cameraModel) {
      this.logger.warn("cameraModel not initialized yet")
    }
    return this.cameraModel
  }
}
