/**
 * Specs Inc. 2026
 * Defines Sound Event, Sound Controller for the Path Pioneer lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"

@typedef
export class SoundEvent {
  @input public key: string
  @input public clip: AudioTrackAsset
  @input public vol: number
  @input public loop: boolean
}

@component
export class SoundController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SoundController – audio event manager</span><br/><span style="color: #94A3B8; font-size: 11px;">Maps string keys to audio clips and plays them on available channels.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Audio</span>')
  @input
  @hint("List of key-to-clip mappings defining the sounds this controller can play")
  soundEvents: SoundEvent[]

  @input
  @hint("Pool of AudioComponent instances used to play sounds concurrently")
  auds: AudioComponent[]

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private static instance: SoundController
  private logger: Logger;

  private constructor() {
    super()
  }

  public static getInstance(): SoundController {
    if (!SoundController.instance) {
      throw new Error("Trying to get SoundController instance, but it hasn't been set. You need to call it later.")
    }
    return SoundController.instance
  }

  onAwake() {
    this.logger = new Logger("SoundController", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");

    if (!SoundController.instance) {
      SoundController.instance = this
    } else {
      throw new Error("SoundController already has an instance but another one is initializing. Aborting.")
    }
  }

  stopAllSounds() {
    this.auds.forEach((a) => {
      if (a.audioTrack && !isNull(a.audioTrack) && a.isPlaying()) {
        a.stop(false)
      }
    })
  }

  playSound(myKey: string) {
    for (let i = 0; i < this.soundEvents.length; i++) {
      if (this.soundEvents[i].key === myKey) {
        const myAud = this.getAud()
        if (myAud) {
          const evt = this.soundEvents[i]
          myAud.volume = evt.vol
          myAud.audioTrack = evt.clip
          myAud.position = 0
          const loopNum = evt.loop ? -1 : 1
          myAud.play(loopNum)
        }
      }
    }
  }

  private getAud() {
    for (let i = 0; i < this.auds.length; i++) {
      if (!this.auds[i].isPlaying()) {
        return this.auds[i]
      }
    }
    return undefined
  }
}
