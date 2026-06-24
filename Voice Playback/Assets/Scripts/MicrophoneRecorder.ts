/**
 * Specs Inc. 2026
 * Microphone Recorder component for the Voice Playback Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"

type AudioFrameData = {
  audioFrame: Float32Array
  audioFrameShape: vec3
}

const SAMPLE_RATE = 44100

@component
export class MicrophoneRecorder extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MicrophoneRecorder – Records and plays back microphone audio</span><br/><span style="color: #94A3B8; font-size: 11px;">Assign the microphone and output audio track assets to get started.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Audio Assets</span>')
  @input
  @hint("Audio track asset used as the microphone input source")
  microphoneAsset: AudioTrackAsset

  @input
  @hint("Audio track asset used for playback output")
  audioOutput: AudioTrackAsset

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Debug</span>')
  @input
  @allowUndefined
  @hint("Optional text component for displaying recording and playback status")
  debugText: Text

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private audioComponent: AudioComponent
  private recordAudioUpdateEvent: UpdateEvent
  private playbackAudioUpdateEvent: UpdateEvent

  private microphoneControl: MicrophoneAudioProvider
  private audioOutputProvider: AudioOutputProvider

  private recordedAudioFrames: AudioFrameData[] = []

  private numberOfSamples: number = 0
  private _recordingDuration: number = 0

  private currentPlaybackTime: number = 0

  onAwake() {
    this.logger = new Logger("MicrophoneRecorder", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.microphoneControl = this.microphoneAsset.control as MicrophoneAudioProvider
    this.microphoneControl.sampleRate = SAMPLE_RATE

    this.audioComponent = this.sceneObject.createComponent("AudioComponent")
    this.audioComponent.audioTrack = this.audioOutput
    this.audioOutputProvider = this.audioOutput.control as AudioOutputProvider
    this.audioOutputProvider.sampleRate = SAMPLE_RATE

    this.recordAudioUpdateEvent = this.createEvent("UpdateEvent")
    this.recordAudioUpdateEvent.bind(() => {
      this.onRecordAudio()
    })
    this.recordAudioUpdateEvent.enabled = false

    this.playbackAudioUpdateEvent = this.createEvent("UpdateEvent")
    this.playbackAudioUpdateEvent.bind(() => {
      this.onPlaybackAudio()
    })
    this.playbackAudioUpdateEvent.enabled = false
  }

  private onRecordAudio() {
    const frameSize: number = this.microphoneControl.maxFrameSize
    let audioFrame = new Float32Array(frameSize)

    const audioFrameShape = this.microphoneControl.getAudioFrame(audioFrame)

    if (audioFrameShape.x === 0) {
      return
    }

    audioFrame = audioFrame.subarray(0, audioFrameShape.x)

    this.numberOfSamples += audioFrameShape.x
    this._recordingDuration = this.numberOfSamples / SAMPLE_RATE

    this.updateRecordingDebugText()

    this.recordedAudioFrames.push({
      audioFrame: audioFrame,
      audioFrameShape: audioFrameShape
    })
  }

  private onPlaybackAudio() {
    this.currentPlaybackTime += getDeltaTime()
    this.currentPlaybackTime = Math.min(this.currentPlaybackTime, this._recordingDuration)

    this.updatePlaybackDebugText()

    if (this.currentPlaybackTime >= this._recordingDuration) {
      this.audioComponent.stop(false)
      this.playbackAudioUpdateEvent.enabled = false
    }
  }

  updateRecordingDebugText() {
    if (isNull(this.debugText)) {
      return
    }

    this.debugText.text = "Duration: " + this._recordingDuration.toFixed(1) + "s"
    this.debugText.text += "\n Size: " + (this.getTotalRecordedBytes() / 1000).toFixed(1) + "kB"
    this.debugText.text += "\nSample Rate: " + SAMPLE_RATE
  }

  updatePlaybackDebugText() {
    if (this.numberOfSamples <= 0) {
      this.debugText.text = "Oops! \nNo audio has been recorded yet. Please try recording again."
      return
    }

    this.debugText.text = "Playback Time: \n"
    this.debugText.text += this.currentPlaybackTime.toFixed(1) + "s / " + this._recordingDuration.toFixed(1) + "s"
  }

  recordMicrophoneAudio(toRecord: boolean) {
    if (toRecord) {
      this.logger.info("Starting microphone recording")
      this.recordedAudioFrames = []
      this.audioComponent.stop(false)
      this.numberOfSamples = 0
      this.microphoneControl.start()
      this.recordAudioUpdateEvent.enabled = true
      this.playbackAudioUpdateEvent.enabled = false
    } else {
      this.logger.info("Stopping microphone recording")
      this.microphoneControl.stop()
      this.recordAudioUpdateEvent.enabled = false
    }
  }

  playbackRecordedAudio(): boolean {
    this.updatePlaybackDebugText()
    if (this.recordedAudioFrames.length <= 0) {
      this.logger.warn("No recorded audio frames available for playback")
      return false
    }
    this.logger.info("Starting audio playback")
    this.currentPlaybackTime = 0
    this.audioComponent.stop(false)
    this.playbackAudioUpdateEvent.enabled = true
    this.audioComponent.play(-1)
    for (let i = 0; i < this.recordedAudioFrames.length; i++) {
      this.audioOutputProvider.enqueueAudioFrame(
        this.recordedAudioFrames[i].audioFrame,
        this.recordedAudioFrames[i].audioFrameShape
      )
    }
    return true
  }

  public get recordingDuration(): number {
    return this._recordingDuration
  }

  private getTotalRecordedBytes(): number {
    let totalBytes = 0
    for (const frame of this.recordedAudioFrames) {
      totalBytes += frame.audioFrame.byteLength
    }
    return totalBytes
  }
}
