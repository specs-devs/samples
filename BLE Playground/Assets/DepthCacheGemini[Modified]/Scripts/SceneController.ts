/**
 * Specs Inc. 2026
 * Scene Controller for the BLE Playground Spectacles lens experience.
 */
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {DebugVisualizer} from "./DebugVisualizer"
import {DepthCache} from "./DepthCache"
import {GeminiAPI} from "./GeminiAPI"
import {Loading} from "./Loading"
import {ResponseUI} from "./ResponseUI"
import {SpeechUI} from "./SpeechUI"

@component
export class SceneController extends BaseScriptComponent {
  static SHOW_DEBUG: boolean = true

  @ui.label('<span style="color: #60A5FA;">SceneController – depth-aware Gemini scene analysis</span><br/><span style="color: #94A3B8; font-size: 11px;">Orchestrates depth capture, Gemini inference, and world-space label placement.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("DebugVisualizer component for overlay rendering of depth captures")
  debugVisualizer: DebugVisualizer

  @input
  @hint("SpeechUI component managing voice input and ASR feedback")
  speechUI: SpeechUI

  @input
  @hint("GeminiAPI component for sending image and text queries")
  gemini: GeminiAPI

  @input
  @hint("ResponseUI component that displays labels and the response bubble")
  responseUI: ResponseUI

  @input
  @hint("Loading component that shows a spinner while the request is in flight")
  loading: Loading

  @input
  @hint("DepthCache component that provides synchronized depth/color frame data")
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
    const tapEvent = this.createEvent("TapEvent")
    tapEvent.bind(() => {
      this.logger.debug("Editor tap event...")
      this.onSpeechRecieved("Can you show me all the objects you see?")
    })

    this.speechUI.onSpeechReady.add((text) => {
      this.onSpeechRecieved(text)
    })
  }

  onSpeechRecieved(text: string) {
    this.speechUI.activateSpeechButton(false)
    if (this.isRequestRunning) {
      this.logger.warn("Request already running")
      return
    }
    this.logger.info("Making Gemini request...")
    this.isRequestRunning = true
    this.loading.activateLoder(true)
    this.responseUI.clearLabels()
    this.responseUI.closeResponseBubble()
    const depthFrameID = this.depthCache.saveDepthFrame()
    const camImage = this.depthCache.getCamImageWithID(depthFrameID)
    this.sendToGemini(camImage, text, depthFrameID)
    if (SceneController.SHOW_DEBUG) {
      this.debugVisualizer.updateCameraFrame(camImage)
    }
  }

  private sendToGemini(cameraFrame: Texture, text: string, depthFrameID: number) {
    this.gemini.makeGeminiRequest(cameraFrame, text, (response) => {
      this.isRequestRunning = false
      this.speechUI.activateSpeechButton(true)
      this.loading.activateLoder(false)
      this.logger.debug("Gemini points length: " + response.points.length)
      this.responseUI.openResponseBubble(response.aiMessage)
      for (let i = 0; i < response.points.length; i++) {
        const pointObj = response.points[i]
        if (SceneController.SHOW_DEBUG) {
          this.debugVisualizer.visualizeLocalPoint(pointObj.pixelPos, cameraFrame)
        }
        const worldPosition = this.depthCache.getWorldPositionWithID(pointObj.pixelPos, depthFrameID)
        if (worldPosition != null) {
          this.responseUI.loadWorldLabel(pointObj.label, worldPosition, pointObj.showArrow)
        }
      }
      for (let i = 0; i < response.lines.length; i++) {
        const lineObj = response.lines[i]
        if (SceneController.SHOW_DEBUG) {
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
    })
  }
}
