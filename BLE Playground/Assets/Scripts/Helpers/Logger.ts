/**
 * Specs Inc. 2026
 * Logger component for the BLE Playground Spectacles lens.
 */
@component
export class Logger extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Logger – on-screen debug text display</span><br/><span style="color: #94A3B8; font-size: 11px;">Singleton that forwards log messages to a Text component for on-screen debugging.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Text component that displays the most recent log message on screen")
  text: Text

  private static instance: Logger

  private constructor() {
    super()
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      throw new Error("Trying to get Logger instance, but it hasn't been set.  You need to call it later.")
    }
    return Logger.instance
  }

  onAwake() {
    if (!Logger.instance) {
      Logger.instance = this
    } else {
      throw new Error("Logger already has an instance.  Aborting.")
    }
  }

  public log(msg: string) {
    print(msg)
    this.text.text = msg
  }
}
