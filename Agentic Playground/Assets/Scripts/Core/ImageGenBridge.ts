/**
 * Specs Inc. 2026
 * Image Gen Bridge component for the Agentic Playground Spectacles lens.
 */
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {setTimeout} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils"
import {ImageGen} from "./ImageGen"

/**
 * ImageGenBridge - Bridge component for image generation in diagram system
 *
 * UI management layer that delegates core image generation to ImageGen factory
 * Handles spinners, text displays, and user interaction
 */
@component
export class ImageGenBridge extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ImageGenBridge</span>')
  @ui.separator

  @input
  @hint("Image component to display generated image")
  private image: Image

  @input
  @hint("Text component to display status")
  private textDisplay: Text

  @input
  @hint("Spinner/loading indicator")
  private spinner: SceneObject

  @input
  @hint("ImageGen factory component for core image generation")
  private imageGenFactory: ImageGen

  @input
  @widget(new ComboBoxWidget([new ComboBoxItem("OpenAI", "OpenAI"), new ComboBoxItem("Gemini", "Gemini")]))
  private modelProvider: string = "OpenAI"

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  @input
  @hint("Test generation on awake with this prompt")
  private testOnAwake: boolean = false

  @input
  @hint("Test prompt")
  @widget(new TextAreaWidget())
  private testPrompt: string = "A beautiful landscape"
  private isGenerating: boolean = false
  private isInitialized: boolean = false
  private callbackInvoked: boolean = false

  // External completion callbacks
  private onExternalSuccess: (() => void) | null = null
  private onExternalFailure: ((error: string) => void) | null = null

  onAwake(): void {
    this.logger = new Logger("ImageGenBridge", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.initializeFactory()
    this.logger.info("Image generation bridge initialized")
    if (this.testOnAwake && this.testPrompt) {
      this.generateImage(this.testPrompt)
    }
  }

  private initializeFactory(): void {
    if (!this.imageGenFactory) {
      this.logger.info("ImageGen factory not assigned - skipping initialization")
      this.isInitialized = false
      return
    }

    try {
      // Verify that the factory has the required methods
      if (typeof this.imageGenFactory.setImageCallback !== "function") {
        this.logger.info("ImageGen factory missing setImageCallback method")
        this.isInitialized = false
        return
      }

      if (typeof this.imageGenFactory.setFailureCallback !== "function") {
        this.logger.error("ImageGen factory missing setFailureCallback method")
        this.isInitialized = false
        return
      }

      // Set up callbacks for ImageGen to communicate back to this bridge
      this.imageGenFactory.setImageCallback((texture: Texture) => {
        this.applyGeneratedImage(texture)
      })

      this.imageGenFactory.setFailureCallback((error: string) => {
        this.handleError(error)
      })

      // Sync provider settings
      if (typeof this.imageGenFactory.switchProvider === "function") {
        this.imageGenFactory.switchProvider(this.modelProvider)
      }

      this.isInitialized = true

      this.logger.info("ImageGen factory integrated")
    } catch (error) {
      this.logger.error(`Error initializing factory: ${error}`)
      this.isInitialized = false
    }
  }

  private setupImageComponent(): void {
    if (this.image) {
      // Clone the image material to avoid modifying the original
      const imgMat = this.image.mainMaterial.clone()
      this.image.clearMaterials()
      this.image.mainMaterial = imgMat

      this.logger.info("Image component configured")
    }
  }

  /**
   * Generate image from text prompt
   * Delegates to ImageGen factory for core generation
   * @param prompt Text prompt for image generation
   * @param controlSpinner Whether this bridge should control its own spinner (default: true)
   * @returns Promise that resolves when image is generated
   */
  public async generateImage(prompt: string, controlSpinner: boolean = true): Promise<void> {
    if (this.isGenerating) {
      this.logger.info("⏳ Already generating image")
      return
    }

    if (!this.isInitialized || !this.imageGenFactory) {
      const error = "ImageGen factory not available - cannot generate image"
      this.logger.error(`${error}`)
      this.handleError(error)
      return // Don't throw error, just return gracefully
    }

    if (!prompt || prompt.trim() === "") {
      const error = "Invalid prompt provided"
      this.handleError(error)
      throw new Error(error)
    }

    this.isGenerating = true
    this.callbackInvoked = false // Reset callback tracking

    // Only control spinner if explicitly requested (standalone mode)
    if (controlSpinner) {
      if (this.spinner) {
        this.spinner.enabled = true
        this.logger.info(`Loading spinner enabled (standalone mode)`)
      } else {
        this.logger.info(`Loading spinner not assigned (standalone mode)`)
      }
    } else {
      this.logger.info(`Spinner control delegated to calling Node component`)
    }

    if (this.textDisplay) {
      this.textDisplay.text = "Generating: " + prompt
    }

          this.logger.info(`Delegating image generation: "${prompt}"`)

    try {
      // Delegate to ImageGen factory for core generation
      const generatedTexture = await this.imageGenFactory.generateImage(prompt)

      this.logger.info(`Image generation completed for: "${prompt}"`)

      // Image application is handled by callback from ImageGen
      // But we'll set a timeout to ensure spinner is disabled even if callback doesn't fire
      if (!controlSpinner && this.onExternalSuccess) {
        // Set a safety timeout to disable spinner if callback doesn't fire within 5 seconds
        const safetyTimeout = setTimeout(() => {
          if (this.isGenerating && !this.callbackInvoked) {
            this.logger.info(`Safety timeout - ensuring spinner is disabled`)
            this.callbackInvoked = true // Prevent double callback
            if (this.onExternalSuccess) {
              this.onExternalSuccess()
            }
            this.isGenerating = false
          }
        }, 5000)
      }
    } catch (error) {
      const errorMessage = `Image generation failed: ${error}`
      this.handleError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      this.isGenerating = false

      // Only control spinner if explicitly requested (standalone mode)
      if (controlSpinner && this.spinner) {
        this.spinner.enabled = false
        this.logger.info(`Loading spinner disabled (standalone mode)`)
      }
    }
  }

  /**
   * Apply generated image (called by ImageGen callback)
   */
  private applyGeneratedImage(texture: Texture): void {
    if (texture && this.image) {
      this.image.mainMaterial.mainPass.baseTex = texture

      if (this.textDisplay) {
        this.textDisplay.text = "Image Generated"
      }

      this.logger.info("Applied generated image")

      // Notify external completion callback
      if (!this.callbackInvoked && this.onExternalSuccess) {
        this.callbackInvoked = true // Prevent double callback
        this.onExternalSuccess()
      }
    }
  }

  /**
   * Switch AI provider (OpenAI/Gemini)
   * @param provider Provider name
   */
  public switchProvider(provider: string): void {
    if (provider !== this.modelProvider) {
      this.modelProvider = provider

      // Update the ImageGen factory
      if (this.imageGenFactory) {
        this.imageGenFactory.switchProvider(provider)
      }

      this.logger.info(`Switched to provider: ${provider}`)
    }
  }

  /**
   * Check if currently generating an image
   * @returns true if generation is in progress
   */
  public isGeneratingImage(): boolean {
    return this.isGenerating || (this.imageGenFactory ? this.imageGenFactory.isGeneratingImage() : false)
  }

  /**
   * Get current provider
   * @returns Current AI provider name
   */
  public getCurrentProvider(): string {
    return this.modelProvider
  }

  /**
   * Check if image generator is available and ready
   * @returns true if ready for generation
   */
  public isReady(): boolean {
    return (
      this.isInitialized &&
      !this.isGenerating &&
      (this.imageGenFactory ? !this.imageGenFactory.isGeneratingImage() : false)
    )
  }

  /**
   * Set a pre-existing texture to the image
   * @param texture Texture to apply
   */
  public setTexture(texture: Texture): void {
    if (this.imageGenFactory) {
      this.imageGenFactory.setTexture(texture)

      this.logger.info("📎 Applied pre-existing texture via factory")
    }
  }

  /**
   * Get the current image component
   * @returns Image component reference
   */
  public getImageComponent(): Image {
    return this.image
  }

  /**
   * Set external completion callbacks
   * @param onSuccess Callback when image is successfully generated and applied
   * @param onFailure Callback when image generation fails
   */
  public setExternalCallbacks(onSuccess: () => void, onFailure: (error: string) => void): void {
    this.onExternalSuccess = onSuccess
    this.onExternalFailure = onFailure
  }

  /**
   * Handle errors during image generation
   * @param error Error message
   */
  private handleError(error: string): void {
    this.logger.error(`${error}`)

    if (this.textDisplay) {
      this.textDisplay.text = "Error: " + error
    }

    if (this.spinner) {
      this.spinner.enabled = false
    }

    this.isGenerating = false

    // Notify external failure callback
    if (!this.callbackInvoked && this.onExternalFailure) {
      this.callbackInvoked = true // Prevent double callback
      this.onExternalFailure(error)
    }
  }
}
