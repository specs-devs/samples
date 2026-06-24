/**
 * Specs Inc. 2026
 * Fast Chat Controller for the Agentic Playground Spectacles lens experience.
 */
import {FastChat} from "FastUI.lspkg/Scripts/FastChat"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {CHARACTER_LIMITS} from "../Utils/TextLimiter"

/**
 * FastChatController – wraps FastChat and exposes a clean chat card API.
 *
 * Drop-in replacement for ChatComponent: no SpectaclesUIKitBeta dependency.
 * Assign the FastChat component in the inspector, then call the public API
 * from bridge scripts or use FastChatExtensions for static-style access.
 *
 * Public API:
 *   addUserCard(message)  – add a user message card
 *   addBotCard(message)   – add a bot message card
 *   clearAllCards()       – destroy all cards and reset state
 *   isReady()             – true when component is initialized
 *   getCardCount()        – total number of cards
 */
@component
export class FastChatController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">FastChatController</span>')
  @ui.separator

  @input
  @hint("Reference to the FastChat component that renders the chat UI")
  fastChat: FastChat = null

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

  onAwake(): void {
    this.logger = new Logger("FastChatController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private initialize(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart() – initialize()")
    if (!this.fastChat) {
      this.logger.info("FastChatController: FastChat reference not assigned – controller inactive")
      return
    }
    this.initialized = true
    this.logger.info("FastChatController: Initialized successfully")
  }

  /**
   * Add a user message card to the chat UI.
   * Text is clamped to CHARACTER_LIMITS.USER_CARD_TEXT.
   */
  public addUserCard(message: string): boolean {
    if (!this.fastChat || !message) {
      this.logger.info("FastChatController: addUserCard – invalid state or empty message")
      return false
    }
    try {
      const limited = message.substring(0, CHARACTER_LIMITS.USER_CARD_TEXT)
      this.fastChat.addUserMessage(limited)
      this.logger.info(`FastChatController: Added user card – "${limited.substring(0, 50)}..."`)
      return true
    } catch (error) {
      this.logger.info(`FastChatController: Error adding user card – ${error}`)
      return false
    }
  }

  /**
   * Add a bot message card to the chat UI.
   * Text is clamped to CHARACTER_LIMITS.BOT_CARD_TEXT.
   */
  public addBotCard(message: string): boolean {
    if (!this.fastChat || !message) {
      this.logger.info("FastChatController: addBotCard – invalid state or empty message")
      return false
    }
    try {
      const limited = message.substring(0, CHARACTER_LIMITS.BOT_CARD_TEXT)
      this.fastChat.addBotMessage(limited)
      this.logger.info(`FastChatController: Added bot card – "${limited.substring(0, 50)}..."`)
      return true
    } catch (error) {
      this.logger.info(`FastChatController: Error adding bot card – ${error}`)
      return false
    }
  }

  /**
   * Destroy all cards and reset FastChat internal state.
   * FastChat has no built-in clear; internal arrays are accessed via type cast.
   */
  public clearAllCards(): boolean {
    if (!this.fastChat) return false
    try {
      const chatAny = this.fastChat as any

      if (chatAny.cards && Array.isArray(chatAny.cards)) {
        chatAny.cards.forEach((card: SceneObject) => {
          if (card) card.destroy()
        })
        chatAny.cards = []
      }

      if (chatAny.cardData && Array.isArray(chatAny.cardData)) {
        chatAny.cardData = []
      }

      if (chatAny.animatingCards && typeof chatAny.animatingCards.clear === "function") {
        chatAny.animatingCards.clear()
      }

      chatAny.currentIndex = 0

      this.logger.info("FastChatController: All cards cleared")
      return true
    } catch (error) {
      this.logger.info(`FastChatController: Error clearing cards – ${error}`)
      return false
    }
  }

  /**
   * Returns true when the FastChat reference is set and the component has started.
   */
  public isReady(): boolean {
    return this.initialized && this.fastChat !== null
  }

  /**
   * Returns the total number of cards currently in the chat.
   */
  public getCardCount(): number {
    if (!this.fastChat) return 0
    return this.fastChat.getCardCount()
  }

  /**
   * Returns the text content of the card at the given index, or empty string if out of range.
   */
  public getCardMessage(index: number): string {
    if (!this.fastChat) return ""
    return this.fastChat.getCardMessage(index)
  }
}
