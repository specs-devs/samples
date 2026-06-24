/**
 * Specs Inc. 2026
 * Generation Queue Initializer component for the Agentic Playground Spectacles lens.
 */
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {GenerationQueue} from "../Utils/GenerationQueue"
import {ImageGen} from "./ImageGen"
import {ModelGen} from "./ModelGen"

/**
 * GenerationQueueInitializer - Simple component to initialize the GenerationQueue
 *
 * This component connects the GenerationQueue singleton to the ImageGen and ModelGen
 * factories in your scene. Add this to any object in your scene and reference your
 * factories.
 *
 * This is a simplified alternative to GenerationQueueManager when you just need
 * basic queue functionality without configuration UI.
 */
@component
export class GenerationQueueInitializer extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GenerationQueueInitializer</span>')
  @ui.separator

  @input
  @hint("Reference to the ImageGen factory component")
  public imageGenFactory: ImageGen

  @input
  @hint("Reference to the ModelGen factory component")
  public modelGenFactory: ModelGen

  @input
  @hint("Enable queue system (set to false to disable queuing)")
  public enableQueueSystem: boolean = true

  @input
  @hint("Maximum concurrent image generations (1 = sequential)")
  @widget(new SliderWidget(1, 3, 1))
  public maxConcurrentImages: number = 1

  @input
  @hint("Maximum concurrent model generations (1 = sequential)")
  @widget(new SliderWidget(1, 2, 1))
  public maxConcurrentModels: number = 1
  private queue: GenerationQueue


  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("GenerationQueueInitializer", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private initialize(): void {
    if (this.enableQueueSystem) {
      this.initializeQueue()
    } else {
      this.logger.info("Queue system disabled by configuration")
    }
  }

  private initializeQueue(): void {
    // Get singleton instance
    this.queue = GenerationQueue.getInstance()

    // Configure concurrency limits
    this.queue.setConcurrencyLimits(this.maxConcurrentImages, this.maxConcurrentModels)

    let setupCount = 0

    // Set up image generator
    if (this.imageGenFactory) {
      this.queue.setImageGenerator(async (prompt: string) => {
        return await this.imageGenFactory.generateImage(prompt)
      })

      setupCount++

      this.logger.info("Image generator connected to queue")
    } else {
      this.logger.info("No ImageGen factory assigned")
    }

    // Set up model generator
    if (this.modelGenFactory) {
      this.queue.setModelGenerator(async (prompt: string, position?: vec3) => {
        return await this.modelGenFactory.generateModel(prompt, position)
      })

      setupCount++

      this.logger.info("Model generator connected to queue")
    } else {
      this.logger.info("No ModelGen factory assigned")
    }

    
    this.logger.info(`Queue system initialized with ${setupCount} generators`)
    this.logger.info(
      `GenerationQueueInitializer: Concurrency limits - Images: ${this.maxConcurrentImages}, Models: ${this.maxConcurrentModels}`
    )
  
  }

  /**
   * Enable or disable the queue system at runtime
   */
  public setQueueEnabled(enabled: boolean): void {
    this.enableQueueSystem = enabled

    if (enabled && !this.queue) {
      this.initializeQueue()
    }

          this.logger.info(`Queue system ${enabled ? "enabled" : "disabled"}`)
  }

  /**
   * Update concurrency limits at runtime
   */
  public updateConcurrencyLimits(imageLimit: number, modelLimit: number): void {
    if (this.queue) {
      this.maxConcurrentImages = imageLimit
      this.maxConcurrentModels = modelLimit
      this.queue.setConcurrencyLimits(imageLimit, modelLimit)

      this.logger.info(`Updated concurrency limits - Images: ${imageLimit}, Models: ${modelLimit}`)
    }
  }

  /**
   * Get current queue status
   */
  public getQueueStatus(): any {
    if (this.queue) {
      return this.queue.getQueueStatus()
    }
    return null
  }
}
