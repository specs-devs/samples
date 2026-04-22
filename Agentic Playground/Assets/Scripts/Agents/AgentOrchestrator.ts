/**
 * Specs Inc. 2026
 * Agent Orchestrator component for the Agentic Playground Spectacles lens.
 */
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {clearTimeout, setTimeout} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {FastChatController} from "../FastUIControllers/FastChatController"
import {FastDeckController} from "../FastUIControllers/FastDeckController"
import {GeminiAssistant} from "../Core/GeminiAssistant"
import {OpenAIAssistant} from "../Core/OpenAIAssistant"
import {StorageManager} from "../Storage/StorageManager"
import {ToolRouter} from "../Tools/ToolRouter"
import {AgentLanguageInterface} from "./AgentLanguageInterface"
import {AgentMemorySystem} from "./AgentMemorySystem"
import {AgentToolExecutor} from "./AgentToolExecutor"
import {ChatMessage, SystemState} from "./AgentTypes"

/**
 * AgentOrchestrator - Central coordinator for the agentic learning system
 *
 * This is the core component that manages the entire agent flow as shown in the architecture diagram:
 * 1. Receives queries from ChatASRController
 * 2. Routes queries through the tool system (conversation, summary, spatial, diagram tools)
 * 3. Coordinates between different flows (Summary, Chat, Diagram)
 * 4. Manages LLM providers (OpenAI/Gemini)
 * 5. Integrates with bridge components for UI updates
 *
 * Architecture Flow:
 * ChatASRController → AgentOrchestrator → ToolExecutor → Tools → Bridges → UI Components
 */
