/**
 * Specs Inc. 2026
 * Image Node component for the Agentic Playground Spectacles lens.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {ImageGenBridge} from "../Core/ImageGenBridge"
import {GenerationQueue} from "../Utils/GenerationQueue"

/**
 * Image Node Component for Diagram System
 * According to diagram specification - includes text title and image placeholder position
 * Uses GenerationQueue system for managed image generation
 */
@component
export class ImageNode extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ImageNode</span>')
  @ui.separator

  // ================================
  // Inspector Configuration
  // ================================

  @input
  @hint("Text component for the node title")
  public titleText: Text

  @input
  @hint("Image component for the node image")
  public imageComponent: Image

  @input
  @hint("Text component for the node content/description")
  public contentText: Text

  @input
  @hint("Unique identifier for this node")
  public nodeId: string = ""

  @input
  @hint("Position in the diagram structure")
  public nodePosition: vec3 = vec3.zero()

  @input
  @hint("Level in the diagram hierarchy")
  public nodeLevel: number = 1

  

  // Image generation configuration
  @input
  @hint("Enable automatic image generation")
  public enableImageGeneration: boolean = true

  @input
  @hint("ImageGenBridge component for specialized image generation")
  public imageGenerator: ImageGenBridge

  @input
  @hint("Loading indicator to show during image generation")
  public loadingSpinner: SceneObject

  @input
  @hint("Enable queue-based generation for multiple concurrent requests")
  public useGenerationQueue: boolean = true

  // ================================
  // Internal State
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
  private title: string = ""
  private content: string = ""
  private imagePrompt: string = ""
  private isGeneratingImage: boolean = false

  // Character limits according to diagram specification
  private static readonly MAX_TITLE_LENGTH: number = 50
  private static readonly MAX_CONTENT_LENGTH: number = 200
  private static readonly MAX_PROMPT_LENGTH: number = 150

  // ================================
  // Lifecycle Methods
  // ================================

  onAwake(): void {
    this.logger = new Logger("ImageNode", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.initializeNode()
  }

  // ================================
  // Public Interface
  // ================================

  /**
   * Set the node data (title, content, and image prompt)
   */
  public setNodeData(title: string, content: string, imagePrompt?: string): void {
    this.title = this.enforceCharacterLimit(title, ImageNode.MAX_TITLE_LENGTH)
    this.content = this.enforceCharacterLimit(content, ImageNode.MAX_CONTENT_LENGTH)

    if (imagePrompt) {
      this.imagePrompt = this.enforceCharacterLimit(imagePrompt, ImageNode.MAX_PROMPT_LENGTH)
    }

    this.updateDisplay()

    this.logger.info(
      `ImageNode: Updated node ${this.nodeId} - Title: "${this.title}", Content: "${this.content.substring(0, 30)}..."`
    )
  }

  /**
   * Get the current node data
   */
  public getNodeData(): {title: string; content: string; imagePrompt: string} {
    return {
      title: this.title,
      content: this.content,
      imagePrompt: this.imagePrompt
    }
  }

  /**
   * Update the node position
   */
  public setPosition(position: vec3): void {
    this.nodePosition = position
    this.getTransform().setWorldPosition(position)

          this.logger.info(`Updated position for node ${this.nodeId} to ${position.toString()}`)
  }

  /**
   * Get the current node position
   */
  public getPosition(): vec3 {
    return this.nodePosition
  }

  /**
   * Set the hierarchy level
   */
  public setLevel(level: number): void {
    this.nodeLevel = level

          this.logger.info(`Updated level for node ${this.nodeId} to ${level}`)
  }

  /**
   * Get the hierarchy level
   */
  public getLevel(): number {
    return this.nodeLevel
  }

  /**
   * Generate image content based on prompt
   * Uses GenerationQueue for managed generation or falls back to direct generation
   */
  public async generateContent(prompt: string): Promise<void> {
    // Always log generation attempts for debugging
    this.logger.info(`generateContent called for node ${this.nodeId} with prompt: "${prompt}"`)

    if (!this.enableImageGeneration) {
      this.logger.info(`Image generation disabled for node ${this.nodeId}`)
      return
    }

    if (this.isGeneratingImage) {
      this.logger.info(`⏳ Already generating image for node ${this.nodeId}`)
      return
    }

    this.isGeneratingImage = true
    this.imagePrompt = this.enforceCharacterLimit(prompt, ImageNode.MAX_PROMPT_LENGTH)

    // Spinner should already be enabled from initialization
    if (!this.loadingSpinner) {
      this.logger.info(`Loading spinner not assigned for node ${this.nodeId}`)
    }

    // Check if we should use the queue system
    if (this.useGenerationQueue) {
      this.logger.info(`📥 Using GenerationQueue for node ${this.nodeId} with prompt: "${this.imagePrompt}"`)

      try {
        const queue = GenerationQueue.getInstance()

        // Queue the generation request
        const requestId = queue.queueImageGeneration({
          id: `img_${this.nodeId}_${Date.now()}`,
          type: "image",
          prompt: this.imagePrompt,
          priority: this.nodeLevel, // Use hierarchy level as priority
          callback: (texture: Texture) => {
            // Success - apply texture and disable spinner
            if (texture) {
              this.setImage(texture)
            }
            if (this.loadingSpinner) {
              this.loadingSpinner.enabled = false
              this.logger.info(`Loading spinner disabled - image received via queue for node ${this.nodeId}`)
            }
            this.isGeneratingImage = false
          },
          errorCallback: (error: string) => {
            // Error - disable spinner
            this.logger.error(`Queue generation error for node ${this.nodeId}: ${error}`)
            if (this.loadingSpinner) {
              this.loadingSpinner.enabled = false
              this.logger.error(`Loading spinner disabled - queue error for node ${this.nodeId}`)
            }
            this.isGeneratingImage = false
          },
          metadata: {nodeId: this.nodeId}
        })

        this.logger.info(`Queued image generation request ${requestId} for node ${this.nodeId}`)
      } catch (error) {
        this.logger.error(`Error queuing image generation for node ${this.nodeId}: ${error}`)

        // Disable spinner on error
        if (this.loadingSpinner) {
          this.loadingSpinner.enabled = false
        }
        this.isGeneratingImage = false
      }
    } else {
      // Fallback to direct generation (legacy mode)
      this.logger.info(`Using direct generation for node ${this.nodeId} with prompt: "${this.imagePrompt}"`)

      if (!this.imageGenerator) {
        this.logger.info(`ImageGenBridge not assigned for node ${this.nodeId}`)
        this.isGeneratingImage = false
        return
      }

      // Check if the bridge is ready
      if (typeof this.imageGenerator.isReady === "function" && !this.imageGenerator.isReady()) {
        this.logger.info(`ImageGenBridge not ready for node ${this.nodeId}`)
        this.isGeneratingImage = false
        return
      }

      try {
        // Set up callbacks to disable spinner when image is actually received
        this.imageGenerator.setExternalCallbacks(
          () => {
            // Success callback - disable spinner when image is applied
            if (this.loadingSpinner) {
              this.loadingSpinner.enabled = false
              this.logger.info(`Loading spinner disabled - image received for node ${this.nodeId}`)
            }
            this.isGeneratingImage = false
          },
          (error: string) => {
            // Failure callback - disable spinner on error
            if (this.loadingSpinner) {
              this.loadingSpinner.enabled = false
              this.logger.error(`Loading spinner disabled - error occurred for node ${this.nodeId}: ${error}`)
            }
            this.isGeneratingImage = false
          }
        )

        // Delegate to ImageGenBridge for specialized image generation
        // Pass controlSpinner: false so the node controls its own spinner
        await this.imageGenerator.generateImage(this.imagePrompt, false)

        this.logger.info(`Successfully delegated image generation for node ${this.nodeId}`)
      } catch (error) {
        this.logger.error(`Error in image generation for node ${this.nodeId}: ${error}`)

        // Disable spinner on error
        if (this.loadingSpinner) {
          this.loadingSpinner.enabled = false
          this.logger.error(`Loading spinner disabled - generation error for node ${this.nodeId}`)
        }
        this.isGeneratingImage = false
      }
    }
  }

  /**
   * Set a pre-existing image texture
   */
  public setImage(texture: Texture): void {
    if (this.imageComponent && texture) {
      this.imageComponent.mainMaterial.mainPass.baseTex = texture

      this.logger.info(`Set pre-existing image for node ${this.nodeId}`)
    }
  }

  /**
   * Check if the node is currently generating content
   */
  public isGenerating(): boolean {
    return this.isGeneratingImage
  }

  /**
   * Update text content (for compatibility with old system)
   */
  public updateText(title: string, content: string): void {
    this.setNodeData(title, content)
  }

  // ================================
  // Private Methods
  // ================================

  /**
   * Initialize the node component
   */
  private initializeNode(): void {
    if (this.isInitialized) return

    // Generate node ID if not provided
    if (!this.nodeId || this.nodeId === "") {
      this.nodeId = this.generateNodeId()
    }

    // Set initial content if texts exist
    if (this.titleText && this.titleText.text) {
      this.title = this.enforceCharacterLimit(this.titleText.text, ImageNode.MAX_TITLE_LENGTH)
    }

    if (this.contentText && this.contentText.text) {
      this.content = this.enforceCharacterLimit(this.contentText.text, ImageNode.MAX_CONTENT_LENGTH)
    }

    this.updateDisplay()

    // Spinner is already enabled in onAwake()

    this.isInitialized = true

          this.logger.info(`Initialized node ${this.nodeId} at level ${this.nodeLevel}`)
  }

  /**
   * Update the visual display of the node
   */
  private updateDisplay(): void {
    if (this.titleText) {
      this.titleText.text = this.title
    }

    if (this.contentText) {
      this.contentText.text = this.content
    }
  }

  /**
   * Enforce character limits on text
   */
  private enforceCharacterLimit(text: string, maxLength: number): string {
    if (!text) return ""

    if (text.length > maxLength) {
      const truncated = text.substring(0, maxLength - 3) + "..."

      this.logger.info(`Truncated text from ${text.length} to ${maxLength} characters`)

      return truncated
    }

    return text
  }

  /**
   * Generate a unique node ID
   */
  private generateNodeId(): string {
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 1000)
    return `image_node_${timestamp}_${random}`
  }
}
