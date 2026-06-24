import {TextInputField} from "SpectaclesUIKit.lspkg/Scripts/Components/TextInputField/TextInputField"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {WidgetBase} from "../WidgetBase"

interface NoteData {
  text: string
}

/**
 * Note Widget — sticky note with editable text.
 * Wire the Text child and the TextInputField SceneObject in the inspector.
 * Frame is added manually on the prefab.
 */
@component
export class NoteWidget extends WidgetBase {
  @ui.label(
    '<span style="color: #60A5FA;">NoteWidget – Sticky note with editable text</span>'
  )
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Text component displaying the note content")
  textComponent: Text

  @input
  @hint("SceneObject that has the TextInputField component")
  inputFieldObject: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging")
  enableLoggingLifecycle: boolean = false

  private noteText: string = ""
  private inputField: TextInputField | null = null

  onAwake(): void {
    super.onAwake()
    this.logger = new Logger(
      "NoteWidget",
      this.enableLogging || this.enableLoggingLifecycle,
      true
    )

    if (this.textComponent) {
      this.textComponent.text = this.noteText
    }

    // Defer input field binding to OnStartEvent so TextInputField has initialized its events
    const startEvent = this.createEvent("OnStartEvent") as OnStartEvent
    startEvent.bind(() => this.bindInputField())

    this.logger.debug("NoteWidget initialized")
  }

  private bindInputField(): void {
    if (this.inputFieldObject) {
      this.inputField = this.inputFieldObject.getComponent(
        TextInputField.getTypeName()
      ) as TextInputField
    }

    if (this.inputField) {
      this.inputField.onReturnKeyPressed.add((text: string) => {
        this.setText(text)
        this.logger.debug("Note text updated via return key: " + text)
      })

      this.inputField.onTextChanged.add((text: string) => {
        this.noteText = text
        if (this.textComponent) {
          this.textComponent.text = text
        }
      })

      this.logger.debug("TextInputField bound")
    }
  }

  get serializedContent(): string {
    const data: NoteData = {text: this.noteText}
    return JSON.stringify(data)
  }

  set serializedContent(value: string) {
    try {
      const data: NoteData = JSON.parse(value)
      this.noteText = data.text ?? ""
      if (this.textComponent) {
        this.textComponent.text = this.noteText
      }
      if (this.inputField) {
        this.inputField.text = this.noteText
      }
    } catch (e) {
      this.logger.warn("serializedContent parse error: " + e)
    }
  }

  setText(text: string): void {
    this.noteText = text
    if (this.textComponent) {
      this.textComponent.text = text
    }
    this.emitContentChange()
  }

  getText(): string {
    return this.noteText
  }
}
