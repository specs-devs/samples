/**
 * Specs Inc. 2026
 * Music Player component for the AI Music Gen Spectacles lens.
 */
import {DynamicAudioOutput} from "RemoteServiceGateway.lspkg/Helpers/DynamicAudioOutput"
import {bindStartEvent, bindUpdateEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class MusicPlayer extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Music Player – PCM audio playback controller</span><br/><span style="color: #94A3B8; font-size: 11px;">Manages DynamicAudioOutput and detects playback completion.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("DynamicAudioOutput component used for PCM audio streaming")
  private _dynamicAudioOutput: DynamicAudioOutput

  @input
  @hint("AudioComponent used to detect when playback finishes")
  private _audioComponent: AudioComponent

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private _onFinishCallback: () => void
  private _wasPlaying: boolean = false

  onAwake() {
    this.logger = new Logger("MusicPlayer", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this._dynamicAudioOutput.initialize(48000)
    // Set up finish callback on AudioComponent if provided
    if (this._audioComponent) {
      this._audioComponent.setOnFinish((audioComponent: AudioComponent) => {
        if (this._onFinishCallback) {
          this._onFinishCallback()
        }
      })
    }
  }

  @bindUpdateEvent
  private _checkAudioFinished(): void {
    // Check if audio was playing but AudioComponent stopped
    if (this._wasPlaying && this._audioComponent) {
      if (!this._audioComponent.isPlaying()) {
        // Audio finished playing
        if (this._onFinishCallback) {
          this._onFinishCallback()
        }
        this._wasPlaying = false
      }
    }
  }

  setOnFinish(callback: () => void) {
    this._onFinishCallback = callback
  }

  playAudio(uint8Array: Uint8Array) {
    this.logger.info("Playing audio")
    this._dynamicAudioOutput.interruptAudioOutput()
    this._dynamicAudioOutput.addAudioFrame(uint8Array, 2)
    this._wasPlaying = true
  }

  pauseAudio() {
    this.logger.info("Pausing audio")
    this._dynamicAudioOutput.interruptAudioOutput()
    this._wasPlaying = false
  }
}
