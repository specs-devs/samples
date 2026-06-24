/**
 * Specs Inc. 2026
 * Speech UI component for the Depth Cache Spectacles lens.
 */
import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {ASRController} from "./ASRController"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent, bindUpdateEvent} from "SnapDecorators.lspkg/decorators"

const UI_CAM_DISTANCE = 50
const UI_CAM_HEIGHT = -9

@component
export class SpeechUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SpeechUI – speech bubble with microphone button</span><br/><span style="color: #94A3B8; font-size: 11px;">Follows the main camera and shows ASR transcription text.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Main camera scene object used to position the speech UI")
  mainCamObj: SceneObject

  @input
  @hint("Anchor for the speech bubble popup")
  speecBocAnchor: SceneObject

  @input
  @hint("Render mesh for the microphone icon with animated shader")
  micRend: RenderMeshVisual

  @input
  @hint("Text component displaying the transcribed speech")
  speechText: Text

  @input
  @hint("ASR voice controller for starting and stopping transcription")
  asrVoiceController: ASRController

  @input
  @hint("Collider for enabling and disabling the speech button tap area")
  speechButtonCollider: ColliderComponent

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  onSpeechReady = new Event<string>()

  private logger: Logger
  private speechBubbleTrans: Transform
  private trans: Transform
  private mainCamTrans: Transform
  // Watchdog: if ASR delivers nothing for a while after the mic button is
  // pressed, tell the user instead of showing "Listening..." forever.
  private static readonly NO_AUDIO_TIMEOUT_SECONDS = 8
  private heardAnything = false
  private retriedAfterError = false
  private noAudioWatchdog: DelayedCallbackEvent

  onAwake() {
    this.logger = new Logger("SpeechUI", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.speechBubbleTrans = this.speecBocAnchor.getTransform()
    this.speechBubbleTrans.setLocalScale(vec3.zero())
    this.trans = this.getSceneObject().getTransform()
    this.mainCamTrans = this.mainCamObj.getTransform()
    this.animateSpeechIcon(false)
    this.speechText.text = ""

    this.noAudioWatchdog = this.createEvent("DelayedCallbackEvent")
    this.noAudioWatchdog.bind(() => {
      if (this.heardAnything) return
      this.logger.warn("No speech detected within " + SpeechUI.NO_AUDIO_TIMEOUT_SECONDS + "s")
      this.speechText.text = global.deviceInfoSystem.isEditor()
        ? "No audio detected — check that the Preview panel's microphone/audio input is enabled."
        : "No audio detected — tap the mic and try again."
      this.stopListening()
    })
  }

  @bindStartEvent
  private onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.asrVoiceController.onPartialVoiceEvent.add((text) => {
      this.heardAnything = true
      this.speechText.text = text
    })
    this.asrVoiceController.onFinalVoiceEvent.add((text) => {
      this.heardAnything = true
      this.speechText.text = text
      this.stopListening()
      this.onSpeechReady.invoke(text)
    })
    this.asrVoiceController.onErrorEvent.add((error) => {
      this.logger.error("ASR error: " + error)
      this.heardAnything = true // cancels the no-audio watchdog message

      // InternalError is often transient (service warm-up) — retry once
      // automatically before asking the user to act.
      if (error === "InternalError" && !this.retriedAfterError) {
        this.retriedAfterError = true
        this.speechText.text = "Listening..."
        this.asrVoiceController.startListening()
        return
      }

      this.animateSpeechIcon(false)
      if (error === "NoInternet") {
        this.speechText.text = "No internet connection on the device — speech recognition needs to be online."
      } else if (error === "Unauthenticated") {
        this.speechText.text = "Device not authenticated — check the Specs is logged in and paired."
      } else {
        this.speechText.text = "Speech recognition error (" + error + ") — tap the mic to try again."
      }
    })
  }

  activateSpeechButton(activate: boolean) {
    this.speechButtonCollider.enabled = activate
  }

  onSpeechButtonDown() {
    this.logger.info("Speech button Down!")
    // "Listening..." is local UI feedback only — real partial transcriptions
    // overwrite it. If nothing overwrites it, the watchdog reports why.
    this.speechText.text = "Listening..."
    this.heardAnything = false
    this.retriedAfterError = false
    this.noAudioWatchdog.reset(SpeechUI.NO_AUDIO_TIMEOUT_SECONDS)
    this.animateSpeechBubble(true)
    this.animateSpeechIcon(true)
    this.asrVoiceController.startListening()
  }

  stopListening() {
    this.logger.info("Disabling speech UI")
    this.animateSpeechIcon(false)
    this.asrVoiceController.stopListening()
  }

  @bindUpdateEvent
  private onUpdate() {
    const camPos = this.mainCamTrans.getWorldPosition()
    let desiredPosition = camPos.add(this.mainCamTrans.forward.uniformScale(-UI_CAM_DISTANCE))
    desiredPosition = desiredPosition.add(this.mainCamTrans.up.uniformScale(UI_CAM_HEIGHT))
    this.trans.setWorldPosition(vec3.lerp(this.trans.getWorldPosition(), desiredPosition, getDeltaTime() * 10))
    const desiredRotation = quat.lookAt(this.mainCamTrans.forward, vec3.up())
    this.trans.setWorldRotation(quat.slerp(this.trans.getWorldRotation(), desiredRotation, getDeltaTime() * 10))
  }

  private animateSpeechIcon(active: boolean) {
    this.micRend.mainPass.Tweak_N23 = active ? 3 : 0
    this.micRend.mainPass.Tweak_N33 = active ? 3 : 0
    this.micRend.mainPass.Tweak_N37 = active ? 0.2 : 0
  }

  private animateSpeechBubble(open: boolean) {
    const currScale = this.speechBubbleTrans.getLocalScale()
    const desiredScale = open ? vec3.one() : vec3.zero()
    animate({
      easing: "ease-out-elastic",
      duration: 1,
      update: (t) => {
        this.speechBubbleTrans.setLocalScale(vec3.lerp(currScale, desiredScale, t))
      },
      ended: null,
      cancelSet: new CancelSet()
    })
  }
}
