/**
 * Specs Inc. 2026
 * ASRController for the Depth Cache Spectacles lens experience.
 */
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class ASRController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ASRController – automatic speech recognition controller</span><br/><span style="color: #94A3B8; font-size: 11px;">Manages ASR session and exposes partial and final transcription events.</span>')
  @ui.separator

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  onPartialVoiceEvent = new Event<string>()
  onFinalVoiceEvent = new Event<string>()
  onErrorEvent = new Event<string>()

  private logger: Logger
  private asr: AsrModule = require("LensStudio:AsrModule")
  private isListening = false

  onAwake() {
    this.logger = new Logger("ASRController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  /**
   * Fresh options per session — reusing one options object across
   * start/stop cycles can leave the ASR session wedged after an error,
   * which shows up as "listening" with no transcription ever arriving.
   */
  private buildOptions(): AsrModule.AsrTranscriptionOptions {
    const options = AsrModule.AsrTranscriptionOptions.create()
    options.silenceUntilTerminationMs = 1500
    options.mode = AsrModule.AsrMode.HighAccuracy
    options.onTranscriptionUpdateEvent.add((args) => {
      if (args.isFinal) {
        this.isListening = false
        this.logger.info("Final Transcription: " + args.text)
        this.onFinalVoiceEvent.invoke(args.text)
      } else {
        this.logger.debug("Partial: " + args.text)
        this.onPartialVoiceEvent.invoke(args.text)
      }
    })
    options.onTranscriptionErrorEvent.add((args) => {
      this.isListening = false
      const reason = ASRController.statusCodeToString(args)
      print("[ASRController] Transcription error: " + args + " (" + reason + ")")
      this.onErrorEvent.invoke(reason)
    })
    return options
  }

  /** Maps AsrModule.AsrStatusCode to a readable reason. */
  private static statusCodeToString(code: AsrModule.AsrStatusCode): string {
    switch (Number(code)) {
      case 1:
        return "InternalError"
      case 2:
        return "Unauthenticated"
      case 3:
        return "NoInternet"
      default:
        return "Unknown(" + code + ")"
    }
  }

  startListening() {
    if (this.isListening) {
      this.logger.warn("Already listening — restarting session")
      this.asr.stopTranscribing()
    }
    this.isListening = true
    this.asr.startTranscribing(this.buildOptions())
  }

  stopListening() {
    this.isListening = false
    this.asr.stopTranscribing()
  }
}
