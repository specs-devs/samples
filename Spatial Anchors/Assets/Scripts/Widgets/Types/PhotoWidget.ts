import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {WidgetBase} from "../WidgetBase"

/**
 * Photo Widget — displays a photo image.
 * Wire the Image child in the inspector. Frame is added manually on the prefab.
 */
@component
export class PhotoWidget extends WidgetBase {
  @ui.label(
    '<span style="color: #60A5FA;">PhotoWidget – Photo display</span>'
  )
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Image component for photo display")
  photoImage: Image

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging")
  enableLoggingLifecycle: boolean = false

  onAwake(): void {
    super.onAwake()
    this.logger = new Logger(
      "PhotoWidget",
      this.enableLogging || this.enableLoggingLifecycle,
      true
    )
    this.logger.debug("PhotoWidget initialized")
  }

  get serializedContent(): string {
    return "{}"
  }

  set serializedContent(_value: string) {
    // No dynamic content to restore
  }
}
