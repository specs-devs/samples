/**
 * SPECS Inc. 2027
 * Scene Controller for the Depth Cache Glasses lens experience.
 */
import {DebugVisualizer} from "./DebugVisualizer"
import {DepthCache} from "./DepthCache"
import {GeminiAPI} from "./GeminiAPI"
import {Loading} from "./Loading"
import {ResponseUI} from "./ResponseUI"
import {SpeechUI} from "./SpeechUI"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"

// Editor-only: the preview delivers no depth frames, so labels cannot be
// anchored to real geometry. These place simulated labels on a plane in front
// of the camera so they still appear for development. Device is unaffected.
const SIM_LABEL_DISTANCE = 150 // cm in front of the camera
const SIM_LABEL_SPREAD_X = 120 // horizontal spread across the simulated frame
const SIM_LABEL_SPREAD_Y = 75 // vertical spread across the simulated frame

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

    if (global.deviceInfoSystem.isEditor()) {
      // ASR/mic is unreliable in the editor (a final transcription rarely
      // fires), so the speech -> Gemini chain never starts on its own. Let a
      // Preview tap fire a request with a default query so the full pipeline —
      // Gemini, simulated world labels, and (when enabled) red dots — runs
      // without speech. Not gated on debug visuals: the labels are the feature.
      const tapEvent = this.createEvent("TapEvent")
      tapEvent.bind(() => {
        print('[SceneController] Editor tap — firing test Gemini request ("What objects do you see?")')
        this.onSpeechRecieved("What objects do you see?")
      })

      // Debug-only: the debug quad would otherwise refresh only when a request
      // completes. Drive a continuous live preview of the latest color frame so
      // the camera feed is always visible while developing. (Red dots are placed
      // on top and survive these texture-only updates.)
      if (this.showDebugVisuals) {
        const previewEvent = this.createEvent("UpdateEvent")
        previewEvent.bind(() => {
          this.debugVisualizer.setCameraFrameTexture(this.depthCache.getLatestCamImage())
        })
      }
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
        let worldPosition = depthFrameID < 0 ? null : this.depthCache.getWorldPositionWithID(pointObj.pixelPos, depthFrameID)
        // No depth (always the case in the editor preview): simulate a position
        // in front of the camera so the labels still appear, mirroring the
        // red-dot debug simulation. Device keeps using real depth anchoring.
        if (worldPosition == null && global.deviceInfoSystem.isEditor()) {
          worldPosition = this.simulateWorldPosition(pointObj.pixelPos, cameraFrame)
        }
        if (worldPosition != null) {
          this.responseUI.loadWorldLabel(pointObj.label, worldPosition, pointObj.showArrow)
        }
      }
      this.depthCache.disposeDepthFrame(depthFrameID)
    })
  }

  /**
   * Editor-only fallback: estimate a world position for a camera-frame pixel
   * when no depth is available. Projects the pixel onto a plane a fixed distance
   * in front of the camera, spreading points across a simulated frustum so the
   * labels appear roughly where their objects are. Purely for preview.
   */
  private simulateWorldPosition(pixelPos: vec2, cameraFrame: Texture): vec3 {
    const camTrans = this.speechUI.getCameraTransform()
    if (camTrans == null) {
      this.logger.warn("No camera transform available for simulated label placement")
      return null
    }
    // Frame pixels are top-down; centre and flip Y so up is positive.
    const centeredX = pixelPos.x / cameraFrame.getWidth() - 0.5
    const centeredY = 0.5 - pixelPos.y / cameraFrame.getHeight()
    const camPos = camTrans.getWorldPosition()
    // The camera looks down its negative forward axis (see SpeechUI positioning).
    return camPos
      .add(camTrans.forward.uniformScale(-SIM_LABEL_DISTANCE))
      .add(camTrans.right.uniformScale(centeredX * SIM_LABEL_SPREAD_X))
      .add(camTrans.up.uniformScale(centeredY * SIM_LABEL_SPREAD_Y))
  }
}
