import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {WidgetBase} from "../WidgetBase"

interface WatchData {
  format: "12h" | "24h"
}

/**
 * Watch Widget — clock display that updates every frame.
 * Wire the Text child in the inspector.
 * Frame is added manually on the prefab.
 */
@component
export class WatchWidget extends WidgetBase {
  @ui.label(
    '<span style="color: #60A5FA;">WatchWidget – Clock/time display</span>'
  )
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Text component for time display")
  timeText: Text

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging")
  enableLoggingLifecycle: boolean = false

  private format: "12h" | "24h" = "12h"
  private currentTimeString: string = ""

  onAwake(): void {
    super.onAwake()
    this.logger = new Logger(
      "WatchWidget",
      this.enableLogging || this.enableLoggingLifecycle,
      true
    )

    if (this.timeText) {
      this.timeText.text = "--:--:--"
    }

    const updateEvent = this.createEvent("UpdateEvent")
    updateEvent.bind(() => this.updateTime())

    this.logger.debug("WatchWidget initialized")
  }

  private updateTime(): void {
    const now = new Date()
    let hours = now.getUTCHours()
    const minutes = now.getUTCMinutes()
    const seconds = now.getUTCSeconds()

    let timeStr: string
    if (this.format === "12h") {
      const period = hours >= 12 ? "PM" : "AM"
      hours = hours % 12 || 12
      timeStr = `${hours}:${this.pad(minutes)}:${this.pad(seconds)} ${period}`
    } else {
      timeStr = `${this.pad(hours)}:${this.pad(minutes)}:${this.pad(seconds)}`
    }

    if (timeStr !== this.currentTimeString) {
      this.currentTimeString = timeStr
      if (this.timeText) {
        this.timeText.text = timeStr
      }
    }
  }

  private pad(n: number): string {
    return n < 10 ? `0${n}` : `${n}`
  }

  get serializedContent(): string {
    const data: WatchData = {format: this.format}
    return JSON.stringify(data)
  }

  set serializedContent(value: string) {
    try {
      const data: WatchData = JSON.parse(value)
      this.format = data.format ?? "12h"
    } catch (e) {
      this.logger.warn("serializedContent parse error: " + e)
    }
  }

  toggleFormat(): void {
    this.format = this.format === "12h" ? "24h" : "12h"
    this.emitContentChange()
  }

  getFormat(): "12h" | "24h" {
    return this.format
  }
}
