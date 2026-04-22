/**
 * Specs Inc. 2026
 * ASRQuery Controller for the BLE Playground Spectacles lens experience.
 */
import {RoundButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"

@component
export class ASRQueryController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ASRQueryController – voice query capture controller</span><br/><span style="color: #94A3B8; font-size: 11px;">Records a voice query on button pinch and emits the transcribed string via onQueryEvent.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @allowUndefined
  @input
  @hint("Round button that triggers voice recording when pinched")
  private button: RoundButton

  @input
  @hint("Scene object shown while recording is active, hidden when idle")
  private activityIndicator: SceneObject

  @allowUndefined
  @input
  @hint("Text component that displays the live ASR transcription")
  private transcriptionText: Text

  private asrModule: AsrModule = require("LensStudio:AsrModule")
  private isRecording: boolean = false

  public onQueryEvent: Event<string> = new Event<string>()

  private tr: Transform
  private shownLocalPosition: vec3
  private hiddenLocalPosition: vec3

  onAwake() {
    this.tr = this.getTransform()
    this.shownLocalPosition = vec3.zero()
    this.hiddenLocalPosition = new vec3(0, 3000, 0)
    this.tr.setLocalPosition(this.hiddenLocalPosition)
    if (this.activityIndicator) {
      this.activityIndicator.enabled = false
    }
  }

  @bindStartEvent
  private onStart() {
    if (this.button) {
      this.button.onTriggerUp.add(() => {
        this.getVoiceQuery().then((query) => {
          this.onQueryEvent.invoke(query)
        })
      })
    }
  }

  show() {
    this.tr.setLocalPosition(this.shownLocalPosition)
  }

  hide() {
    this.tr.setLocalPosition(this.hiddenLocalPosition)
  }

  getVoiceQuery(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.isRecording) {
        this.setActivityIndicator(false)
        this.asrModule.stopTranscribing()
        this.isRecording = false
        reject("Already recording, cancelling")
        return
      }
      this.isRecording = true
      const asrSettings = AsrModule.AsrTranscriptionOptions.create()
      asrSettings.mode = AsrModule.AsrMode.HighAccuracy
      asrSettings.silenceUntilTerminationMs = 1500
      asrSettings.onTranscriptionUpdateEvent.add((asrOutput) => {
        if (this.transcriptionText) {
          this.transcriptionText.text = asrOutput.text
        }
        if (asrOutput.isFinal) {
          this.isRecording = false
          this.setActivityIndicator(false)
          this.asrModule.stopTranscribing()
          resolve(asrOutput.text)
        }
      })
      asrSettings.onTranscriptionErrorEvent.add((asrOutput) => {
        this.isRecording = false
        this.setActivityIndicator(false)
        reject(asrOutput)
      })
      if (this.transcriptionText) {
        this.transcriptionText.text = "Listening..."
      }
      this.setActivityIndicator(true)
      this.asrModule.startTranscribing(asrSettings)
    })
  }

  private setActivityIndicator(on: boolean) {
    if (this.activityIndicator) {
      this.activityIndicator.enabled = on
    }
  }
}
