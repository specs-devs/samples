/**
 * Specs Inc. 2026
 * Fast Deck Bridge component for the Agentic Playground Spectacles lens.
 */
import {bindStartEvent, bindUpdateEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {SummarySection} from "../Agents/AgentTypes"
import {SummaryASRController} from "../ASR/SummaryASRController"
import {AISummarizer} from "../Core/AISummarizer"
import {SummaryStorage} from "../Storage/SummaryStorage"
import {CHARACTER_LIMITS, TextLimiter} from "../Utils/TextLimiter"
import {FastDeckController} from "./FastDeckController"
import {FastDeckExtensions} from "./FastDeckExtensions"

/**
 * FastDeckBridge – drives the FastDeck summary UI from SummaryStorage + AISummarizer.
 *
 * Drop-in replacement for SummaryBridge: no SpectaclesUIKitBeta dependency.
 * Swap the @input summaryLayout type from SummaryComponent → FastDeckController
 * and change the import from SummaryBridge → FastDeckBridge.
 *
 * Architecture:
 * SummaryASRController → SummaryStorage → FastDeckBridge → AISummarizer
 *   → FastDeckExtensions → FastDeckController → FastDeck
 */
@component
export class FastDeckBridge extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">FastDeckBridge</span>')
  @ui.separator

  @input
  @hint("Reference to SummaryStorage component")
  summaryStorage: SummaryStorage = null

  @input
  @hint("Reference to AISummarizer component")
  aiSummarizer: AISummarizer = null

  @input
  @hint("Reference to FastDeckController for UI display")
  summaryLayout: FastDeckController = null

  @input
  @hint("Text component to display summary status")
  summaryDisplayText: Text = null

  @input
  @hint("Reference to SummaryASRController for speech input")
  asrController: SummaryASRController = null

  @input
  @hint("Enable automatic summary generation when text exceeds threshold")
  enableAutoSummary: boolean = true

  @input("int", "1000")
  @hint("Character threshold to trigger auto-summary")
  autoSummaryThreshold: number = 1000

  @input("number", "3.0")
  @hint("Seconds between storage checks")
  updateInterval: number = 3

  @input
  @hint("Log stored transcription text")
  showStoredTranscription: boolean = false

  @input
  @hint("Log summary card content")
  showSummaryCards: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')

  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private isConnected: boolean = false
  private lastUpdateTime: number = 0
  private lastTextLength: number = 0
  private isSummarizing: boolean = false
  private hasSummarizedCurrentText: boolean = false
  private nextAvailableCardIndex: number = 0

  public onSummaryGenerated: Event<SummarySection[]> = new Event<SummarySection[]>()
  public onSummaryDisplayed: Event<SummarySection[]> = new Event<SummarySection[]>()
  public onError: Event<string> = new Event<string>()

  onAwake(): void {
    this.logger = new Logger("FastDeckBridge", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private initialize(): void {
    FastDeckExtensions.setLogger(this.logger)
    this.validateComponents()
    this.isConnected = true
    this.loadExistingSummary()
    this.logger.info("Initialized successfully")
  }

  private validateComponents(): void {
    if (!this.summaryStorage) this.logger.info("SummaryStorage not assigned")
    if (!this.aiSummarizer) this.logger.info("AISummarizer not assigned")
    if (!this.summaryLayout) this.logger.info("FastDeckController not assigned")
  }

  private loadExistingSummary(): void {
    if (!this.summaryStorage || !this.summaryLayout) return
    try {
      const current = this.summaryStorage.getCurrentSummary()
      if (current?.sections?.length > 0) {
        const converted = this.convertSections(current.sections)
        this.displaySummaryOnUI({sections: converted})
        this.logger.info(`Loaded existing summary: ${current.sections.length} sections`)
      }
      const text = this.summaryStorage.getCurrentText()
      if (text?.length > 0) {
        this.lastTextLength = text.length
        if (this.enableAutoSummary && text.length >= this.autoSummaryThreshold && !current) {
          this.generateSummary()
        }
      }
    } catch (error) {
      this.logger.error(`Error loading existing summary: ${error}`)
    }
  }

  @bindUpdateEvent
  private checkForUpdates(): void {
    if (!this.isConnected || !this.summaryStorage) return

    const timeSinceUpdate = (Date.now() - this.lastUpdateTime) / 1000
    if (timeSinceUpdate < this.updateInterval) return

    try {
      const currentText = this.summaryStorage.getCurrentText()
      const currentLength = currentText.length

      if (currentLength !== this.lastTextLength) {
        this.lastTextLength = currentLength
        this.hasSummarizedCurrentText = false
      }

      if (this.enableAutoSummary && currentLength >= this.autoSummaryThreshold && !this.isSummarizing && !this.hasSummarizedCurrentText) {
        this.generateSummary()
      }
    } catch (error) {
      this.logger.error(`Error checking for updates: ${error}`)
    }

    this.lastUpdateTime = Date.now()
  }

  public async generateSummary(): Promise<void> {
    if (this.isSummarizing || !this.summaryStorage || !this.aiSummarizer) return

    this.isSummarizing = true
    try {
      const text = this.summaryStorage.getCurrentText()
      if (!text?.trim()) {
        this.logger.info("No text available for summary")
        return
      }

      this.logger.info(`Generating summary for ${text.length} chars`)
      const result = await this.aiSummarizer.generateSummary(text)

      if (result?.sections?.length > 0) {
        this.summaryStorage.storeSummary(result.sections, "Lecture Summary")

        if (this.showSummaryCards) {
          this.logger.info(`Generated ${result.sections.length} summary cards`)
        }

        // Clear existing cards before displaying the fresh summary so that
        // incremental recordings don't produce overlapping/duplicate cards.
        // The deck always reflects a complete re-summary of all accumulated text.
        this.clearSummaryDisplay()

        const converted = this.convertSections(result.sections)
        this.displaySummaryOnUI({sections: converted})
        this.onSummaryGenerated.invoke(converted)
        this.hasSummarizedCurrentText = true
        this.logger.info(`Summary generated: ${result.sections.length} sections`)
      } else {
        this.logger.error(`Summary generation failed: ${result?.error ?? "unknown"}`)
      }
    } catch (error) {
      const msg = `Summary generation failed: ${error}`
      this.logger.error(msg)
      this.onError.invoke(msg)
    } finally {
      this.isSummarizing = false
    }
  }

  private convertSections(aiSections: any[]): SummarySection[] {
    return aiSections.map((s, i) => ({
      title: s.title ?? `Summary ${i + 1}`,
      content: s.content ?? "",
      cardIndex: i,
      keywords: s.keywords ?? []
    }))
  }

  private displaySummaryOnUI(summaryResult: {sections: SummarySection[]}): void {
    if (!this.summaryLayout) return
    try {
      let cardsAdded = 0
      for (const section of summaryResult.sections) {
        const success = FastDeckExtensions.addSummaryCard(this.summaryLayout, section, this.nextAvailableCardIndex)
        if (success) {
          this.nextAvailableCardIndex++
          cardsAdded++
        } else {
          this.logger.error(`Failed to add summary card at index ${this.nextAvailableCardIndex}`)
        }
      }

      // FastDeck only calls layoutInitialCards() when the first card is added
      // post-init; cards 2-N are never positioned. Re-trigger layout now that
      // the full batch has been added so all cards are visible and swipeable.
      this.summaryLayout.finalizeLayout()

      if (this.summaryDisplayText) {
        this.summaryDisplayText.text = `Summary: ${this.nextAvailableCardIndex} cards`
      }

      this.onSummaryDisplayed.invoke(summaryResult.sections)
      this.logger.info(`Displayed ${cardsAdded} new summary cards (total: ${this.nextAvailableCardIndex})`)
    } catch (error) {
      this.logger.error(`Failed to display summary: ${error}`)
    }
  }

  /** Clear all deck cards and reset the card counter. */
  public clearSummaryDisplay(): void {
    if (!this.summaryLayout) return
    FastDeckExtensions.clearSummaryCards(this.summaryLayout)
    this.nextAvailableCardIndex = 0
    if (this.summaryDisplayText) this.summaryDisplayText.text = "Summary: Ready"
    this.logger.info("Summary display cleared")
  }

  // ===== Public API =====

  public refreshSummaryDisplay(): void {
    if (!this.summaryStorage) return
    const current = this.summaryStorage.getCurrentSummary()
    if (current?.sections) {
      this.displaySummaryOnUI({sections: this.convertSections(current.sections)})
    }
  }

  public resetAISummarizer(): void {
    if (!this.summaryStorage) return
    try {
      this.summaryStorage.clearCurrentText()
      this.lastTextLength = 0
      this.hasSummarizedCurrentText = false
      this.clearSummaryDisplay()
      this.logger.info("AI summarizer storage reset")
    } catch (error) {
      this.logger.error(`Reset failed: ${error}`)
    }
  }

  public getBridgeStatus(): {isConnected: boolean; isSummarizing: boolean; textLength: number; hasValidComponents: boolean} {
    return {
      isConnected: this.isConnected,
      isSummarizing: this.isSummarizing,
      textLength: this.lastTextLength,
      hasValidComponents: !!(this.summaryStorage && this.aiSummarizer && this.summaryLayout)
    }
  }

  public getCardUsageStatus(): {usedCards: number; totalCards: number} {
    const totalCards = this.summaryLayout ? FastDeckExtensions.getCardCount(this.summaryLayout) : 0
    return {usedCards: this.nextAvailableCardIndex, totalCards}
  }
}
