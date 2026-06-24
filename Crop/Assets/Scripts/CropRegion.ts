/**
 * Specs Inc. 2026
 * Crop Region component for the Crop Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators";
import {CameraService} from "./CameraService"

@component
export class CropRegion extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CropRegion – maps 3D tracking points to camera crop texture</span><br/><span style="color: #94A3B8; font-size: 11px;">Projects scene objects into camera space each frame and updates the crop texture rectangle accordingly.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("CameraService providing world-to-camera-space projection")
  cameraService: CameraService

  @input
  @hint("Crop texture whose rectangle is updated each frame")
  screenCropTexture: Texture

  @input
  @hint("Scene objects whose positions define the crop boundary corners")
  pointsToTrack: SceneObject[]

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
  private cropProvider = null

  private transformsToTrack = []

  onAwake() {
    this.logger = new Logger("CropRegion", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
    this.cropProvider = this.screenCropTexture.control as CameraTextureProvider
    for (let i = 0; i < this.pointsToTrack.length; i++) {
      this.transformsToTrack.push(this.pointsToTrack[i].getTransform())
    }

    if (this.transformsToTrack.length < 1) {
      this.logger.warn("No points to track!")
    }
  }

  @bindUpdateEvent
  update() {
    if (this.transformsToTrack.length < 1) {
      return
    }
    const imagePoints = []
    for (let i = 0; i < this.transformsToTrack.length; i++) {
      let imagePos = vec2.zero()
      if (this.isEditor) {
        imagePos = this.cameraService.WorldToEditorCameraSpace(this.transformsToTrack[i].getWorldPosition())
      } else {
        imagePos = this.cameraService.WorldToTrackingRightCameraSpace(this.transformsToTrack[i].getWorldPosition())
      }

      const isTrackingPoint = Math.abs(imagePos.x) <= 1 && Math.abs(imagePos.y) <= 1
      imagePoints.push(imagePos)
      if (!isTrackingPoint) {
        this.cropProvider.cropRect = Rect.create(-1, 1, -1, 1)
        return
      }
    }
    this.OnTrackingUpdated(imagePoints)
  }

  OnTrackingUpdated(imagePoints) {
    let min_x = Infinity,
      max_x = -Infinity,
      min_y = Infinity,
      max_y = -Infinity
    //find max and min points
    for (let i = 0; i < imagePoints.length; i++) {
      //in range -1 to 1
      const imagePoint = imagePoints[i]
      if (imagePoint.x < min_x) min_x = imagePoint.x
      if (imagePoint.x > max_x) max_x = imagePoint.x
      if (imagePoint.y < min_y) min_y = imagePoint.y
      if (imagePoint.y > max_y) max_y = imagePoint.y
    }
    const center = new vec2(min_x + max_x, min_y + max_y).uniformScale(0.5)
    const size = new vec2(max_x - min_x, max_y - min_y)
    const cropRect = this.cropProvider.cropRect
    cropRect.setCenter(center)
    cropRect.setSize(size)
    this.cropProvider.cropRect = cropRect
  }

  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
  }

  Remap(value, low1, high1, low2, high2) {
    return low2 + ((high2 - low2) * (value - low1)) / (high1 - low1)
  }
}
