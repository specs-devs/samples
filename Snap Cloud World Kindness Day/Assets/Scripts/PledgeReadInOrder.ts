/**
 * Specs Inc. 2026
 * Pledge Read In Order component for the World Kindness Day Spectacles lens.
 */
import {BalloonManager} from "./BalloonManager"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class PledgeReadInOrder extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PledgeReadInOrder – ASR voice pledge handler</span><br/><span style="color: #94A3B8; font-size: 11px;">Listens for spoken pledge words in order and triggers the balloon animation.</span>')
  @ui.separator

  @input("vec4", "{1,0,0,1}")
  @widget(new ColorWidget())
  @hint("Color applied to a pledge word after it has been spoken correctly")
  highlightColor: vec4

  @input
  @hint("BalloonManager component to notify when the pledge is complete")
  BalloonManager: BalloonManager

  @input
  @hint("Scene object shown before the pledge begins")
  beginContainer?: SceneObject

  @input
  @hint("Scene object containing the pledge text elements")
  pledgeContainer?: SceneObject

  @input
  @hint("Ordered array of Text components representing each pledge word")
  pledgeTexts?: Text[]

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')

  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private asrModule = require("LensStudio:AsrModule")
  private wordAt: number = 0

  onAwake(): void {
    this.logger = new Logger("PledgeReadInOrder", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  private stopSession(): void {
    this.asrModule.stopTranscribing()
  }

  private onListenUpdate(eventData): void {
    const word = eventData.text
    this.logger.debug("Received word: " + word)

    if (this.wordAt < 0 || this.wordAt >= this.pledgeTexts.length) {
      return
    }

    const currentText = this.pledgeTexts[this.wordAt]

    if (word.toLowerCase().includes(currentText.text.toLowerCase())) {
      currentText.textFill.color = this.highlightColor

      if (this.wordAt === this.pledgeTexts.length - 1) {
        this.BalloonManager.changeTransform()
        this.stopSession()
      } else {
        this.wordAt += 1
      }
    } else {
      this.logger.debug("word is: " + word + " not matched for index " + this.wordAt)
    }
  }

  public init(): void {
    if (this.beginContainer) this.beginContainer.enabled = false
    if (this.pledgeContainer) this.pledgeContainer.enabled = true

    const options = AsrModule.AsrTranscriptionOptions.create()
    options.mode = AsrModule.AsrMode.Balanced

    options.onTranscriptionUpdateEvent.add((eventArgs) => this.onListenUpdate(eventArgs))

    this.asrModule.startTranscribing(options)
  }
}
