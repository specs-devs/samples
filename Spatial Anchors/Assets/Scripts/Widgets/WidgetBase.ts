import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {WidgetType} from "./WidgetTypes"

@component
export class WidgetBase extends BaseScriptComponent {
  @ui.label(
    '<span style="color: #60A5FA;">WidgetBase – Abstract base class for all widget types</span><br/><span style="color: #94A3B8; font-size: 11px;">Extended by NoteWidget, WatchWidget, PhotoWidget. Do not attach directly.</span>'
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

  protected logger: Logger

  // Runtime-assigned by WidgetController — NOT @input
  public widgetType: WidgetType
  public widgetIndex: number = -1

  // Events
  private onDeleteEvent: Event<number> = new Event<number>()
  readonly onDelete: PublicApi<number> = this.onDeleteEvent.publicApi()

  private onContentChangeEvent: Event<void> = new Event<void>()
  readonly onContentChange: PublicApi<void> =
    this.onContentChangeEvent.publicApi()

  onAwake(): void {
    this.logger = new Logger(
      "WidgetBase",
      this.enableLogging || this.enableLoggingLifecycle,
      true
    )
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  // Override in subclasses to serialize widget-specific data as JSON string
  get serializedContent(): string {
    return ""
  }

  set serializedContent(_value: string) {
    // Override in subclasses
  }

  requestDelete(): void {
    if (this.enableLogging) {
      this.logger.debug(`requestDelete index=${this.widgetIndex}`)
    }
    this.onDeleteEvent.invoke(this.widgetIndex)
  }

  protected emitContentChange(): void {
    this.onContentChangeEvent.invoke()
  }

  public get widgetTransform(): Transform {
    return this.getTransform()
  }
}
