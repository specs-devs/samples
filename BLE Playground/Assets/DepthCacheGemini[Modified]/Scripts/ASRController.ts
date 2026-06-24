/**
 * Specs Inc. 2026
 * ASRController for the BLE Playground Spectacles lens experience.
 */
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class ASRController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ASRController – automatic speech recognition wrapper</span><br/><span style="color: #94A3B8; font-size: 11px;">Starts and stops the Lens Studio ASR module and emits partial and final transcription events.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private asr: AsrModule = require("LensStudio:AsrModule")
  private options = null

  onPartialVoiceEvent = new Event<string>()
  onFinalVoiceEvent = new Event<string>()

  onAwake() {
    this.logger = new Logger("ASRController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.options = AsrModule.AsrTranscriptionOptions.create()
    this.options.silenceUntilTerminationMs = 500
    this.options.mode = AsrModule.AsrMode.Balanced
    this.options.onTranscriptionUpdateEvent.add((args) => {
      if (args.isFinal) {
        this.logger.info("Final Transcription: " + args.text)
        this.onFinalVoiceEvent.invoke(args.text)
      } else {
        this.logger.debug("Partial: " + args.text)
        this.onPartialVoiceEvent.invoke(args.text)
      }
    })
    this.options.onTranscriptionErrorEvent.add((args) => {
      this.logger.error("Transcription error: " + args)
    })
  }

  startListening() {
    this.asr.startTranscribing(this.options)
    this.onPartialVoiceEvent.invoke("Listening...")
  }

  stopListening() {
    this.asr.stopTranscribing()
  }
}
