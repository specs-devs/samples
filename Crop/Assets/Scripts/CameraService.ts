/**
 * Specs Inc. 2026
 * Camera Service component for the Crop Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindStartEvent } from "SnapDecorators.lspkg/decorators";

@component
export class CameraService extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CameraService – provides camera textures and coordinate projection</span><br/><span style="color: #94A3B8; font-size: 11px;">Sets up camera module requests and virtual cameras for world-to-screen-space conversion.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Cameras</span>')
  @input
  @hint("Editor camera used for world-to-screen projection in preview mode")
  editorCamera: Camera

  @input
  @hint("Left eye virtual camera mirroring the Spectacles left tracking camera")
  specsLeftCamera: Camera

  @input
  @hint("Right eye virtual camera mirroring the Spectacles right tracking camera")
  specsRightCamera: Camera

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Textures</span>')
  @input
  @hint("Crop texture driven by the camera module output")
  screenCropTexture: Texture

  @input
  @hint("Raw camera device texture from the camera module request")
  deviceCamTexture: Texture

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;

  private isEditor = global.deviceInfoSystem.isEditor()
  private camTexture = null
  private cropProvider = null
  private camModule: CameraModule = require("LensStudio:CameraModule") as CameraModule

  onAwake() {
    this.logger = new Logger("CameraService", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
  }

  @bindStartEvent
  start() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()");
    const camID = this.isEditor ? CameraModule.CameraId.Default_Color : CameraModule.CameraId.Right_Color
    const camRequest = CameraModule.createCameraRequest()
    camRequest.cameraId = camID
    camRequest.imageSmallerDimension = this.isEditor ? 352 : 756
    this.camTexture = this.camModule.requestCamera(camRequest)
    const camTexControl = this.camTexture.control as CameraTextureProvider
    camTexControl.onNewFrame.add(() => {})
    this.cropProvider = this.screenCropTexture.control as CameraTextureProvider
    this.cropProvider.inputTexture = this.camTexture

    this.cropProvider
    if (this.isEditor) {
      return
    }
    const leftTrackingCamera = global.deviceInfoSystem.getTrackingCameraForId(camID)
    const rightTrackingCamera = global.deviceInfoSystem.getTrackingCameraForId(CameraModule.CameraId.Right_Color)
    this.SetUpVirtualCamera(this.specsLeftCamera, leftTrackingCamera)
    this.SetUpVirtualCamera(this.specsRightCamera, rightTrackingCamera)
  }

  SetUpVirtualCamera(camComp, trackingCam) {
    //set pose
    const camTrans = camComp.getSceneObject().getTransform()
    camTrans.setLocalTransform(trackingCam.pose)
    //set intrinsics
    const aspect = trackingCam.resolution.x / trackingCam.resolution.y
    camComp.aspect = aspect
    const avgFocalLengthPixels = (trackingCam.focalLength.x + trackingCam.focalLength.y) / 2
    const fovRadians = 2 * Math.atan(trackingCam.resolution.y / 2 / avgFocalLengthPixels)
    camComp.fov = fovRadians
  }

  WorldToEditorCameraSpace(worldPos) {
    return this.CameraToScreenSpace(this.editorCamera, worldPos)
  }

  WorldToTrackingLeftCameraSpace(worldPos) {
    return this.CameraToScreenSpace(this.specsLeftCamera, worldPos)
  }

  WorldToTrackingRightCameraSpace(worldPos) {
    return this.CameraToScreenSpace(this.specsRightCamera, worldPos)
  }

  CameraToScreenSpace(camComp, worldPos) {
    const screenPoint = camComp.worldSpaceToScreenSpace(worldPos)
    const localX = this.Remap(screenPoint.x, 0, 1, -1, 1)
    const localY = this.Remap(screenPoint.y, 1, 0, -1, 1)
    return new vec2(localX, localY)
  }

  Remap(value, low1, high1, low2, high2) {
    return low2 + ((high2 - low2) * (value - low1)) / (high1 - low1)
  }
}
