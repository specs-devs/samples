/**
 * Specs Inc. 2026
 * Fast Tool Panel component for the Agentic Playground Spectacles lens.
 */
import {buildRoundedRectangleOnto} from "FastUI.lspkg/Scripts/FastRoundedRectangle"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

/**
 * FastToolPanel – a single rounded-rectangle button that displays tool status text.
 *
 * Replaces any SpectaclesUIKitBeta-dependent tool panel with a zero-prefab,
 * programmatically built panel using FastUI's FastRoundedRectangle.
 *
 * Usage:
 *   - Attach this component to the tool-panel scene object.
 *   - Call setToolText(text) to update the displayed message at any time.
 *   - The panel rebuilds its rectangle automatically whenever the text changes.
 *
 * Public API:
 *   setToolText(text)   – update the displayed text
 *   getToolText()       – read the current text
 *   show() / hide()     – toggle panel visibility
 */
@component
export class FastToolPanel extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">FastToolPanel</span>')
  @ui.separator

  @input("string", "Waiting for tool...")
  @hint("Initial text shown on the panel")
  initialText: string = "Waiting for tool..."

  @input("number", "22")
  @hint("Panel width in cm")
  panelWidth: number = 22

  @input("number", "5")
  @hint("Minimum panel height in cm")
  panelMinHeight: number = 5

  @input
  @hint("Use 'user' (blue) or 'bot' (gray) color style for the panel")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Blue (user)", "user"),
      new ComboBoxItem("Gray (bot)", "bot"),
      new ComboBoxItem("Green", "green")
    ])
  )
  panelStyle: string = "bot"

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')

  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  private logger: Logger
  private currentText: string = ""

  onAwake(): void {
    this.logger = new Logger("FastToolPanel", this.enableLogging, true)
  }

  @bindStartEvent
  private initialize(): void {
    this.currentText = this.initialText
    this.rebuildPanel()
    this.logger.info("FastToolPanel initialized")
  }

  private rebuildPanel(): void {
    buildRoundedRectangleOnto(this.sceneObject, {
      content: this.currentText,
      width: this.panelWidth,
      minHeight: this.panelMinHeight,
      style: this.panelStyle as "user" | "bot" | "green",
      textColor: "white"
    })
  }

  /**
   * Update the panel text and rebuild the rectangle to fit the new content.
   */
  public setToolText(text: string): void {
    if (this.currentText === text) return
    this.currentText = text ?? ""
    this.rebuildPanel()
    this.logger.info(`Tool panel text updated: "${this.currentText.substring(0, 60)}"`)
  }

  /**
   * Returns the currently displayed text.
   */
  public getToolText(): string {
    return this.currentText
  }

  /**
   * Show the panel.
   */
  public show(): void {
    this.sceneObject.enabled = true
  }

  /**
   * Hide the panel.
   */
  public hide(): void {
    this.sceneObject.enabled = false
  }
}
