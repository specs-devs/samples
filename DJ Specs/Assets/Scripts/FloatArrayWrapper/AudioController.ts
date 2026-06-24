/**
 * Specs Inc. 2026
 * Audio Controller for the DJ Specs Spectacles lens experience.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindLateUpdateEvent } from "SnapDecorators.lspkg/decorators";
import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import { FloatArrayWrapper } from "./FloatArrayWrapper";
import { SharedState } from "./SharedState";
import { EMBEDDED_TRACKS } from "./EmbeddedTracks/EmbeddedTracks";

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

  // --- DEBUG: always-on pipeline instrumentation (remove once verified) ---
  private debugLastStatusTime: number = 0;
  private debugFirstEnqueueDone: boolean = false;

  // On device, getAudioBuffer never returns data for compressed (mp3) tracks
  // — verified: 30 retries × 4 tracks, all 0 samples — while in the editor it
  // decodes instantly. Device fallback: play each track muted and capture its
  // rendered frames in real time via getAudioFrame (the same pull mechanism
  // the microphone recorder uses on device). The tracks are ~15s loops, so
  // capture completes shortly after lens start.
  private mutedDecodeComponents: AudioComponent[] = [];
  private capturing: boolean = false;
  private captureBuffers: Float32Array[] = [];
  private captureTargets: number[] = [];
  private captureLastLogTime: number = 0;

  // On current SnapOS builds FileAudioTrackProvider exposes no data to
  // scripts at all (duration=0, getAudioBuffer/getAudioFrame return nothing,
  // verified for both mp3 and PCM wav) while normal AudioComponent playback
  // works fine. When that is detected, the decks drive the loopAudio /
  // loopAudio2 AudioComponents directly instead of synthesizing PCM:
  // play/stop on disk placement, live crossfader volume, pause when the
  // vinyl stops. Variable-speed scratching is unavailable in this mode.
  // NOTE: AudioComponent throws "Audio player is not enabled" on stop()/
  // isPlaying()/isPaused() before its first play(), so playback state is
  // tracked here instead of queried from the component.
  private devicePlaybackMode: boolean = false;
  private deck1Started: boolean = false;
  private deck1Paused: boolean = false;
  private deck2Started: boolean = false;
  private deck2Paused: boolean = false;

  // Output probe: synthesizes a 2s tone in code and enqueues it into the
  // Audio Output asset at lens start. If it is audible on device, the
  // mixer's output path works and only the PCM *source* needs replacing
  // (embedded track data) to restore full pitch/scratch on device.
  private probeSamplesRemaining: number = 0;
  private probePhase: number = 0;
  private probeStartTime: number = -1;

  onAwake(): void {
    print("[DJDebug] AudioController BUILD v9 — embedded PCM mixer");
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
    if (this.hasPendingDecodes()) {
      if (this.isProviderDataUnavailable()) {
        // The provider exposes no PCM on this OS build, but enqueueAudioFrame
        // works (verified with a tone probe) — feed the mixer from the
        // embedded base64 track data instead, keeping pitch/scratch intact.
        print("[DJDebug] provider exposes no audio data (duration=0) — loading embedded PCM");
        this.loadEmbeddedTracks();
        if (this.hasPendingDecodes()) {
          this.devicePlaybackMode = true;
          print("[DJDebug] embedded PCM incomplete — falling back to direct AudioComponent playback mode");
        } else {
          print("[DJDebug] embedded PCM loaded — full mixer active on device");
        }
      } else {
        this.startDecodeRetry();
      }
    }

    this.audio.play(-1);
    print(
      `[DJDebug] onAwake done: audio.play(-1) called, output sampleRate=${this.sampleRate}, preferredFrameSize=${this.audioOutput.getPreferredFrameSize()}`
    );
  }

  private hasPendingDecodes(): boolean {
    for (let i = 0; i < this.inputTrack.length; i++) {
      if (this.inputTrack[i] && this.audioArrays[i] && this.audioArrays[i].getSize() === 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Decodes the base64-embedded int16 PCM into the same FloatArrayWrapper
   * instances the mixer reads from. Chunks are aligned to even byte counts,
   * so each decodes independently.
   */
  private loadEmbeddedTracks(): void {
    const t0 = getTime();
    for (let i = 0; i < this.inputTrack.length; i++) {
      const wrapper = this.audioArrays[i];
      if (!wrapper || wrapper.getSize() > 0) {
        continue;
      }
      const chunks = EMBEDDED_TRACKS[i];
      if (!chunks) {
        print(`[DJDebug] embedded: no data for track[${i}]`);
        continue;
      }
      for (const chunk of chunks) {
        const bytes = Base64.decode(chunk);
        const sampleCount = Math.floor(bytes.length / 2);
        const samples = new Float32Array(sampleCount);
        for (let s = 0; s < sampleCount; s++) {
          let v = bytes[2 * s] | (bytes[2 * s + 1] << 8);
          if (v >= 32768) {
            v -= 65536;
          }
          samples[s] = v / 32768;
        }
        wrapper.push(samples, sampleCount);
      }
      print(`[DJDebug] embedded: track[${i}] loaded ${wrapper.getSize()} samples`);
    }
    print(`[DJDebug] embedded PCM decode took ${(getTime() - t0).toFixed(2)}s`);
  }

  /** True when every undecoded track's provider also reports zero duration. */
  private isProviderDataUnavailable(): boolean {
    for (let i = 0; i < this.inputTrack.length; i++) {
      if (!this.inputTrack[i] || !this.audioArrays[i] || this.audioArrays[i].getSize() > 0) {
        continue;
      }
      const src = (this.inputTrack[i] as any).control;
      if (src && src.duration > 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Device fallback: plays every undecoded track muted and records its
   * rendered frames in real time from getAudioFrame on each LateUpdate until
   * a full loop (provider.duration) is captured. Decks reference the same
   * FloatArrayWrapper instances, so a deck that is already active starts
   * sounding as its wrapper fills.
   */
  private startDecodeRetry(): void {
    if (!this.predefinedAudioParent) {
      print("[DJDebug] predefinedAudioParent not assigned — cannot run muted-capture fallback");
      return;
    }
    print("[DJDebug] starting real-time capture fallback — muted playback + getAudioFrame");
    for (let i = 0; i < this.inputTrack.length; i++) {
      if (!this.inputTrack[i] || !this.audioArrays[i] || this.audioArrays[i].getSize() > 0) {
        continue;
      }
      const src = (this.inputTrack[i] as any).control;
      src.sampleRate = this.sampleRate;
      src.position = 0;
      this.captureBuffers[i] = new Float32Array(src.maxFrameSize);
      this.captureTargets[i] = Math.max(1, Math.ceil(src.duration * this.sampleRate));

      const comp = this.predefinedAudioParent.createComponent("Component.AudioComponent") as AudioComponent;
      comp.audioTrack = this.inputTrack[i];
      comp.volume = 0;
      comp.play(-1);
      this.mutedDecodeComponents.push(comp);
      print(`[DJDebug] capture started: track[${i}] duration=${src.duration.toFixed(1)}s target=${this.captureTargets[i]} samples`);
    }
    this.capturing = true;
  }

  private captureAudioFrames(): void {
    let pending = 0;
    for (let i = 0; i < this.inputTrack.length; i++) {
      const wrapper = this.audioArrays[i];
      const buf = this.captureBuffers[i];
      const target = this.captureTargets[i];
      if (!wrapper || !buf || !target || wrapper.getSize() >= target) {
        continue;
      }
      const src = (this.inputTrack[i] as any).control;
      let shape = src.getAudioFrame(buf);
      let guard = 0;
      while (shape.x > 0 && wrapper.getSize() < target && guard < 64) {
        wrapper.push(buf, shape.x);
        shape = src.getAudioFrame(buf);
        guard++;
      }
      if (wrapper.getSize() >= target) {
        print(`[DJDebug] capture complete: track[${i}] ${wrapper.getSize()} samples`);
      } else {
        pending++;
      }
    }

    if (getTime() - this.captureLastLogTime >= 1.0) {
      this.captureLastLogTime = getTime();
      const progress = this.inputTrack
        .map((t, i) =>
          this.captureTargets[i] ? `t${i}=${this.audioArrays[i].getSize()}/${this.captureTargets[i]}` : `t${i}=ok`
        )
        .join(" ");
      print(`[DJDebug] capturing: ${progress}`);
    }

    if (pending === 0) {
      this.capturing = false;
      print("[DJDebug] all tracks captured — stopping muted players");
      this.stopMutedDecodeComponents();
    }
  }

  private stopMutedDecodeComponents(): void {
    this.mutedDecodeComponents.forEach((comp) => {
      comp.stop(false);
      comp.destroy();
    });
    this.mutedDecodeComponents = [];
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
    if (this.devicePlaybackMode) {
      print(`[DJDebug] direct playback: deck1 plays track[${SharedState.currentTrackIndex}]`);
      this.startDeckPlayback(this.loopAudio, audioTrack, this.volume, this.deck1Started);
      this.deck1Started = true;
      this.deck1Paused = false;
      this.trackOnDeck = true;
      return;
    }
    this.phase = 0.0;
    this.audioData = this.audioArrays[SharedState.currentTrackIndex];
    this.logger.debug(String(this.audioData));

    this.audioSource = (audioTrack as any).control;
    this.audioSource.sampleRate = this.sampleRate;
    this.audioSource.loops = 1;

    // maxFrameSize is unreliable on devices where the provider is inert —
    // never size the mix buffer below the output's preferred frame size.
    const frameSize = Math.max(this.audioSource.maxFrameSize || 0, this.audioOutput.getPreferredFrameSize());
    this.audioFrame = new Float32Array(frameSize);
    this.resultFrame = new Float32Array(frameSize);
    print(
      `[DJDebug] setTrack idx=${SharedState.currentTrackIndex} decodedSamples=${this.audioData ? this.audioData.getSize() : "NULL"}`
    );
    this.recordUpdate();
  }

  setTrack2(audioTrack: AudioTrackAsset): void {
    this.logger.info(String(SharedState.currentTrackIndex));
    this.logger.info("SET TRACK2");
    if (this.devicePlaybackMode) {
      print(`[DJDebug] direct playback: deck2 plays track[${SharedState.currentTrackIndex}]`);
      this.startDeckPlayback(this.loopAudio2, audioTrack, this.volume2, this.deck2Started);
      this.deck2Started = true;
      this.deck2Paused = false;
      this.trackOnDeck2 = true;
      return;
    }
    this.phase1 = 0.0;
    this.audioData2 = this.audioArrays[SharedState.currentTrackIndex];
    this.logger.debug(String(this.audioData2));

    this.audioSource2 = (audioTrack as any).control;
    this.audioSource2.sampleRate = this.sampleRate;
    this.audioSource2.loops = 1;

    const frameSize2 = Math.max(this.audioSource2.maxFrameSize || 0, this.audioOutput.getPreferredFrameSize());
    this.audioFrame2 = new Float32Array(frameSize2);
    this.resultFrame = new Float32Array(frameSize2);
    print(
      `[DJDebug] setTrack2 idx=${SharedState.currentTrackIndex} decodedSamples=${this.audioData2 ? this.audioData2.getSize() : "NULL"}`
    );
    this.recordUpdate2();
  }

  setOnDeck(onDeck: boolean): void {
    print(`[DJDebug] AudioController.setOnDeck(${onDeck}) — deck 1 data cleared`);
    this.trackOnDeck = onDeck;
    if (this.devicePlaybackMode && !onDeck && this.deck1Started) {
      this.loopAudio.stop(true);
      this.deck1Started = false;
      this.deck1Paused = false;
    }
    this.audioSource = null;
    this.audioData = null;
    this.audioFrame = null;
  }

  setOnDeck2(onDeck: boolean): void {
    print(`[DJDebug] AudioController.setOnDeck2(${onDeck}) — deck 2 data cleared`);
    this.trackOnDeck2 = onDeck;
    if (this.devicePlaybackMode && !onDeck && this.deck2Started) {
      this.loopAudio2.stop(true);
      this.deck2Started = false;
      this.deck2Paused = false;
    }
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
      print(`[DJDebug] loadTracks: track[${i}] decoded ${audioData.getSize()} samples`);
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
      print("[DJDebug] decode: using getAudioBuffer");
      let shape = readBuffer.call(audioSource, audioFrame, 4096);
      while (shape.x !== 0) {
        audioData.push(audioFrame, shape.x);
        shape = readBuffer.call(audioSource, audioFrame, 4096);
      }
      return;
    }
    const readFrame = audioSource.getAudioFrame;
    if (typeof readFrame === "function") {
      print("[DJDebug] decode: using getAudioFrame");
      let shape = readFrame.call(audioSource, audioFrame);
      while (shape.x !== 0) {
        audioData.push(audioFrame, shape.x);
        shape = readFrame.call(audioSource, audioFrame);
      }
      return;
    }
    print("[DJDebug] decode FAILED: control has neither getAudioBuffer nor getAudioFrame — track will be silent");
  }

  private recordUpdate(): void {
    this.trackOnDeck = true;
  }

  private recordUpdate2(): void {
    this.trackOnDeck2 = true;
  }

  @bindLateUpdateEvent
  private onLateUpdate(): void {
    if (this.devicePlaybackMode) {
      this.runOutputProbe();
      this.updateDirectPlayback();
      return;
    }
    if (this.capturing) {
      this.captureAudioFrames();
    }
    this.play();
  }

  /**
   * AudioComponent's native player throws "Audio player is not enabled" on
   * stop()/isPlaying()/isPaused() before the first play(), so only stop a
   * session this controller started itself (wasStarted), and never query
   * player state.
   */
  private startDeckPlayback(comp: AudioComponent, track: AudioTrackAsset, vol: number, wasStarted: boolean): void {
    if (!comp.sceneObject.enabled) {
      comp.sceneObject.enabled = true;
    }
    if (!comp.enabled) {
      comp.enabled = true;
    }
    if (wasStarted) {
      comp.stop(false);
    }
    comp.audioTrack = track;
    comp.volume = Math.max(0, vol);
    comp.play(-1);
  }

  /** Enqueues 3 beeps (440Hz, 0.4s on / 0.4s off), starting 5s after awake. */
  private runOutputProbe(): void {
    if (this.probeSamplesRemaining <= 0 || getTime() < this.probeStartTime) {
      return;
    }
    if (this.probePhase === 0) {
      print("[DJDebug] output probe playing now — listen for 3 beeps");
    }
    const size = this.audioOutput.getPreferredFrameSize();
    const frame = new Float32Array(size);
    const step = (2 * Math.PI * 440) / this.sampleRate;
    const gateSamples = Math.floor(this.sampleRate * 0.4);
    for (let i = 0; i < size; i++) {
      const sampleIndex = this.sampleRate * 3 - this.probeSamplesRemaining + i;
      const gateOn = Math.floor(sampleIndex / gateSamples) % 2 === 0;
      frame[i] = gateOn ? Math.sin(this.probePhase) * 0.4 : 0;
      this.probePhase += step;
    }
    this.audioOutput.enqueueAudioFrame(frame, new vec3(size, 1, 1));
    this.probeSamplesRemaining -= size;
    if (this.probeSamplesRemaining <= 0) {
      print("[DJDebug] output probe done — if you heard the beeps, enqueueAudioFrame works and embedded PCM will restore the full mixer");
    }
  }

  /**
   * Direct-playback mode: live volume from the crossfader, and pause/resume
   * mirroring the vinyl rate (rate ~0 = vinyl stopped → pause the track).
   */
  private updateDirectPlayback(): void {
    if (this.trackOnDeck && this.deck1Started) {
      this.loopAudio.volume = Math.max(0, this.volume);
      const shouldPlay = Math.abs(this.rate) > 0.05;
      if (shouldPlay && this.deck1Paused) {
        this.loopAudio.resume();
        this.deck1Paused = false;
      } else if (!shouldPlay && !this.deck1Paused) {
        this.loopAudio.pause();
        this.deck1Paused = true;
      }
    }
    if (this.trackOnDeck2 && this.deck2Started) {
      this.loopAudio2.volume = Math.max(0, this.volume2);
      const shouldPlay2 = Math.abs(this.rate2) > 0.05;
      if (shouldPlay2 && this.deck2Paused) {
        this.loopAudio2.resume();
        this.deck2Paused = false;
      } else if (!shouldPlay2 && !this.deck2Paused) {
        this.loopAudio2.pause();
        this.deck2Paused = true;
      }
    }

    if ((this.trackOnDeck || this.trackOnDeck2) && getTime() - this.debugLastStatusTime >= 1.0) {
      this.debugLastStatusTime = getTime();
      print(
        `[DJDebug] direct: deck1(on=${this.trackOnDeck} started=${this.deck1Started} paused=${this.deck1Paused} vol=${this.volume.toFixed(2)} rate=${this.rate.toFixed(2)}) deck2(on=${this.trackOnDeck2} started=${this.deck2Started} paused=${this.deck2Paused} vol=${this.volume2.toFixed(2)} rate=${this.rate2.toFixed(2)})`
      );
    }
  }

  private play(): void {
    const size = this.audioOutput.getPreferredFrameSize();

    // DEBUG: 1 Hz mixer status while either deck is active. rate≈0 means the
    // phase is not advancing (silence even with good data); sample shows
    // whether the decoded PCM at the current position is non-zero.
    if ((this.trackOnDeck || this.trackOnDeck2) && getTime() - this.debugLastStatusTime >= 1.0) {
      this.debugLastStatusTime = getTime();
      const d1 = this.audioData
        ? `size=${this.audioData.getSize()} phase=${Math.round(this.phase)} rate=${this.rate.toFixed(3)} sample=${this.audioData.getElement(Math.round(this.phase)).toFixed(4)}`
        : "data=NULL";
      const d2 = this.audioData2
        ? `size=${this.audioData2.getSize()} phase=${Math.round(this.phase1)} rate=${this.rate2.toFixed(3)} sample=${this.audioData2.getElement(Math.round(this.phase1)).toFixed(4)}`
        : "data=NULL";
      print(`[DJDebug] mix: deck1(on=${this.trackOnDeck} ${d1}) deck2(on=${this.trackOnDeck2} ${d2}) vol=${this.volume.toFixed(2)}/${this.volume2.toFixed(2)}`);
    }

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

    if (!this.debugFirstEnqueueDone && (this.trackOnDeck || this.trackOnDeck2) && this.resultFrame) {
      this.debugFirstEnqueueDone = true;
      print(`[DJDebug] first enqueue: frameSize=${size}, resultFrame[0..2]=${this.resultFrame[0]}, ${this.resultFrame[1]}, ${this.resultFrame[2]}`);
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