@component
export class AgentOrchestrator extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">AgentOrchestrator – Central coordinator for the agentic system</span><br/><span style="color: #94A3B8; font-size: 11px;">Routes queries through tools, manages AI providers and memory.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("OpenAI Assistant component for language model integration")
  openAIAssistant: OpenAIAssistant = null

  @input
  @hint("Gemini Assistant component for language model integration")
  geminiAssistant: GeminiAssistant = null

  @input
  @hint("FastDeckController component for reading summary context")
  summaryComponent: FastDeckController = null

  @input
  @hint("FastChatController component for chat integration")
  chatComponent: FastChatController = null

  @input
  @hint("Storage Manager for centralized storage control")
  storageManager: StorageManager = null

  @input
  @hint("Text display component for tool usage information")
  toolDisplayText: Text = null

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">System Configuration</span>')
  @input
  @hint("Enable the agent system")
  enableSystem: boolean = true

  @input
  @hint("Enable test mode to use mock summary data when no real summary exists")
  enableTestMode: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Agent Configuration</span>')
  @input
  @hint("Number of recent conversation messages to include as context")
  conversationContextMessages: number = 10

  @input
  @hint("Tool execution timeout in milliseconds")
  toolTimeout: number = 15000

  @input
  @hint("Maximum number of retries for failed tool executions")
  maxRetries: number = 3

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">AI Provider Configuration</span>')
  @input
  @hint("Default AI provider to use for language generation")
  @widget(new ComboBoxWidget([new ComboBoxItem("openai", "OpenAI"), new ComboBoxItem("gemini", "Gemini")]))
  defaultProvider: string = "openai"

  @input
  @hint("Enable voice output from AI responses")
  enableVoiceOutput: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Debug Configuration</span>')
  @input
  @hint("Show which tool was selected for each query")
  showToolUsage: boolean = true

  @input
  @hint("Show query routing decisions in the logger")
  showQueryRouting: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private languageInterface: AgentLanguageInterface = null
  private toolExecutor: AgentToolExecutor = null
  private memorySystem: AgentMemorySystem = null
  private toolRouter: ToolRouter = null

  // ================================
  // State Management
  // ================================

  private systemState: SystemState = null
  private isProcessingQuery: boolean = false
  private currentSessionId: string = ""
  private initialized: boolean = false

  // FIX: Track current conversation for voice completion events
  private currentQuery: string = ""
  private currentResponse: string = ""
  private accumulatedTranscription: string = "" // Track voice transcription separately
  private transcriptionSilenceTimer: any = null
  private lastTranscriptionTime: number = 0

  // ================================
  // Events
  // ================================

  public onQueryReceived: Event<string> = new Event<string>()
  public onQueryProcessed: Event<{query: string; response: string; tool: string}> = new Event()
  public onVoiceCompleted: Event<{query: string; response: string}> = new Event() // FIX: Voice completion event
  public onSystemStateChanged: Event<SystemState> = new Event<SystemState>()
  public onError: Event<string> = new Event<string>()
  public onSystemReset: Event<void> = new Event<void>() // FIX: Event for UI clearing

  onAwake(): void {
    this.logger = new Logger("AgentOrchestrator", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.enableVoiceOutput = true
    this.logger.info("Voice output explicitly enabled at startup")
  }

  @bindStartEvent
  private initialize(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")

    if (!this.enableSystem) {
      this.logger.info("System disabled, skipping initialization")
      return
    }

    try {
      this.initializeComponents()
      this.setupConnections()
      this.initializeSystemState()
      this.initialized = true

      this.logger.info("Central orchestrator initialized successfully")
      this.logger.info(`Default provider: ${this.defaultProvider}`)
      this.logger.info(`Tool timeout: ${this.toolTimeout}ms`)
    } catch (error) {
      this.handleError(`Initialization failed: ${error}`)
    }
  }

  private initializeComponents(): void {
    if (!this.openAIAssistant && !this.geminiAssistant) {
      throw new Error("No AI assistants configured. Please assign either OpenAI or Gemini assistant in the inspector.")
    }

    this.logger.debug(
      `Available assistants - OpenAI: ${this.openAIAssistant ? "yes" : "no"}, Gemini: ${this.geminiAssistant ? "yes" : "no"}`
    )

    try {
      this.languageInterface = new AgentLanguageInterface(this.openAIAssistant, this.geminiAssistant, this.logger)

      this.languageInterface.setDefaultProvider(this.defaultProvider as "openai" | "gemini")

      this.logger.info("Language interface created successfully")
    } catch (error) {
      this.logger.error(`Language interface initialization failed: ${error}`)
      throw new Error(`Language interface initialization failed: ${error}`)
    }

    this.toolExecutor = new AgentToolExecutor(this.toolDisplayText, this.logger)
    this.memorySystem = new AgentMemorySystem(this.logger)

    const diagramStorage = this.storageManager ? this.storageManager.getDiagramStorage() : null
    this.toolRouter = new ToolRouter(this.languageInterface, diagramStorage, this.logger)

    // Connect summary and chat storage to the tool router if available
    if (this.storageManager) {
      const summaryStorage = this.storageManager.getSummaryStorage()
      const chatStorage = this.storageManager.getChatStorage()

      if (summaryStorage) {
        this.toolRouter.setSummaryStorage(summaryStorage)
      }
      if (chatStorage) {
        this.toolRouter.setChatStorage(chatStorage)
      }
    }

    // Register the intelligent tool router as the main tool
    this.toolExecutor.registerTool({
      name: "intelligent_conversation",
      description: "Routes queries to appropriate specialized tools",
      parameters: this.toolRouter.getToolInfo().parameters,
      execute: async (args) => {
        const result = await this.toolRouter.routeQuery(args)
        return {
          ...result,
          executionTime: 0 // ExecutionTime will be set by ToolExecutor
        }
      }
    })

          this.logger.info("Core components initialized")
  }

  private setupConnections(): void {
    // Setup language interface events
    if (this.languageInterface) {
      this.languageInterface.onTextUpdate.add((data) => {
        this.logger.debug(
          `LLM text update from ${data.provider} - completed: ${data.completed}, text: "${data.text?.substring(0, 50)}..."`
        )

        // FIX: Accumulate transcription text when voice is enabled
        if (this.enableVoiceOutput && data.text && data.text.length > 0) {
          // Filter out system messages
          const isSystemMessage =
            data.text.includes("Websocket connected") ||
            data.text.includes("Session initialized") ||
            data.text.toLowerCase().includes("websocket")

          if (!isSystemMessage) {
            // Accumulate transcription text
            if (
              this.accumulatedTranscription.length > 0 &&
              !this.accumulatedTranscription.endsWith(" ") &&
              !data.text.startsWith(" ")
            ) {
              this.accumulatedTranscription += " "
            }
            this.accumulatedTranscription += data.text
            this.lastTranscriptionTime = Date.now()

            this.logger.debug(
              `Accumulated transcription: "${this.accumulatedTranscription}" (${this.accumulatedTranscription.length} chars)`
            )

            // Reset silence timer - fire completion event after 2 seconds of silence
            if (this.transcriptionSilenceTimer) {
              clearTimeout(this.transcriptionSilenceTimer)
            }

            this.logger.info(`Starting/resetting silence timer (2s)`)

            this.transcriptionSilenceTimer = setTimeout(() => {
              if (this.accumulatedTranscription.length > 0 && this.currentQuery) {
                const finalTranscription = this.accumulatedTranscription.trim()

                this.logger.debug(`🔇 Transcription silence detected - firing voice completion`)
                this.logger.info(`📄 Final transcription: "${finalTranscription}"`)


                // Store the bot response now that we have the transcription
                const botMessage: ChatMessage = {
                  id: `msg_${Date.now()}_bot`,
                  type: "bot",
                  content: finalTranscription,
                  timestamp: Date.now(),
                  cardIndex: -1,
                  relatedTools: ["intelligent_conversation"]
                }

                // Store in ChatStorage through StorageManager
                if (this.storageManager && this.storageManager.getChatStorage()) {
                  const chatStorage = this.storageManager.getChatStorage()
                  chatStorage.addMessage({
                    id: botMessage.id,
                    type: "bot",
                    content: botMessage.content,
                    timestamp: botMessage.timestamp,
                    cardIndex: botMessage.cardIndex,
                    relatedTools: botMessage.relatedTools
                  })

                  this.logger.info(`💾 Stored voice transcription in ChatStorage`)
                }

                // Also store in memory system for backward compatibility
                if (this.memorySystem) {
                  this.memorySystem.addChatMessage(botMessage)

                  // Update system state
                  this.systemState.chatHistory = this.memorySystem.getChatHistory()
                  this.onSystemStateChanged.invoke(this.systemState)
                } else {
                  this.logger.info(`Memory system not available - cannot store bot message`)
                }

                // Fire voice completion event
                this.logger.info(`Firing onVoiceCompleted event with transcription`)

                this.onVoiceCompleted.invoke({
                  query: this.currentQuery,
                  response: finalTranscription
                })

                // Don't clear transcription here - let it be cleared on next query
              }
            }, 2000) // 2 seconds of silence means transcription is complete
          }
        }

        // FIX: Also check for completion signals to fire voice event
        if (data.completed && this.enableVoiceOutput && this.accumulatedTranscription.length > 0) {
          this.logger.info(`Text marked as completed - checking if we should fire voice event`)

          // Fire completion event after a short delay
          setTimeout(() => {
            if (this.accumulatedTranscription.length > 0 && this.currentQuery) {
              const finalTranscription = this.accumulatedTranscription.trim()

              this.logger.info(`Completion signal - firing voice completion with transcription`)

              // Store and fire event (same as silence detection)
              const botMessage: ChatMessage = {
                id: `msg_${Date.now()}_bot`,
                type: "bot",
                content: finalTranscription,
                timestamp: Date.now(),
                cardIndex: -1,
                relatedTools: ["intelligent_conversation"]
              }

              // Store in ChatStorage through StorageManager
              if (this.storageManager && this.storageManager.getChatStorage()) {
                const chatStorage = this.storageManager.getChatStorage()
                chatStorage.addMessage({
                  id: botMessage.id,
                  type: "bot",
                  content: botMessage.content,
                  timestamp: botMessage.timestamp,
                  cardIndex: botMessage.cardIndex,
                  relatedTools: botMessage.relatedTools
                })
              }

              // Also store in memory system for backward compatibility
              if (this.memorySystem) {
                this.memorySystem.addChatMessage(botMessage)
                this.systemState.chatHistory = this.memorySystem.getChatHistory()
                this.onSystemStateChanged.invoke(this.systemState)
              }

              this.onVoiceCompleted.invoke({
                query: this.currentQuery,
                response: finalTranscription
              })

              // Clear the timer to prevent duplicate events
              if (this.transcriptionSilenceTimer) {
                clearTimeout(this.transcriptionSilenceTimer)
                this.transcriptionSilenceTimer = null
              }
            }
          }, 1000) // 1 second delay for completion signal
        }
      })

      this.languageInterface.onError.add((data) => {
        this.handleError(`LLM Error (${data.provider}): ${data.error}`)
      })
    }

    // Setup tool executor events
    if (this.toolExecutor) {
      this.toolExecutor.onToolExecuted.add((data) => {
        this.logger.info(`Tool '${data.tool}' executed in ${data.duration}ms`)
      })

      this.toolExecutor.onToolFailed.add((data) => {
        this.handleError(`Tool '${data.tool}' failed: ${data.error}`)
      })
    }

          this.logger.info("Component connections established")
  }

  private initializeSystemState(): void {
    this.currentSessionId = `session_${Date.now()}`

    this.systemState = {
      currentStep: "idle",
      summaryData: null,
      chatHistory: [],
      diagramState: null,
      sessionId: this.currentSessionId,
      timestamp: Date.now()
    }

    // Storage reset is now handled by StorageManager
    // If StorageManager has resetStorageOnAwake=true, it will handle all resets

          this.logger.info(`📋 System state initialized (Session: ${this.currentSessionId})`)
  }

  // ================================
  // Public API - Main Query Processing
  // ================================

  /**
   * Main entry point for processing user queries from ChatASRController
   * This is the core method that implements the agent flow from the architecture diagram
   */
  public async processUserQuery(query: string, context?: any): Promise<string> {
    if (!this.initialized || !this.enableSystem) {
      const error = "System not initialized or disabled"
      this.handleError(error)
      return error
    }

    if (this.isProcessingQuery) {
      this.logger.info("⏳ Already processing a query, queuing...")
      // In a production system, you might want to queue this
      return "System busy, please wait..."
    }

    this.isProcessingQuery = true
    this.onQueryReceived.invoke(query)

    // FIX: Store current query for voice completion tracking
    this.currentQuery = query
    this.currentResponse = ""
    this.accumulatedTranscription = "" // Reset transcription for new query

    // Clear any pending transcription timer
    if (this.transcriptionSilenceTimer) {
      clearTimeout(this.transcriptionSilenceTimer)
      this.transcriptionSilenceTimer = null
    }

    try {
      this.logger.info(`📥 Processing query: "${query.substring(0, 100)}..."`)

      // Update system state
      this.systemState.currentStep = "chat"
      this.systemState.timestamp = Date.now()

      // Prepare context for tool execution
      const toolArgs = {
        query: query,
        context: this.getConversationContext(),
        summaryContext: this.getSummaryContext(),
        maxLength: 300, // Character limit for responses
        educationalFocus: true,
        textOnly: !this.enableVoiceOutput // Disable voice if enableVoiceOutput is false
      }

      // Log the summary context being passed
      const summaryCtx = this.getSummaryContext()
      if (summaryCtx) {
        this.logger.debug(
          `Summary context: title="${summaryCtx.title}", sections=${summaryCtx.summaries ? summaryCtx.summaries.length : 0}`
        )
      } else {
        this.logger.debug("No summary context available")
      }

      // Execute the main intelligent conversation tool (which routes to specific tools)
      const result = await this.toolExecutor.executeTool("intelligent_conversation", toolArgs)

      // Update tool display with routing information
      this.updateToolDisplay(query, result)

      let response = "I'm having trouble processing that request."

      if (result.success && result.result) {
        if (typeof result.result === "string") {
          response = result.result
        } else if (result.result.message) {
          // FIX: Handle ChatResponse structure from GeneralConversationTool
          response = result.result.message
        } else if (result.result.response) {
          response = result.result.response
        } else if (result.result.result) {
          response = result.result.result
        } else {
          // FIX: Better error handling - show what we actually got
          this.logger.info(`Unexpected result structure: ${JSON.stringify(result.result)}`)
          response = "Unexpected response format from tool"
        }
      } else {
        response = result.error || "Tool execution failed"
      }

      // FIX: Handle voice mode placeholder responses
      let isVoicePlaceholder = false
      if (response === "[Voice response - transcription pending]" && this.enableVoiceOutput) {
        // In voice mode, we'll use the accumulated transcription instead
        this.logger.info(`Voice mode detected - will use transcription when available`)
        // Don't store placeholder in memory - wait for actual transcription
        isVoicePlaceholder = true
        response = "" // Empty response for now
      }

      // FIX: Store current response for voice completion tracking
      this.currentResponse = response

      // Store conversation in memory only if not a voice placeholder
      if (!isVoicePlaceholder) {
        this.storeConversation(query, response)
      } else {
        // For voice mode, only store the user query for now
        const userMessage: ChatMessage = {
          id: `msg_${Date.now()}_user`,
          type: "user",
          content: query,
          timestamp: Date.now(),
          cardIndex: -1,
          relatedTools: []
        }

        // Store in ChatStorage through StorageManager
        if (this.storageManager && this.storageManager.getChatStorage()) {
          const chatStorage = this.storageManager.getChatStorage()
          chatStorage.addMessage({
            id: userMessage.id,
            type: "user",
            content: userMessage.content,
            timestamp: userMessage.timestamp,
            cardIndex: userMessage.cardIndex,
            relatedTools: userMessage.relatedTools
          })
        }

        // Also store in memory system for backward compatibility
        this.memorySystem.addChatMessage(userMessage)
      }

      // Fire completion event
      this.onQueryProcessed.invoke({
        query: query,
        response: response,
        tool: "intelligent_conversation"
      })

      this.logger.info(`Query processed successfully, response length: ${response.length}`)

      return response
    } catch (error) {
      const errorMessage = `Query processing failed: ${error}`
      this.handleError(errorMessage)
      return errorMessage
    } finally {
      this.isProcessingQuery = false
      // FIX: Delay clearing current conversation to allow voice completion event to fire
      setTimeout(() => {
        this.currentQuery = ""
        this.currentResponse = ""
        // Also clear accumulated transcription if it wasn't used
        if (this.accumulatedTranscription.length > 0) {
          this.logger.info(
            `Clearing unused transcription: "${this.accumulatedTranscription.substring(0, 50)}..."`
          )
          this.accumulatedTranscription = ""
        }
      }, 5000) // 5 second delay to ensure voice completion event can access these values
    }
  }

  // ================================
  // Context Management
  // ================================

  private getConversationContext(): ChatMessage[] {
    if (!this.memorySystem) {
      return []
    }

    return this.memorySystem.getChatHistory().slice(-this.conversationContextMessages)
  }

  private getSummaryContext(): any {
    // Get the real summary from SummaryStorage through StorageManager
    if (this.storageManager && this.storageManager.getSummaryStorage()) {
      const summaryStorage = this.storageManager.getSummaryStorage()
      const currentSummary = summaryStorage.getCurrentSummary()

      if (currentSummary && currentSummary.sections && currentSummary.sections.length > 0) {
        // Convert to the format expected by SummaryTool
        return {
          title: currentSummary.summaryTitle || "Lecture Summary",
          summaries: currentSummary.sections.map((section) => ({
            title: section.title,
            content: section.content,
            keywords: section.keywords || []
          })),
          originalText: currentSummary.originalText,
          totalCharacters: currentSummary.totalCharacters,
          timestamp: currentSummary.createdAt || Date.now()
        }
      }
    }

    // Only use test data if explicitly in test mode and no real summary exists
    if (this.enableTestMode) {
      return {
        title: "AI & Machine Learning Lecture Summary",
        content:
          "This lecture covered fundamental concepts in artificial intelligence and machine learning. Key topics included neural networks, deep learning architectures, supervised and unsupervised learning, and practical applications in computer vision and natural language processing. The instructor demonstrated how backpropagation works in neural networks and discussed the importance of data preprocessing and feature engineering. Real-world examples were provided showing how these techniques are applied in industry, including image recognition, recommendation systems, and autonomous vehicles.",
        keyPoints: [
          "Neural networks and deep learning fundamentals",
          "Supervised vs unsupervised learning approaches",
          "Backpropagation algorithm and gradient descent",
          "Computer vision and NLP applications",
          "Industry applications and case studies"
        ],
        timestamp: Date.now(),
        mockData: true
      }
    }

    return null
  }

  private storeConversation(query: string, response: string): void {
    const timestamp = Date.now()

    // Store user message
    const userMessage: ChatMessage = {
      id: `msg_${timestamp}_user`,
      type: "user",
      content: query,
      timestamp: timestamp,
      cardIndex: -1,
      relatedTools: []
    }

    // Store bot response
    const botMessage: ChatMessage = {
      id: `msg_${timestamp}_bot`,
      type: "bot",
      content: response,
      timestamp: timestamp + 1,
      cardIndex: -1,
      relatedTools: ["intelligent_conversation"]
    }

    // Store in ChatStorage through StorageManager
    if (this.storageManager && this.storageManager.getChatStorage()) {
      const chatStorage = this.storageManager.getChatStorage()

      // Store user message
      chatStorage.addMessage({
        id: userMessage.id,
        type: "user",
        content: userMessage.content,
        timestamp: userMessage.timestamp,
        cardIndex: userMessage.cardIndex,
        relatedTools: userMessage.relatedTools
      })

      // Store bot response
      chatStorage.addMessage({
        id: botMessage.id,
        type: "bot",
        content: botMessage.content,
        timestamp: botMessage.timestamp,
        cardIndex: botMessage.cardIndex,
        relatedTools: botMessage.relatedTools
      })

      this.logger.info(`💾 Stored conversation in ChatStorage`)
    }

    // Also store in memory system for backward compatibility
    if (this.memorySystem) {
      this.memorySystem.addChatMessage(userMessage)
      this.memorySystem.addChatMessage(botMessage)

      // Update system state
      this.systemState.chatHistory = this.memorySystem.getChatHistory()
      this.onSystemStateChanged.invoke(this.systemState)
    }
  }

  // ================================
  // Bridge Component Integration Methods
  // ================================

  /**
   * Called by ChatBridge to ensure summary layout connection
   */
  public ensureChatAgentSummaryConnection(): void {
          this.logger.info("Ensuring ChatAgent summary layout connection")

    // This method ensures the chat system can read summary context
    // Implementation depends on your specific summary layout structure
    if (this.summaryComponent) {
      this.logger.info("Summary layout connection confirmed")
    } else {
      this.logger.info("Summary layout not assigned")
    }
  }

  /**
   * Called by ChatBridge to ensure chat layout connection
   */
  public ensureChatAgentChatLayoutConnection(): void {
          this.logger.info("Ensuring ChatAgent chat layout connection")

    if (this.chatComponent) {
      this.logger.info("Chat layout connection confirmed")
    } else {
      this.logger.info("Chat layout not assigned")
    }
  }

  /**
   * Get OpenAI assistant for bridge components
   */
  public getOpenAIAssistant(): OpenAIAssistant {
    return this.openAIAssistant
  }

  /**
   * Get Gemini assistant for bridge components
   */
  public getGeminiAssistant(): GeminiAssistant {
    return this.geminiAssistant
  }

  // ================================
  // System Management
  // ================================

  public getSystemState(): SystemState {
    return this.systemState
  }

  public isSystemReady(): boolean {
    return this.initialized && this.enableSystem && !this.isProcessingQuery
  }

  public resetSystem(): void {
    // Use StorageManager for centralized reset
    if (this.storageManager) {
      this.storageManager.resetAllStorage()
      this.logger.info("Using StorageManager for system reset")
    } else if (this.memorySystem) {
      // Fallback to old behavior if StorageManager not assigned
      this.memorySystem.clearStorage()
    }

    this.initializeSystemState()

    // FIX: Fire event to clear UI components
    this.onSystemReset.invoke()

          this.logger.info("System reset completed")
  }

  // ================================
  // Tool Display Management
  // ================================

  private updateToolDisplay(query: string, result: any): void {
    if (!this.toolDisplayText) return

    try {
      let toolDisplay = "Unknown Tool"

      // Determine which tool was used based on the result
      if (result.success && result.result) {
        if (result.result.shouldCreateDiagram) {
          toolDisplay = "Diagram Tool"
        } else if (result.result.summaryFocused) {
          toolDisplay = "📚 Summary Tool"
        } else if (result.result.spatiallyAware || result.result.toolUsed === "spatial_tool") {
          toolDisplay = "Spatial Tool"
        } else {
          toolDisplay = "Default Conversation"
        }
      }

      // Simple display - just show the current tool
      this.toolDisplayText.text = toolDisplay

      this.logger.info(`📺 Tool selected: ${toolDisplay}`)
    } catch (error) {
      this.logger.error(`Failed to update tool display: ${error}`)
    }
  }

  // ================================
  // Error Handling
  // ================================

  private handleError(error: string): void {
    this.logger.error(`${error}`)
    this.onError.invoke(error)

    // Update system state to reflect error
    if (this.systemState) {
      this.systemState.currentStep = "idle"
      this.onSystemStateChanged.invoke(this.systemState)
    }
  }
}
