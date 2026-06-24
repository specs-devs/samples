/**
 * Specs Inc. 2026
 * Fast Deck Controller for the Agentic Playground Spectacles lens experience.
 */
import {FastDeck} from "FastUI.lspkg/Scripts/FastDeck"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {SummarySection} from "../Agents/AgentTypes"
import {CHARACTER_LIMITS} from "../Utils/TextLimiter"

/**
 * FastDeckController – wraps FastDeck and exposes a summary-card API.
 *
 * Drop-in replacement for SummaryComponent: no SpectaclesUIKitBeta dependency.
 * Cards are created programmatically via FastDeck; title and content are
 * formatted together as the card body text.
 * Assign the FastDeck component in the inspector, then call the public API
 * from bridge scripts or use FastDeckExtensions for static-style access.
 *
 * Public API:
 *   addSummaryCard(title, content)        – add a card with title + body
 *   addSummarySection(section)            – add a SummarySection as a card
 *   createDynamicCard({title, content})   – compat alias for addSummaryCard
 *   clearAllCards()                       – destroy all cards and reset state
 *   isReady()                             – true when component is initialized
 *   getCardCount()                        – total number of cards
 *   manualSwipeLeft()                     – navigate to next card
 *   manualSwipeRight()                    – navigate to previous card
 */
@component
export class FastDeckController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">FastDeckController</span>')
  @ui.separator

  @input
  @hint("Reference to the FastDeck component that renders the card deck")
  fastDeck: FastDeck = null

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')

  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private initialized: boolean = false
  private cardMeta: {title: string; content: string}[] = []

  onAwake(): void {
    this.logger = new Logger("FastDeckController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private initialize(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart() – initialize()")
    if (!this.fastDeck) {
      this.logger.info("FastDeckController: FastDeck reference not assigned – controller inactive")
      return
    }
    this.initialized = true
    this.logger.info("FastDeckController: Initialized successfully")
  }

  /**
   * Add a summary card with a title and body text.
   * Title is clamped to CHARACTER_LIMITS.SUMMARY_TITLE (157 chars).
   * Content is clamped to CHARACTER_LIMITS.SUMMARY_CONTENT (785 chars).
   * Returns the 0-based card index, or -1 on failure.
   */
  public addSummaryCard(title: string, content: string): number {
    if (!this.fastDeck) {
      this.logger.info("FastDeckController: addSummaryCard – FastDeck not assigned")
      return -1
    }
    try {
      const cardNumber = this.cardMeta.length + 1
      const rawTitle = (title || "").substring(0, CHARACTER_LIMITS.SUMMARY_TITLE)
      const numberedTitle = rawTitle ? `${cardNumber}. ${rawTitle}` : `${cardNumber}.`
      const limitedTitle = numberedTitle.substring(0, CHARACTER_LIMITS.SUMMARY_TITLE)
      const limitedContent = (content || "").substring(0, CHARACTER_LIMITS.SUMMARY_CONTENT)

      // Format as "Title\n\nContent" so both fields appear in the card body
      const cardText = `${limitedTitle}\n\n${limitedContent}`

      const index = this.fastDeck.addCard(cardText)
      this.cardMeta.push({title: limitedTitle, content: limitedContent})

      this.logger.info(`FastDeckController: Added summary card ${index} – "${limitedTitle.substring(0, 40)}..."`)
      return index
    } catch (error) {
      this.logger.info(`FastDeckController: Error adding summary card – ${error}`)
      return -1
    }
  }

  /**
   * Add a SummarySection as a deck card.
   * Returns the 0-based card index, or -1 on failure.
   */
  public addSummarySection(section: SummarySection): number {
    if (!section) return -1
    return this.addSummaryCard(section.title, section.content)
  }

  /**
   * Compatibility alias – mirrors the createDynamicCard({title, content}) signature
   * that SummaryComponent exposes. Returns the card index, or -1 on failure.
   */
  public createDynamicCard(content: {title: string; content: string}): number {
    if (!content) return -1
    return this.addSummaryCard(content.title, content.content)
  }

  /**
   * Destroy all deck cards and reset FastDeck internal state.
   * FastDeck has no built-in clear; internal arrays are accessed via type cast.
   */
  public clearAllCards(): boolean {
    if (!this.fastDeck) return false
    try {
      const deckAny = this.fastDeck as any

      if (deckAny.cards && Array.isArray(deckAny.cards)) {
        deckAny.cards.forEach((card: SceneObject) => {
          if (card) card.destroy()
        })
        deckAny.cards = []
      }

      if (deckAny.cardContent && Array.isArray(deckAny.cardContent)) {
        deckAny.cardContent = []
      }

      if (deckAny.animatingCards && typeof deckAny.animatingCards.clear === "function") {
        deckAny.animatingCards.clear()
      }

      deckAny.currentIndex = 0

      this.cardMeta = []
      this.logger.info("FastDeckController: All cards cleared")
      return true
    } catch (error) {
      this.logger.info(`FastDeckController: Error clearing cards – ${error}`)
      return false
    }
  }

  /**
   * Navigate to the next card (programmatic swipe left).
   */
  public manualSwipeLeft(): void {
    if (this.fastDeck) this.fastDeck.manualSwipeLeft()
  }

  /**
   * Navigate to the previous card (programmatic swipe right).
   */
  public manualSwipeRight(): void {
    if (this.fastDeck) this.fastDeck.manualSwipeRight()
  }

  /**
   * Returns true when the FastDeck reference is set and the component has started.
   */
  public isReady(): boolean {
    return this.initialized && this.fastDeck !== null
  }

  /**
   * Returns the total number of cards in the deck.
   */
  public getCardCount(): number {
    if (!this.fastDeck) return 0
    return this.fastDeck.getCardCount()
  }

  /**
   * Returns the currently visible card index.
   */
  public getCurrentIndex(): number {
    if (!this.fastDeck) return 0
    return this.fastDeck.getCurrentIndex()
  }

  /**
   * Returns the stored title and content for a card at the given index,
   * or null if out of range.
   */
  public getCardMeta(index: number): {title: string; content: string} | null {
    if (index < 0 || index >= this.cardMeta.length) return null
    return this.cardMeta[index]
  }

  /**
   * Re-triggers FastDeck's internal layout after a batch of addCard() calls.
   *
   * FastDeck only calls layoutInitialCards() when the very first card is added
   * post-initialization. Cards 2-N are pushed into the array but never positioned
   * or enabled. Resetting the internal `initialized` flag and re-calling
   * the private `initialize()` corrects all card positions in one pass.
   *
   * Call this once after every batch of addSummaryCard() calls.
   */
  public finalizeLayout(): void {
    if (!this.fastDeck) return
    try {
      const deckAny = this.fastDeck as any
      if (!deckAny.cards || deckAny.cards.length === 0) return
      deckAny.initialized = false
      if (typeof deckAny["initialize"] === "function") {
        deckAny["initialize"]()
      }
      this.logger.info(`FastDeckController: Layout finalized for ${deckAny.cards.length} cards`)
    } catch (error) {
      this.logger.info(`FastDeckController: Error finalizing layout – ${error}`)
    }
  }
}
