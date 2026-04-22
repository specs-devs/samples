/**
 * Specs Inc. 2026
 * Storage Manager handling core logic for the Agentic Playground lens.
 */
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {ChatStorage} from "./ChatStorage"
import {DiagramStorage} from "./DiagramStorage"
import {SummaryStorage} from "./SummaryStorage"

/**
 * StorageManager - Centralized storage management for the Agentic Playground
 *
 * This manager provides a single point of control for all storage components:
 * - ChatStorage: Conversation history from the agentic chat system
 * - SummaryStorage: Accumulated text and summaries from lectures
 * - DiagramStorage: Diagram definitions created by the diagram tool
 *
 * Information flow:
 * - Summary storage informs the chat
 * - Chat storage and summary storage inform diagram creation
 * - Diagram storage is used to create parsing docs for diagram generation
 *
 * Centralizes the "reset storage on awake" functionality that was previously
 * scattered across multiple components (AgentOrchestrator, DiagramBridge, SummaryBridge)
 */
@component
export class StorageManager extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">StorageManager</span>')
  @ui.separator

  // ================================
  // Storage References
  // ================================

  @input
  @hint("Reference to ChatStorage component")
  public chatStorage: ChatStorage = null

  @input
  @hint("Reference to SummaryStorage component")
  public summaryStorage: SummaryStorage = null

  @input
  @hint("Reference to DiagramStorage component")
  public diagramStorage: DiagramStorage = null

  // ================================
  // Configuration
  // ================================

  @input
  @hint("Reset all storage on awake (centralized control)")
  public resetStorageOnAwake: boolean = false
  @input
  @hint("Enable cross-storage information flow")
  public enableStorageIntegration: boolean = true

  // ================================
  // State Management
  // ================================


  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private isInitialized: boolean = false
  private storageReferences: Map<string, any> = new Map()

  // ================================
  // Events
  // ================================

  public onStorageReset: Event<void> = new Event<void>()
  public onStorageError: Event<string> = new Event<string>()
  public onIntegrationUpdate: Event<string> = new Event<string>()

  // ================================
  // Lifecycle Methods
  // ================================

  onAwake(): void {
    this.logger = new Logger("StorageManager", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private initialize(): void {
          this.logger.info("Initializing storage manager")

    // Validate storage references
    this.validateStorageReferences()

    // Reset storage if requested
    if (this.resetStorageOnAwake) {
      this.resetAllStorage()
    }

    // Setup storage integration if enabled
    if (this.enableStorageIntegration) {
      this.setupStorageIntegration()
    }

    this.isInitialized = true

          this.logger.info("Storage manager initialized successfully")
  }

  // ================================
  // Storage Management
  // ================================

  /**
   * Validate that all storage references are properly assigned
   */
  private validateStorageReferences(): void {
    const validationResults: string[] = []

    if (!this.chatStorage) {
      validationResults.push("ChatStorage not assigned")
    } else {
      this.storageReferences.set("chat", this.chatStorage)
    }

    if (!this.summaryStorage) {
      validationResults.push("SummaryStorage not assigned")
    } else {
      this.storageReferences.set("summary", this.summaryStorage)
    }

    if (!this.diagramStorage) {
      validationResults.push("DiagramStorage not assigned")
    } else {
      this.storageReferences.set("diagram", this.diagramStorage)
    }

    if (validationResults.length > 0) {
      this.logger.info("Storage validation results:")
      validationResults.forEach((result) => this.logger.info(`  ${result}`))

      if (validationResults.length === 3) {
        this.onStorageError.invoke("No storage components assigned")
      }
    } else       this.logger.info("All storage components validated")
  }

  /**
   * Reset all storage components
   */
  public resetAllStorage(): void {
          this.logger.info("Resetting all storage components")

    try {
      // Reset Chat Storage
      if (this.chatStorage) {
        this.chatStorage.clearAllMemory()
        this.logger.info("Chat storage reset")
      }

      // Reset Summary Storage
      if (this.summaryStorage) {
        this.summaryStorage.clearAllSummaries()
        this.logger.info("Summary storage reset")
      }

      // Reset Diagram Storage
      if (this.diagramStorage) {
        this.diagramStorage.clearAllDiagrams()
        this.logger.info("Diagram storage reset")
      }

      this.onStorageReset.invoke()

      this.logger.info("All storage components reset successfully")
    } catch (error) {
      const errorMsg = `Failed to reset storage: ${error}`
      this.logger.error(`${errorMsg}`)
      this.onStorageError.invoke(errorMsg)
    }
  }

  /**
   * Reset specific storage component
   */
  public resetStorage(storageType: "chat" | "summary" | "diagram"): void {
    try {
      switch (storageType) {
        case "chat":
          if (this.chatStorage) {
            this.chatStorage.clearAllMemory()
            this.logger.info("Chat storage reset")
          }
          break

        case "summary":
          if (this.summaryStorage) {
            this.summaryStorage.clearAllSummaries()
            this.logger.info("Summary storage reset")
          }
          break

        case "diagram":
          if (this.diagramStorage) {
            this.diagramStorage.clearAllDiagrams()
            this.logger.info("Diagram storage reset")
          }
          break
      }
    } catch (error) {
      const errorMsg = `Failed to reset ${storageType} storage: ${error}`
      this.logger.error(`${errorMsg}`)
      this.onStorageError.invoke(errorMsg)
    }
  }

  // ================================
  // Storage Integration
  // ================================

  /**
   * Setup integration between storage components for information flow
   */
  private setupStorageIntegration(): void {
          this.logger.info("Setting up storage integration")

    // Summary → Chat integration
    if (this.summaryStorage && this.chatStorage) {
      this.summaryStorage.onSummaryGenerated.add((summaryDoc) => {
        this.logger.info("📝 Summary generated, informing chat storage")
        // Store summary context in chat storage for reference
        const summaryContext = `[Summary Available] ${summaryDoc.summaryTitle} with ${summaryDoc.sections.length} sections`
        // Could add method to ChatStorage to store context
        this.onIntegrationUpdate.invoke(`Summary → Chat: ${summaryContext}`)
      })
    }

    // Chat + Summary → Diagram integration
    if (this.chatStorage && this.summaryStorage && this.diagramStorage) {
      // When significant conversation or summary milestones are reached,
      // prepare context for diagram creation
      this.setupDiagramIntegration()
    }
  }

  /**
   * Setup diagram integration with chat and summary storage
   */
  private setupDiagramIntegration(): void {
    // Monitor chat for diagram-relevant content
    if (this.chatStorage) {
      this.chatStorage.onMessageAdded.add((message) => {
        // Check if message mentions diagrams or visualization
        if (this.shouldTriggerDiagramContext(message.content)) {
          this.prepareDiagramContext()
        }
      })
    }
  }

  /**
   * Check if content should trigger diagram context preparation
   */
  private shouldTriggerDiagramContext(content: string): boolean {
    const diagramKeywords = ["diagram", "visualize", "chart", "graph", "mind map", "flow"]
    const lowerContent = content.toLowerCase()
    return diagramKeywords.some((keyword) => lowerContent.includes(keyword))
  }

  /**
   * Prepare context from chat and summary for diagram creation
   */
  private prepareDiagramContext(): void {
    const context = {
      chatHistory: this.getChatContext(),
      summaryContent: this.getSummaryContext(),
      timestamp: Date.now()
    }

          this.logger.info("Prepared diagram context from chat and summary")

    this.onIntegrationUpdate.invoke("Diagram context prepared")
  }

  // ================================
  // Context Retrieval Methods
  // ================================

  /**
   * Get relevant chat context for other systems
   */
  public getChatContext(maxMessages: number = 10): any[] {
    if (!this.chatStorage) return []

    const currentSession = this.chatStorage.getCurrentSession()
    if (!currentSession || !currentSession.messages) return []

    return currentSession.messages.slice(-maxMessages)
  }

  /**
   * Get summary context for other systems
   */
  public getSummaryContext(): any {
    if (!this.summaryStorage) return null

    return {
      currentText: this.summaryStorage.getCurrentText(),
      currentSummary: this.summaryStorage.getCurrentSummary(),
      allSummaries: this.summaryStorage.getAllSummaries()
    }
  }

  /**
   * Get diagram context for other systems
   */
  public getDiagramContext(): any {
    if (!this.diagramStorage) return null

    return {
      currentDiagram: this.diagramStorage.getCurrentDiagram(),
      allDiagrams: this.diagramStorage.getAllDiagrams()
    }
  }

  // ================================
  // Status and Monitoring
  // ================================

  /**
   * Get storage status for all components
   */
  public getStorageStatus(): {
    isInitialized: boolean
    chat: any
    summary: any
    diagram: any
  } {
    return {
      isInitialized: this.isInitialized,
      chat: this.chatStorage ? this.chatStorage.getStorageStats() : null,
      summary: this.summaryStorage ? this.summaryStorage.getStorageStats() : null,
      diagram: this.diagramStorage
        ? {
            totalDiagrams: this.diagramStorage.getAllDiagrams().length,
            hasCurrent: !!this.diagramStorage.getCurrentDiagram()
          }
        : null
    }
  }

  /**
   * Check if all storage components are ready
   */
  public isReady(): boolean {
    return this.isInitialized && !!this.chatStorage && !!this.summaryStorage && !!this.diagramStorage
  }

  // ================================
  // Storage Access Methods
  // ================================

  /**
   * Get chat storage reference
   */
  public getChatStorage(): ChatStorage | null {
    return this.chatStorage
  }

  /**
   * Get summary storage reference
   */
  public getSummaryStorage(): SummaryStorage | null {
    return this.summaryStorage
  }

  /**
   * Get diagram storage reference
   */
  public getDiagramStorage(): DiagramStorage | null {
    return this.diagramStorage
  }
}
