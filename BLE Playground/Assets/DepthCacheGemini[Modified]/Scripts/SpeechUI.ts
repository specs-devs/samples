/**
 * Specs Inc. 2026
 * Speech UI component for the BLE Playground Spectacles lens.
 */
import animate, {CancelSet} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {bindStartEvent, bindUpdateEvent} from "SnapDecorators.lspkg/decorators"
import {ASRController} from "./ASRController"

const UI_CAM_DISTANCE = 50
const UI_CAM_HEIGHT = -9

@component
export class SpeechUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SpeechUI – speech input panel with ASR feedback</span><br/><span style="color: #94A3B8; font-size: 11px;">Follows the camera, displays partial and final ASR transcriptions, and animates the microphone icon.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Main camera scene object used to compute the follow position and look-at rotation")
  mainCamObj: SceneObject

  @input
  @hint("Anchor scene object for the speech bubble; scaled to zero when hidden")
  speecBocAnchor: SceneObject

  @input
  @hint("Microphone render mesh visual whose material parameters are animated when listening")
  micRend: RenderMeshVisual

  @input
  @hint("Text component that shows the current partial or final ASR transcript")
  speechText: Text

  @input
  @hint("ASRController component that drives voice capture and fires transcription events")
  asrVoiceController: ASRController

  @input
  @hint("Collider that intercepts taps on the speech button; disabled while a request is running")
  speechButtonCollider: ColliderComponent

  onSpeechReady = new Event<string>()

  private speechBubbleTrans: Transform
  private trans: Transform
  private mainCamTrans: Transform

  onAwake() {
    this.speechBubbleTrans = this.speecBocAnchor.getTransform()
    this.speechBubbleTrans.setLocalScale(vec3.zero())
    this.trans = this.getSceneObject().getTransform()
    this.mainCamTrans = this.mainCamObj.getTransform()
    this.animateSpeechIcon(false)
    this.speechText.text = ""
  }

  @bindStartEvent
  private onStart() {
    this.asrVoiceController.onPartialVoiceEvent.add((text) => {
      this.speechText.text = text
    })
    this.asrVoiceController.onFinalVoiceEvent.add((text) => {
      this.speechText.text = text
      this.stopListening()
      this.onSpeechReady.invoke(text)
    })
  }

  activateSpeechButton(activate: boolean) {
    this.speechButtonCollider.enabled = activate
  }

  onSpeechButtonDown() {
    this.speechText.text = ""
    this.animateSpeechBubble(true)
    this.animateSpeechIcon(true)
    this.asrVoiceController.startListening()
  }

  stopListening() {
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
