/**
 * Specs Inc. 2026
 * Defines Depth Cache, Color Camera Frame, Depth Color Pair for the Depth Cache lens.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"

/*
Finds the closest camera frame to a matching depth frame
*/
class ColorCameraFrame {
  public imageFrame: Texture
  public colorTimestampSeconds: number
  constructor(imageFrame: Texture, colorTimestamp: number) {
    this.imageFrame = imageFrame
    this.colorTimestampSeconds = colorTimestamp
  }
}

class DepthColorPair {
  public colorCameraFrame: ColorCameraFrame
  public depthFrameData: Float32Array
  public depthDeviceCamera: DeviceCamera
  public depthTimestampSeconds: number
  public depthCameraPose: mat4
  constructor(
    colorCameraFrame: ColorCameraFrame,
    depthFrameData: Float32Array,
    depthDeviceCamera: DeviceCamera,
    depthTimestampSeconds: number,
    depthCameraPose: mat4
  ) {
    this.colorCameraFrame = colorCameraFrame
    this.depthFrameData = depthFrameData
    this.depthDeviceCamera = depthDeviceCamera
    this.depthTimestampSeconds = depthTimestampSeconds
    this.depthCameraPose = depthCameraPose
  }
}

@component
export class DepthCache extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">DepthCache – depth frame caching and 3D reprojection</span><br/><span style="color: #94A3B8; font-size: 11px;">Caches synchronized depth and color frames for pixel-to-world projection.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Camera module used to request the color camera feed")
  camModule: CameraModule

  @input
  @hint("Color camera to pair with depth. Depth is aligned to the LEFT camera — use Right only when the left camera does not deliver frames on your device (slight label offset from the stereo baseline).")
  @widget(new ComboBoxWidget([new ComboBoxItem("Left", "Left"), new ComboBoxItem("Right", "Right")]))
  private colorCamera: string = "Left"

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private colorDeviceCamera: DeviceCamera
  private depthModule = require("LensStudio:DepthModule") as DepthModule
  private depthFrameSession = null
  private isEditor = global.deviceInfoSystem.isEditor()
  private camTexture: Texture
  private camFrameHistory: ColorCameraFrame[] = []

  private latestCameraDepthPair: DepthColorPair = null
  private cachedDepthFrames: Map<number, DepthColorPair> = new Map<number, DepthColorPair>()

  // --- DEBUG: frame delivery instrumentation (remove once verified) ---
  private depthFrameCount = 0
  private camFrameCount = 0
  private lastDepthLogTimeSec = 0

  onAwake() {
    this.logger = new Logger("DepthCache", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.startCameraUpdates()
    this.startDepthUpdate()

    // If no frames have arrived a few seconds in, the platform is not
    // delivering them (vs. a lens-side bug). Reports once at ~5s.
    const probe = this.createEvent("DelayedCallbackEvent")
    probe.bind(() => {
      print(
        `[DepthCacheDebug] 5s after start: ${this.depthFrameCount} depth frame(s), ${this.camFrameCount} camera frame(s) received. ` +
          (this.depthFrameCount === 0
            ? "NO depth frames — platform is not delivering DepthFrameData (expected in editor preview; test on device)."
            : this.camFrameCount === 0
              ? "Depth OK but NO camera frames — pairing cannot happen."
              : this.latestCameraDepthPair == null
                ? "Both streams OK but no pair formed yet — check findClosestCameraFrame."
                : "Pipeline OK — depth/color pairs are forming.")
      )
      // On device, some units do not deliver the left color feed. If depth is
      // flowing but the camera is silent and we started on Left, retry with
      // Right. (In the editor we use Default_Color, so this does not apply.)
      if (!this.isEditor && this.depthFrameCount > 0 && this.camFrameCount === 0 && this.colorCamera !== "Right") {
        print("[DepthCacheDebug] Left color camera delivered nothing — falling back to Right_Color.")
        this.colorCamera = "Right"
        this.requestCameraFeed(CameraModule.CameraId.Right_Color)
      }
    })
    probe.reset(5.0)
  }

  /**
   * Saves the latest depth/color pair and returns its ID, or -1 when no pair
   * has been captured yet. Depth frames arrive at ~5hz on device and are not
   * produced at all in the editor preview, so the pair can legitimately be
   * missing — callers must handle -1.
   */
  saveDepthFrame(): number {
    if (this.latestCameraDepthPair == null) {
      this.logger.warn("No depth/color frame pair available yet (depth frames are not produced in the editor preview)")
      return -1
    }
    const depthFrameID = Date.now()
    this.cachedDepthFrames.set(depthFrameID, this.latestCameraDepthPair)
    return depthFrameID
  }

  getCamImageWithID(depthFrameID: number): Texture {
    const cachedDepthColorPair = this.cachedDepthFrames.get(depthFrameID)
    if (cachedDepthColorPair == null) {
      this.logger.warn("Invalid depth frame ID: " + depthFrameID)
      return null
    }
    return cachedDepthColorPair.colorCameraFrame.imageFrame
  }

  /**
   * Most recent color camera frame, independent of depth. Lets the editor
   * preview (camera ~30hz, no depth frames) still run the image flow.
   */
  getLatestCamImage(): Texture {
    if (this.camFrameHistory.length === 0) {
      return null
    }
    return this.camFrameHistory[this.camFrameHistory.length - 1].imageFrame
  }

  getWorldPositionWithID(pixelPos: vec2, depthFrameID: number): vec3 {
    const cachedDepthColorPair = this.cachedDepthFrames.get(depthFrameID)
    if (cachedDepthColorPair != null) {
      //Remap from the color frame to the depth frame since the depth frame is a cropped and downscaled version of the left color frame.
      const normalizedPointOnColorFrame = pixelPos.div(this.colorDeviceCamera.resolution)
      const pointInCameraSpace = this.colorDeviceCamera.unproject(normalizedPointOnColorFrame, 100.0)
      const normalizedPointOnDepthFrame = cachedDepthColorPair.depthDeviceCamera.project(pointInCameraSpace)
      if (this.isNormalizedPointInImage(normalizedPointOnDepthFrame)) {
        const objectPixelLocationOnDepthFrame = normalizedPointOnDepthFrame.mult(
          cachedDepthColorPair.depthDeviceCamera.resolution
        )
        //Sample depth at pixel location and compute world position of object
        const depthVal = this.getMedianDepth(
          cachedDepthColorPair.depthFrameData,
          cachedDepthColorPair.depthDeviceCamera.resolution.x,
          cachedDepthColorPair.depthDeviceCamera.resolution.y,
          Math.floor(objectPixelLocationOnDepthFrame.x),
          Math.floor(objectPixelLocationOnDepthFrame.y),
          1
        )
        const pointInDeviceRef = cachedDepthColorPair.depthDeviceCamera.unproject(normalizedPointOnDepthFrame, depthVal)
        return cachedDepthColorPair.depthCameraPose.multiplyPoint(pointInDeviceRef)
      }
      this.logger.warn("Point is outside of depth frame: " + normalizedPointOnDepthFrame)
      return null
    }
    this.logger.warn("Invalid depth frame ID: " + depthFrameID)
    return null
  }

  disposeDepthFrame(depthFrameID: number) {
    const depthFrame = this.cachedDepthFrames.get(depthFrameID)
    if (depthFrame != null) {
      this.cachedDepthFrames.delete(depthFrameID)
    }
  }

  private getMedianDepth(
    depthData: Float32Array,
    width: number,
    height: number,
    x: number,
    y: number,
    radius: number
  ): number | null {
    //Radius = 1 → 3×3 window (9 samples)
    //Radius = 2 → 5×5 window (25 samples)
    //Radius = 3 → 7×7 window (49 samples)
    const xi = Math.round(x)
    const yi = Math.round(y)
    const samples: number[] = []

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = xi + dx
        const ny = yi + dy
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const val = depthData[nx + ny * width]
          if (val > 0) samples.push(val) // skip zeros/invalid
        }
      }
    }

    if (samples.length === 0) return null

    samples.sort((a, b) => a - b)
    const mid = Math.floor(samples.length / 2)
    return samples.length % 2 === 0 ? (samples[mid - 1] + samples[mid]) / 2 : samples[mid]
  }

  private startCameraUpdates() {
    // The editor preview only simulates the Default_Color camera (the webcam);
    // the stereo Left/Right feeds are device-only and deliver no frames in
    // Preview. On device we use Left/Right because depth is aligned to those.
    const camId = this.isEditor
      ? CameraModule.CameraId.Default_Color
      : this.colorCamera === "Right"
        ? CameraModule.CameraId.Right_Color
        : CameraModule.CameraId.Left_Color
    this.requestCameraFeed(camId)
  }

  private requestCameraFeed(camId: CameraModule.CameraId) {
    const camRequest = CameraModule.createCameraRequest()
    camRequest.cameraId = camId
    // The editor Preview needs a smaller request to deliver frames reliably.
    camRequest.imageSmallerDimension = this.isEditor ? 352 : 756
    this.camTexture = this.camModule.requestCamera(camRequest)
    const camTexControl = this.camTexture.control as CameraTextureProvider
    camTexControl.onNewFrame.add((frame: CameraFrame) => {
      this.camFrameCount++
      const colorCameraFrame = new ColorCameraFrame(this.camTexture.copyFrame(), frame.timestampSeconds)
      //save last half second of camera frames
      this.camFrameHistory.push(colorCameraFrame)
      //cam frame updates at 30hz, depth at 5hz, usually cam frame is 2-3 cam frames behind depth frame
      if (this.camFrameHistory.length > 5) {
        this.camFrameHistory.shift()
      }
    })
    this.colorDeviceCamera = global.deviceInfoSystem.getTrackingCameraForId(camId)
  }

  private startDepthUpdate() {
    this.depthFrameSession = this.depthModule.createDepthFrameSession()
    this.depthFrameSession.onNewFrame.add((depthFrameData: DepthFrameData) => {
      // DEBUG: log first depth frame + ~1 Hz thereafter (remove once verified)
      this.depthFrameCount++
      const nowSec = getTime()
      if (this.depthFrameCount === 1 || nowSec - this.lastDepthLogTimeSec >= 1.0) {
        this.lastDepthLogTimeSec = nowSec
        const res = depthFrameData.deviceCamera.resolution
        print(`[DepthCacheDebug] depth frame #${this.depthFrameCount} res=${res.x}x${res.y}, paired=${this.latestCameraDepthPair != null}`)
      }
      const closestFrame = this.findClosestCameraFrame(depthFrameData)
      if (closestFrame != null) {
        //Deep copy items here
        this.latestCameraDepthPair = new DepthColorPair(
          closestFrame,
          depthFrameData.depthFrame.slice(),
          depthFrameData.deviceCamera,
          depthFrameData.timestampSeconds,
          mat4.fromColumns(
            depthFrameData.toWorldTrackingOriginFromDeviceRef.column0,
            depthFrameData.toWorldTrackingOriginFromDeviceRef.column1,
            depthFrameData.toWorldTrackingOriginFromDeviceRef.column2,
            depthFrameData.toWorldTrackingOriginFromDeviceRef.column3
          )
        )
      }
    })
    this.depthFrameSession.start()
  }

  private findClosestCameraFrame(depthFrame: DepthFrameData, maxOffset = 0.001): ColorCameraFrame | null {
    if (!this.camFrameHistory || this.camFrameHistory.length === 0) {
      return null
    }
    const closestColorFrame = this.camFrameHistory.reduce((closest, current) => {
      const currentDelta = Math.abs(current.colorTimestampSeconds - depthFrame.timestampSeconds)
      const closestDelta = Math.abs(closest.colorTimestampSeconds - depthFrame.timestampSeconds)
      return currentDelta < closestDelta ? current : closest
    })

    return Math.abs(closestColorFrame.colorTimestampSeconds - depthFrame.timestampSeconds) <= maxOffset
      ? closestColorFrame
      : this.camFrameHistory[this.camFrameHistory.length - 1]
  }

  private isNormalizedPointInImage(normalizedPoint: vec2) {
    return normalizedPoint.x >= 0.0 && normalizedPoint.x <= 1.0 && normalizedPoint.y >= 0.0 && normalizedPoint.y <= 1.0
  }
}
