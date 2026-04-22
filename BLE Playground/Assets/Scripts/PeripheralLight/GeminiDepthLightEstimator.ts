/**
 * Specs Inc. 2026
 * Gemini Depth Light Estimator component for the BLE Playground Spectacles lens.
 */
import {DebugVisualizer} from "DepthCacheGemini[Modified]/Scripts/DebugVisualizer"
import {DepthCache} from "DepthCacheGemini[Modified]/Scripts/DepthCache"
import {GeminiAPI} from "DepthCacheGemini[Modified]/Scripts/GeminiAPI"
import {ResponseUI} from "DepthCacheGemini[Modified]/Scripts/ResponseUI"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {LightHandInputManager} from "./LightHandInputManager"

@component
export class GeminiDepthLightEstimator extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GeminiDepthLightEstimator – AI-based light world position estimator</span><br/><span style="color: #94A3B8; font-size: 11px;">Captures a depth+color frame, sends it to Gemini, and resolves lamp positions in world space.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @allowUndefined
  @input
  @hint("Debug visualizer used to show captured camera frames and detected points")
  debugVisualizer: DebugVisualizer

  @input
  @hint("GeminiAPI component used to submit image+text requests")
  gemini: GeminiAPI

  @input
  @hint("ResponseUI component that renders world-space labels for detected objects")
  responseUI: ResponseUI

  @input
  @hint("DepthCache component that captures and stores depth+color frame pairs")
  depthCache: DepthCache

  @input
  @hint("LightHandInputManager that receives light placement notifications")
  lightHandInputManager: LightHandInputManager

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  get lightPlaced() {
    return this.lightPlacedEvent.publicApi()
  }

  private lightPlacedEvent: Event = new Event()

  private isRequestRunning: boolean = false
  private instruction: string
  private showDebug: boolean

  public lightPositions: vec3[]

  onAwake() {
    this.logger = new Logger("GeminiDepthLightEstimator", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.isRequestRunning = false
    this.showDebug = false
    this.instruction = "Find the lamps."
    this.lightPositions = []
  }

  requestAllPositions(onComplete?: (count: number, message: string) => void) {
    if (this.isRequestRunning) {
      this.logger.info("Request already running -- skipping")
      if (onComplete) onComplete(0, "Request already running")
      return
    }

    this.isRequestRunning = true
    const depthFrameID: number = this.depthCache.saveDepthFrame()
    const camImage: Texture = this.depthCache.getCamImageWithID(depthFrameID)

    this.sendToGemini(camImage, this.instruction, depthFrameID, onComplete)
    if (this.showDebug && this.debugVisualizer) {
      this.debugVisualizer.updateCameraFrame(camImage)
    }
  }

  show(val: boolean) {
    this.responseUI.showLabels(val)
  }

  private sendToGemini(
    cameraFrame: Texture,
    text: string,
    depthFrameID: number,
    onComplete?: (count: number, message: string) => void
  ) {
    this.logger.info("Sending request to Gemini...")

    this.gemini.makeGeminiRequest(cameraFrame, text, (response) => {
      this.isRequestRunning = false

      const aiMessage: string = response ? response.aiMessage ?? "" : ""
      const points: any[] = response && response.points ? response.points : []
      const lines: any[] = response && response.lines ? response.lines : []
      let placedCount: number = 0

      this.logger.info("Gemini returned " + points.length + " points, " + lines.length + " lines")

      for (let i = 0; i < points.length; i++) {
        const pointObj = points[i]
        if (this.showDebug && this.debugVisualizer) {
          this.debugVisualizer.visualizeLocalPoint(pointObj.pixelPos, cameraFrame)
        }
        const worldPosition = this.depthCache.getWorldPositionWithID(pointObj.pixelPos, depthFrameID)
        if (worldPosition != null) {
          this.responseUI.loadWorldLabel(pointObj.label, worldPosition, pointObj.showArrow)
          this.lightPlacedEvent.invoke()
          this.lightPositions.push(worldPosition)
          placedCount++
          this.logger.info("Placed '" + pointObj.label + "' at world pos " + worldPosition)
        } else {
          this.logger.warn("world pos is null for point " + i)
        }
      }

      for (let i = 0; i < lines.length; i++) {
        const lineObj = lines[i]
        if (this.showDebug && this.debugVisualizer) {
          this.debugVisualizer.visualizeLocalPoint(lineObj.startPos, cameraFrame)
          this.debugVisualizer.visualizeLocalPoint(lineObj.endPos, cameraFrame)
        }
        const startPos = this.depthCache.getWorldPositionWithID(lineObj.startPos, depthFrameID)
        const endPos = this.depthCache.getWorldPositionWithID(lineObj.endPos, depthFrameID)
        if (startPos != null || endPos != null) {
          this.responseUI.loadWorldLine(startPos, endPos)
        }
      }

      this.depthCache.disposeDepthFrame(depthFrameID)

      if (onComplete) onComplete(placedCount, aiMessage)
    })
  }
}
