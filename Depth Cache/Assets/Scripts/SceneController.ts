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

    // In the editor there are no depth frames, so the debug quad would only
    // refresh when a request completes. Drive a continuous live preview of the
    // latest color frame so the camera feed is always visible while developing.
    // (Red dots are placed on top and survive these texture-only updates.)
    if (global.deviceInfoSystem.isEditor() && this.showDebugVisuals) {
      const previewEvent = this.createEvent("UpdateEvent")
      previewEvent.bind(() => {
        this.debugVisualizer.setCameraFrameTexture(this.depthCache.getLatestCamImage())
      })

      // ASR/mic is unreliable in the editor (a final transcription rarely
      // fires), so the speech -> Gemini chain never starts. Let a Preview tap
      // fire a request with a default query to verify the Gemini -> red-dot
      // pipeline without speech.
      const tapEvent = this.createEvent("TapEvent")
      tapEvent.bind(() => {
        print('[SceneController] Editor tap — firing test Gemini request ("What objects do you see?")')
        this.onSpeechRecieved("What objects do you see?")
      })
    }
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
    let camImage = depthFrameID < 0 ? null : this.depthCache.getCamImageWithID(depthFrameID)
    if (camImage == null && global.deviceInfoSystem.isEditor()) {
      // The editor preview delivers camera frames (~30hz) but no depth frames,
      // so fall back to the raw camera frame: the Gemini request and the 2D
      // debug visuals still run; only world-anchored labels are skipped
      // (depthFrameID stays -1).
      camImage = this.depthCache.getLatestCamImage()
      if (camImage != null) {
        this.logger.warn("Editor preview: no depth frames — running image flow without world labels")
      }
    }
    if (camImage == null) {
      // No camera frame. On device this only happens in the first moments after
      // lens start. In the editor the Camera Module delivers no frames at all,
      // so fall back to a red-dot simulation: it can't run the real Gemini flow
      // (no image to send), but it confirms the debug overlay is wired up.
      this.isRequestRunning = false
      this.loading.activateLoder(false)
      this.speechUI.activateSpeechButton(true)
      if (global.deviceInfoSystem.isEditor() && this.showDebugVisuals) {
        this.logger.warn("Editor preview: no camera frames — running red-dot simulation to verify overlay wiring")
        this.debugVisualizer.simulateDebugPoints()
        this.responseUI.openResponseBubble("Editor preview: simulated debug dots (camera & depth only run on device).")
      } else {
        this.logger.warn("Camera frame not ready — skipping request")
        this.responseUI.openResponseBubble("Camera data isn't ready yet — please try again in a moment.")
      }
      return
    }
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
      print(`[SceneController] Gemini callback fired: ${response.points.length} point(s), showDebugVisuals=${this.showDebugVisuals}`)
      this.responseUI.openResponseBubble(response.aiMessage)
      for (let i = 0; i < response.points.length; i++) {
        const pointObj = response.points[i]
        if (this.showDebugVisuals) {
          this.debugVisualizer.visualizeLocalPoint(pointObj.pixelPos, cameraFrame)
        }
        const worldPosition = depthFrameID < 0 ? null : this.depthCache.getWorldPositionWithID(pointObj.pixelPos, depthFrameID)
        if (worldPosition != null) {
          this.responseUI.loadWorldLabel(pointObj.label, worldPosition, pointObj.showArrow)
        }
      }
      this.depthCache.disposeDepthFrame(depthFrameID)
    })
  }
}
