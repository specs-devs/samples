/**
 * Specs Inc. 2026
 * Music Player component for the AI Music Gen Spectacles lens.
 */
import {DynamicAudioOutput} from "RemoteServiceGateway.lspkg/Helpers/DynamicAudioOutput"
import {bindStartEvent, bindUpdateEvent} from "SnapDecorators.lspkg/decorators"
import {setTimeout} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils"
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
  private _isTrackPaused: boolean = false
  // Dedicated component for downloaded AudioTrackAssets. DynamicAudioOutput owns
  // _audioComponent (it re-binds it to its PCM stream and plays it on loop at start);
  // sharing it for track playback yields silence and player lockups on device.
  private _trackComponent: AudioComponent = null
  // On device, AudioComponent throws "Audio player is not enabled" on
  // stop()/isPlaying()/isPaused() before its first play() (editor allows it),
  // so playback state is tracked here instead of queried from the component.
  private _trackStarted: boolean = false
  private _pcmInitialized: boolean = false

  onAwake() {
    this.logger = new Logger("MusicPlayer", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    // Set up finish callback on AudioComponent if provided
    if (this._audioComponent) {
      this._audioComponent.setOnFinish((audioComponent: AudioComponent) => {
        if (this._onFinishCallback) {
          this._onFinishCallback()
        }
      })
    }
  }

  /**
   * DynamicAudioOutput.initialize() puts its AudioComponent into an endless play(-1)
   * of the PCM output stream, which pushes empty audio frames into the lens audio
   * graph from lens start. Only the inline-PCM path needs it, so initialize lazily
   * instead of at onStart - the Snap Cloud track path never touches it.
   */
  private ensurePcmOutput(): void {
    if (this._pcmInitialized) {
      return
    }
    this._dynamicAudioOutput.initialize(48000)
    this._pcmInitialized = true
  }

  @bindUpdateEvent
  private _checkAudioFinished(): void {
    // Check if audio was playing but the active AudioComponent stopped
    const active = this._trackComponent ? this._trackComponent : this._audioComponent
    if (this._wasPlaying && active) {
      if (!active.isPlaying()) {
        // Audio finished playing
        if (this._onFinishCallback) {
          this._onFinishCallback()
        }
        this._wasPlaying = false
      }
    }
  }

  private _getTrackComponent(): AudioComponent {
    if (!this._trackComponent) {
      this._trackComponent = this.sceneObject.createComponent("Component.AudioComponent") as AudioComponent
      this._trackComponent.volume = 1.0
      this._trackComponent.setOnFinish(() => {
        if (this._onFinishCallback) {
          this._onFinishCallback()
        }
      })
    }
    return this._trackComponent
  }

  setOnFinish(callback: () => void) {
    this._onFinishCallback = callback
  }

  playAudio(uint8Array: Uint8Array) {
    this.logger.info("Playing audio")
    this.ensurePcmOutput()
    this._dynamicAudioOutput.interruptAudioOutput()
    this._dynamicAudioOutput.addAudioFrame(uint8Array, 2)
    this._wasPlaying = true
  }

  pauseAudio() {
    this.logger.info("Pausing audio")
    if (this._pcmInitialized) {
      this._dynamicAudioOutput.interruptAudioOutput()
    }
    this._wasPlaying = false
  }

  /**
   * Assign a downloaded AudioTrackAsset (e.g. from Snap Cloud Storage) for playback
   * through the AudioComponent. Returns the track duration in seconds.
   */
  setTrack(audioAsset: AudioTrackAsset): number {
    const track = this._getTrackComponent()
    // Only stop a playback this controller started itself - never query or stop
    // the component before its first play() (throws on device)
    if (this._trackStarted) {
      track.stop(false)
      this._trackStarted = false
    }
    track.audioTrack = audioAsset
    this._isTrackPaused = false
    return track.duration
  }

  playTrack() {
    this.logger.info("Playing audio track")
    const track = this._getTrackComponent()
    if (!track.sceneObject.enabled) {
      track.sceneObject.enabled = true
    }
    if (!track.enabled) {
      track.enabled = true
    }
    if (this._isTrackPaused && this._trackStarted) {
      track.resume()
    } else {
      track.volume = 1.0
      track.play(1)
      this._trackStarted = true
    }
    this._isTrackPaused = false
    this._wasPlaying = true
    // Diagnostic: after the first play() the state queries are safe; duration 0
    // would mean the downloaded asset has no decodable audio on this platform
    this.logger.info(`Track state: duration=${track.duration}s, volume=${track.volume}`)
    setTimeout(() => {
      if (this._trackStarted && !this._isTrackPaused) {
        this.logger.info(`Track state after 1s: isPlaying=${track.isPlaying()}, position=${(track as any).position}`)
      }
    }, 1000)
  }

  pauseTrack() {
    this.logger.info("Pausing audio track")
    this._wasPlaying = false
    if (!this._trackStarted) {
      return
    }
    this._isTrackPaused = true
    this._getTrackComponent().pause()
  }
}
