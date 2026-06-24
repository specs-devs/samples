/**
 * Specs Inc. 2026
 * Audio Controller for the DJ Specs Spectacles lens experience.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindLateUpdateEvent } from "SnapDecorators.lspkg/decorators";
import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import { FloatArrayWrapper } from "./FloatArrayWrapper";
import { SharedState } from "./SharedState";

function createFloatArrayWrapper(): FloatArrayWrapper {
  const G = globalThis as unknown as { FloatArrayWrapper?: new () => FloatArrayWrapper };
  const Ctor =
    typeof G.FloatArrayWrapper === "function" ? G.FloatArrayWrapper : FloatArrayWrapper;
  return new Ctor();
}

@component
export class AudioController extends BaseScriptComponent {
  @ui.label(
    '<span style="color: #60A5FA;">AudioController – dual-deck audio engine</span><br/><span style="color: #94A3B8; font-size: 11px;">Manages two audio decks with real-time speed and volume control.</span>'
  )
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Audio Tracks</span>')
  @input("Asset.AudioTrackAsset[]")
  @hint("Array of audio tracks to load into the deck")
  inputTrack: AudioTrackAsset[];

  @ui.label('<span style="color: #60A5FA;">Audio Components</span>')
  @input("Component.AudioComponent")
  @hint("Loop audio component for deck 1")
  loopAudio: AudioComponent;

  @input("Component.AudioComponent")
  @hint("Loop audio component for deck 2")
  loopAudio2: AudioComponent;

  @input("Asset.AudioTrackAsset")
  @hint("Output audio track asset for the mixed signal")
  outputAudio: AudioTrackAsset;

  @input("Component.AudioComponent")
  @hint("Main audio output component that plays the mixed signal")
  audio: AudioComponent;

  @input("number")
  @hint("Sample rate for audio processing in Hz")
  sampleRate: number = 44100;

  @input
  @hint("Parent scene object containing predefined audio components")
  predefinedAudioParent: SceneObject;

  @ui.label('<span style="color: #60A5FA;">Track Buttons</span>')
  @input
  @hint("Array of RectangleButton components — one per track, in order")
  trackButtons: RectangleButton[];

  @input
  @hint("DJ parent scene object")
  djParent: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;

  rate: number = 1.0;
  rate2: number = 1.0;
  volume: number = 1.0;
  volume2: number = 1.0;

  private audioData: FloatArrayWrapper | null = null;
  private audioData2: FloatArrayWrapper | null = null;
  private audioSource: any = null;
  private audioSource2: any = null;
  private audioFrame: Float32Array | null = null;
  private audioFrame2: Float32Array | null = null;
  private resultFrame: Float32Array | null = null;
  private audioOutput: any;
  private phase: number = 0.0;
  private phase1: number = 0.0;
  private trackOnDeck: boolean = false;
  private trackOnDeck2: boolean = false;
  private audioArrays: FloatArrayWrapper[] = [];

  onAwake(): void {
    this.logger = new Logger(
      "AudioController",
      this.enableLogging || this.enableLoggingLifecycle,
      true
    );
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");

    SharedState.currentTrackIndex = 0;

    this.audioOutput = (this.outputAudio as any).control;
    this.audioOutput.sampleRate = this.sampleRate;
    this.audioOutput.loops = -1;

    this.loadTracks();

    this.audio.play(-1);
  }

  onStart(): void {
    this.subscribeToTrackButtons();
  }

  setNextTrack(): void {
    this.setTrack(this.inputTrack[SharedState.currentTrackIndex]);
  }

  setNextTrack2(): void {
    this.setTrack2(this.inputTrack[SharedState.currentTrackIndex]);
  }

  setTrack(audioTrack: AudioTrackAsset): void {
    this.logger.info(String(SharedState.currentTrackIndex));
    this.logger.info("SET TRACK");
    this.phase = 0.0;
    this.audioData = this.audioArrays[SharedState.currentTrackIndex];
    this.logger.debug(String(this.audioData));

    this.audioSource = (audioTrack as any).control;
    this.audioSource.sampleRate = this.sampleRate;
    this.audioSource.loops = 1;

    this.audioFrame = new Float32Array(this.audioSource.maxFrameSize);
    this.resultFrame = new Float32Array(this.audioSource.maxFrameSize);
    this.recordUpdate();
  }

  setTrack2(audioTrack: AudioTrackAsset): void {
    this.logger.info(String(SharedState.currentTrackIndex));
    this.logger.info("SET TRACK2");
    this.phase1 = 0.0;
    this.audioData2 = this.audioArrays[SharedState.currentTrackIndex];
    this.logger.debug(String(this.audioData2));

    this.audioSource2 = (audioTrack as any).control;
    this.audioSource2.sampleRate = this.sampleRate;
    this.audioSource2.loops = 1;

    this.audioFrame2 = new Float32Array(this.audioSource2.maxFrameSize);
    this.resultFrame = new Float32Array(this.audioSource2.maxFrameSize);
    this.recordUpdate2();
  }

  setOnDeck(onDeck: boolean): void {
    this.trackOnDeck = onDeck;
    this.audioSource = null;
    this.audioData = null;
    this.audioFrame = null;
  }

  setOnDeck2(onDeck: boolean): void {
    this.trackOnDeck2 = onDeck;
    this.audioSource2 = null;
    this.audioData2 = null;
    this.audioFrame2 = null;
  }

  private subscribeToTrackButtons(): void {
    for (let i = 0; i < this.trackButtons.length; i++) {
      const index = i;
      const btn = this.trackButtons[i];
      if (!btn) {
        this.logger.warn(`trackButtons[${i}] is not assigned`);
        continue;
      }
      btn.onTriggerUp.add(() => {
        SharedState.currentTrackIndex = index;
        this.setNextTrack();
      });
    }
  }

  private loadTracks(): void {
    if (!this.inputTrack || this.inputTrack.length === 0) {
      this.logger.warn("loadTracks: inputTrack is empty or not assigned");
      return;
    }
    for (let i = 0; i < this.inputTrack.length; i++) {
      const track = this.inputTrack[i];
      if (!track) {
        this.logger.warn(`loadTracks: inputTrack[${i}] is not assigned`);
        continue;
      }
      const audioSource = (track as any).control;
      if (!audioSource || typeof audioSource.maxFrameSize !== "number") {
        this.logger.warn(`loadTracks: track[${i}] has no valid control / maxFrameSize`);
        continue;
      }
      const audioData = createFloatArrayWrapper();
      const audioFrame = new Float32Array(audioSource.maxFrameSize);
      this.decodeTrackIntoWrapper(audioSource, audioData, audioFrame);
      this.audioArrays[i] = audioData;
    }
  }

  /** File providers expose getAudioBuffer; some runtimes only expose getAudioFrame. */
  private decodeTrackIntoWrapper(
    audioSource: any,
    audioData: FloatArrayWrapper,
    audioFrame: Float32Array
  ): void {
    const readBuffer = audioSource.getAudioBuffer;
    if (typeof readBuffer === "function") {
      let shape = readBuffer.call(audioSource, audioFrame, 4096);
      while (shape.x !== 0) {
        audioData.push(audioFrame, shape.x);
        shape = readBuffer.call(audioSource, audioFrame, 4096);
      }
      return;
    }
    const readFrame = audioSource.getAudioFrame;
    if (typeof readFrame === "function") {
      let shape = readFrame.call(audioSource, audioFrame);
      while (shape.x !== 0) {
        audioData.push(audioFrame, shape.x);
        shape = readFrame.call(audioSource, audioFrame);
      }
      return;
    }
    this.logger.warn(
      "Audio track control has neither getAudioBuffer nor getAudioFrame; track decode skipped."
    );
  }

  private recordUpdate(): void {
    this.trackOnDeck = true;
  }

  private recordUpdate2(): void {
    this.trackOnDeck2 = true;
  }

  @bindLateUpdateEvent
  private onLateUpdate(): void {
    this.play();
  }

  private play(): void {
    const size = this.audioOutput.getPreferredFrameSize();

    for (let i = 0; i < size; i++) {
      let audioSourceUpdateData = 0.0;
      let audioSource2UpdateData = 0.0;

      if (this.trackOnDeck && this.audioData) {
        this.phase += this.rate;
        audioSourceUpdateData = this.audioData.getElement(Math.round(this.phase)) * this.volume;
      }
      if (this.trackOnDeck2 && this.audioData2) {
        this.phase1 += this.rate2;
        audioSource2UpdateData =
          this.audioData2.getElement(Math.round(this.phase1)) * this.volume2;
      }

      if (this.resultFrame) {
        if (this.trackOnDeck && this.trackOnDeck2) {
          this.resultFrame[i] = audioSourceUpdateData + audioSource2UpdateData;
        } else if (this.trackOnDeck) {
          this.resultFrame[i] = audioSourceUpdateData;
        } else if (this.trackOnDeck2) {
          this.resultFrame[i] = audioSource2UpdateData;
        }
      }
    }

    if (this.trackOnDeck && this.trackOnDeck2 && this.resultFrame) {
      if (this.audioData && (this.phase >= this.audioData.getSize() || this.rate === 0)) {
        this.phase = 0;
      }
      if (this.audioData2 && (this.phase1 >= this.audioData2.getSize() || this.rate2 === 0)) {
        this.phase1 = 0;
      }
      this.audioOutput.enqueueAudioFrame(this.resultFrame, new vec3(size, 1, 1));
    } else if (this.trackOnDeck && this.resultFrame) {
      if (this.audioData && (this.phase >= this.audioData.getSize() || this.rate === 0)) {
        this.phase = 0;
      }
      this.audioOutput.enqueueAudioFrame(this.resultFrame, new vec3(size, 1, 1));
    } else if (this.trackOnDeck2 && this.resultFrame) {
      if (this.audioData2 && (this.phase1 >= this.audioData2.getSize() || this.rate2 === 0)) {
        this.phase1 = 0;
      }
      this.audioOutput.enqueueAudioFrame(this.resultFrame, new vec3(size, 1, 1));
    }
  }
}
