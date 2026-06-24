/**
 * Specs Inc. 2026
 * Fast Chat Bridge component for the Agentic Playground Spectacles lens.
 */
import {bindStartEvent, bindUpdateEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {AgentOrchestrator} from "../Agents/AgentOrchestrator"
import {ChatMessage} from "../Agents/AgentTypes"
import {ChatStorage} from "../Storage/ChatStorage"
import {CHARACTER_LIMITS, TextLimiter} from "../Utils/TextLimiter"
import {FastChatController} from "./FastChatController"
import {FastChatExtensions} from "./FastChatExtensions"

/**
 * FastChatBridge – wires AgentOrchestrator events to the FastChat UI.
 *
 * Drop-in replacement for ChatBridge: no SpectaclesUIKitBeta dependency.
 * Swap the @input chatLayout type from ChatComponent → FastChatController
 * and change the import from ChatBridge → FastChatBridge.
 *
 * Architecture:
 * AgentOrchestrator → (onQueryProcessed / onVoiceCompleted / onSystemReset)
 *   → FastChatBridge → FastChatExtensions → FastChatController → FastChat
 */
@component
export class FastChatBridge extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">FastChatBridge</span>')
  @ui.separator

  @input
  @hint("Reference to AgentOrchestrator component")
  agentOrchestrator: AgentOrchestrator = null

  @input
  @hint("Reference to ChatStorage component")
  chatStorage: ChatStorage = null

  @input
  @hint("Reference to FastChatController for UI display")
  chatLayout: FastChatController = null

  @input("int", "50")
  @hint("Maximum number of messages to display")
  maxDisplayMessages: number = 50

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
  private connectionRetryCount: number = 0
  private readonly MAX_CONNECTION_RETRIES: number = 10

  public onMessageDisplayed: Event<ChatMessage> = new Event<ChatMessage>()
  public onError: Event<string> = new Event<string>()

  onAwake(): void {
    this.logger = new Logger("FastChatBridge", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private initialize(): void {
    FastChatExtensions.setLogger(this.logger)
    this.validateComponents()
    this.setupConnections()
    this.logger.info("Initialized successfully")
  }

  private validateComponents(): void {
    if (!this.agentOrchestrator) this.logger.info("AgentOrchestrator not assigned")
    if (!this.chatStorage) this.logger.info("ChatStorage not assigned")
    if (!this.chatLayout) this.logger.info("FastChatController not assigned")
  }

  private setupConnections(): void {
    if (!this.agentOrchestrator) return

    if (this.agentOrchestrator.onQueryProcessed?.add) {
      this.agentOrchestrator.onQueryProcessed.add((data) => {
        this.handleNewConversation(data.query, data.response)
      })
      this.logger.info("Connected to AgentOrchestrator.onQueryProcessed")
    }

    if (this.agentOrchestrator.onError?.add) {
      this.agentOrchestrator.onError.add((error) => {
        this.handleOrchestratorError(error)
      })
    }

    if (this.agentOrchestrator.onSystemReset?.add) {
      this.agentOrchestrator.onSystemReset.add(() => {
        this.clearChatUI()
      })
      this.logger.info("Connected to AgentOrchestrator.onSystemReset")
    }

    if (this.agentOrchestrator.onVoiceCompleted?.add) {
      this.agentOrchestrator.onVoiceCompleted.add((data) => {
        this.handleVoiceCompleted(data.query, data.response)
      })
      this.logger.info("Connected to AgentOrchestrator.onVoiceCompleted")
    }

    this.isConnected = true
    this.logger.info("Bridge connections established")
  }

  private handleNewConversation(query: string, response: string): void {
    const timestamp = Date.now()
    const userMessage: ChatMessage = {
      id: `msg_${timestamp}_user`,
      type: "user",
      content: TextLimiter.limitText(query, CHARACTER_LIMITS.USER_CARD_TEXT),
      timestamp,
      cardIndex: -1,
      relatedTools: []
    }
    this.displayMessage(userMessage)

    const isVoiceEnabled = this.agentOrchestrator?.enableVoiceOutput
    if (isVoiceEnabled && response === "") {
      this.logger.info("Voice mode – waiting for transcription")
    } else if (response?.length > 0) {
      const botMessage: ChatMessage = {
        id: `msg_${timestamp + 1}_bot`,
        type: "bot",
        content: TextLimiter.limitText(response, CHARACTER_LIMITS.BOT_CARD_TEXT),
        timestamp: timestamp + 1,
        cardIndex: -1,
        relatedTools: ["intelligent_conversation"]
      }
      this.displayMessage(botMessage)
      this.logger.info(`Bot message displayed: "${response.substring(0, 50)}..."`)
    }
  }

  private handleVoiceCompleted(query: string, response: string): void {
    this.logger.info(`Voice completed: "${response.substring(0, 50)}..." (${response.length} chars)`)
    const botMessage: ChatMessage = {
      id: `msg_${Date.now()}_bot`,
      type: "bot",
      content: TextLimiter.limitText(response, CHARACTER_LIMITS.BOT_CARD_TEXT),
      timestamp: Date.now(),
      cardIndex: -1,
      relatedTools: ["intelligent_conversation"]
    }
    this.displayMessage(botMessage)
  }

  private displayMessage(message: ChatMessage): void {
    if (!this.chatLayout) return
    try {
      if (message.type === "user") {
        FastChatExtensions.addUserCard(this.chatLayout, message.content)
      } else {
        FastChatExtensions.addBotCard(this.chatLayout, message.content)
      }
      this.onMessageDisplayed.invoke(message)
      this.logger.info(`Displayed ${message.type} message: "${message.content.substring(0, 30)}..."`)
    } catch (error) {
      this.logger.error(`Failed to display message: ${error}`)
      this.onError.invoke(`Message display failed: ${error}`)
    }
  }

  /** Clear all chat cards (e.g. on system reset). */
  public clearChatUI(): void {
    if (this.chatLayout) {
      FastChatExtensions.clearAllCards(this.chatLayout)
      this.logger.info("Chat UI cleared")
    }
  }

  @bindUpdateEvent
  private checkForUpdates(): void {
    if (!this.isConnected && this.connectionRetryCount < this.MAX_CONNECTION_RETRIES) {
      this.connectionRetryCount++
      this.setupConnections()
    }
  }

  private handleOrchestratorError(error: string): void {
    this.logger.error(`Orchestrator error: ${error}`)
    this.onError.invoke(error)
    const errorMessage: ChatMessage = {
      id: `error_${Date.now()}`,
      type: "bot",
      content: `System Error: ${error}`,
      timestamp: Date.now(),
      cardIndex: -1,
      relatedTools: []
    }
    this.displayMessage(errorMessage)
  }

  // ===== Public API =====

  public refreshChatDisplay(): void {
    this.logger.info("Refresh requested (messages flow through AgentOrchestrator events)")
  }

  public clearAllMessages(): void {
    if (this.agentOrchestrator) {
      this.agentOrchestrator.resetSystem()
    }
    this.logger.info("All messages cleared via AgentOrchestrator")
  }

  public getBridgeStatus(): {isConnected: boolean; messageCount: number; hasValidComponents: boolean} {
    return {
      isConnected: this.isConnected,
      messageCount: this.chatLayout ? FastChatExtensions.getCardCount(this.chatLayout) : 0,
      hasValidComponents: !!(this.agentOrchestrator && this.chatStorage && this.chatLayout)
    }
  }

  public async sendTestMessage(content: string, isUser: boolean = true): Promise<void> {
    if (!this.agentOrchestrator || !isUser) return
    try {
      await this.agentOrchestrator.processUserQuery(content)
      this.logger.info(`Test message sent: "${content}"`)
    } catch (error) {
      this.logger.error(`Test message failed: ${error}`)
    }
  }
}
