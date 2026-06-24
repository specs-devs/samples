/**
 * Specs Inc. 2026
 * Scene Controller for the Depth Cache Spectacles lens experience.
 */
import {DebugVisualizer} from "./DebugVisualizer"
import {DepthCache} from "./DepthCache"
import {GeminiAPI} from "./GeminiAPI"
import {Loading} from "./Loading"
import {ResponseUI} from "./ResponseUI"
import {SpeechUI} from "./SpeechUI"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"

@component
export class SceneController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SceneController – main orchestrator</span><br/><span style="color: #94A3B8; font-size: 11px;">Wires together speech, depth, and Gemini API for AR label placement.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Debug</span>')
  @input
  @hint("Show debug visuals in the scene")
  showDebugVisuals: boolean = false

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Visualizes 2D points over the camera frame for debugging")
  debugVisualizer: DebugVisualizer

  @input
  @hint("Handles speech input and ASR")
  speechUI: SpeechUI

  @input
  @hint("Calls to the Gemini API using Smart Gate")
  gemini: GeminiAPI

  @input
  @hint("Displays AI speech output")
  responseUI: ResponseUI

  @input
  @hint("Loading visual")
  loading: Loading

  @input
  @hint("Caches depth frame and converts pixel positions to world space")
  depthCache: DepthCache

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private isRequestRunning = false

  onAwake() {
    this.logger = new Logger("SceneController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.speechUI.onSpeechReady.add((text) => {
      this.onSpeechRecieved(text)
    })
  }

  onSpeechRecieved(text: string) {
    this.speechUI.activateSpeechButton(false)
    if (this.isRequestRunning) {
      this.logger.warn("REQUEST ALREADY RUNNING")
      return
    }
    this.logger.info("MAKING REQUEST~~~~~")
    this.isRequestRunning = true
    this.loading.activateLoder(true)
    this.responseUI.clearLabels()
    this.responseUI.closeResponseBubble()
    const depthFrameID = this.depthCache.saveDepthFrame()
    const camImage = this.depthCache.getCamImageWithID(depthFrameID)
    this.sendToGemini(camImage, text, depthFrameID)
    if (this.showDebugVisuals) {
      this.debugVisualizer.updateCameraFrame(camImage)
    }
  }

  private sendToGemini(cameraFrame: Texture, text: string, depthFrameID: number) {
    this.gemini.makeGeminiRequest(cameraFrame, text, (response) => {
      this.isRequestRunning = false
      this.speechUI.activateSpeechButton(true)
      this.loading.activateLoder(false)
      this.logger.info("GEMINI Points LENGTH: " + response.points.length)
      this.responseUI.openResponseBubble(response.aiMessage)
      for (let i = 0; i < response.points.length; i++) {
        const pointObj = response.points[i]
        if (this.showDebugVisuals) {
          this.debugVisualizer.visualizeLocalPoint(pointObj.pixelPos, cameraFrame)
        }
        const worldPosition = this.depthCache.getWorldPositionWithID(pointObj.pixelPos, depthFrameID)
        if (worldPosition != null) {
          this.responseUI.loadWorldLabel(pointObj.label, worldPosition, pointObj.showArrow)
        }
      }
      this.depthCache.disposeDepthFrame(depthFrameID)
    })
  }
}
