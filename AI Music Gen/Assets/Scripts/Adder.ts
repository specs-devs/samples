/**
 * Specs Inc. 2026
 * Adder component for the AI Music Gen Spectacles lens.
 */
import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {SelectionController} from "./SelectionController"

@component
export class Adder extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Adder – category item button</span><br/><span style="color: #94A3B8; font-size: 11px;">Displays an emoji and label; adds the item to the SelectionController when pressed.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("RectangleButton that triggers the add action when pressed")
  private _adderButton: RectangleButton

  @input
  @hint("Text component that displays the item label")
  private _labelText: Text

  @input
  @hint("Text component that displays the item emoji")
  private _emojiDisplay: Text

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private _selectionController: SelectionController

  private _prompt: string = ""
  private _emoji: string = ""

  onAwake() {
    this.logger = new Logger("Adder", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this._adderButton.initialize()
    this._adderButton.onTriggerUp.add(() => {
      this._selectionController.addToList(this._prompt, this._emoji)
    })
  }

  init(prompt: string, emoji: string) {
    this._prompt = prompt
    this._emoji = emoji
    this._labelText.text = this._prompt
    this._emojiDisplay.text = emoji
  }

  addSelectionController(selectionController: SelectionController) {
    this._selectionController = selectionController
  }
}
