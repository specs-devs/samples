require("LensStudio:TextInputModule")

import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {NoteWidget} from "../Widgets/Types/NoteWidget"

@component
export class TextInputRouter extends BaseScriptComponent {
  private static instance: TextInputRouter

  @ui.label(
    '<span style="color: #60A5FA;">TextInputRouter – AR keyboard routing</span><br/><span style="color: #94A3B8; font-size: 11px;">Routes AR keyboard input to the currently focused NoteWidget.</span>'
  )
  @ui.separator

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private options: TextInputSystem.KeyboardOptions
  private focusedWidget: NoteWidget | null = null

  private onKeyboardStateChangedEvent = new Event<boolean>()
  readonly onKeyboardStateChanged: PublicApi<boolean> =
    this.onKeyboardStateChangedEvent.publicApi()

  static getInstance(): TextInputRouter {
    if (!TextInputRouter.instance) {
      throw new Error(
        "TextInputRouter not initialized. Ensure it is attached to a SceneObject."
      )
    }
    return TextInputRouter.instance
  }

  onAwake(): void {
    this.logger = new Logger(
      "TextInputRouter",
      this.enableLogging || this.enableLoggingLifecycle,
      true
    )
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.options = new TextInputSystem.KeyboardOptions()
    this.options.enablePreview = false
    this.options.keyboardType = TextInputSystem.KeyboardType.Text
    this.options.returnKeyType = TextInputSystem.ReturnKeyType.Done

    this.options.onTextChanged = (text: string, _range: vec2) => {
      if (this.focusedWidget) {
        this.focusedWidget.setText(text)
      }
    }

    this.options.onReturnKeyPressed = () => {
      global.textInputSystem.dismissKeyboard()
    }

    this.options.onKeyboardStateChanged = (isOpen: boolean) => {
      if (!isOpen) {
        this.focusedWidget = null
      }
      this.onKeyboardStateChangedEvent.invoke(isOpen)
    }

    TextInputRouter.instance = this
  }

  /**
   * Opens the AR keyboard and routes text changes to the given NoteWidget.
   */
  focusWidget(widget: NoteWidget): void {
    this.focusedWidget = widget
    this.logger.info("Requesting keyboard for NoteWidget")
    global.textInputSystem.requestKeyboard(this.options)
  }

  dismissKeyboard(): void {
    global.textInputSystem.dismissKeyboard()
  }

  getFocusedWidget(): NoteWidget | null {
    return this.focusedWidget
  }
}
