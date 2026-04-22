/**
 * Specs Inc. 2026
 * Test Concurrent Generation component for the Agentic Playground Spectacles lens.
 */
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {ImageGen} from "../Core/ImageGen"
import {ModelGen} from "../Core/ModelGen"

/**
 * TestConcurrentGeneration - Test component to verify concurrent media generation
 *
 * This component tests that multiple images and 3D models can be generated
 * simultaneously after removing the blocking behavior from factories.
 */
@component
export class TestConcurrentGeneration extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">TestConcurrentGeneration</span>')
  @ui.separator

  @input
  @hint("Reference to ImageGen factory")
  imageGenFactory: ImageGen

  @input
  @hint("Reference to ModelGen factory")
  modelGenFactory: ModelGen

  @input
  @hint("Number of concurrent image generations to test")
  @widget(new SliderWidget(1, 5, 1))
  concurrentImages: number = 3

  @input
  @hint("Number of concurrent model generations to test")
  @widget(new SliderWidget(1, 3, 1))
  concurrentModels: number = 2

  @input
  @hint("Start test on awake")
  startOnAwake: boolean = true

  private testResults: Map<string, {startTime: number; endTime?: number; status: string}> = new Map()


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
    this.logger = new Logger("TestConcurrentGeneration", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  /**
   * Run concurrent generation test
   */
  public async runConcurrentTest(): Promise<void> {
    this.logger.info("Starting concurrent generation test")
    this.logger.info(`  - Testing ${this.concurrentImages} concurrent images`)
    this.logger.info(`  - Testing ${this.concurrentModels} concurrent 3D models`)

    const startTime = Date.now()
    const promises: Promise<any>[] = []

    // Start concurrent image generations
    for (let i = 0; i < this.concurrentImages; i++) {
      const requestId = `image_${i}`
      const prompt = `Test image ${i + 1}: A beautiful landscape with unique elements`

      this.testResults.set(requestId, {
        startTime: Date.now(),
        status: "started"
      })

      const promise = this.imageGenFactory
        .generateImage(prompt)
        .then((texture) => {
          const result = this.testResults.get(requestId)
          if (result) {
            result.endTime = Date.now()
            result.status = "completed"
            const duration = result.endTime - result.startTime
            this.logger.info(`Image ${i} completed in ${duration}ms`)
          }
          return texture
        })
        .catch((error) => {
          const result = this.testResults.get(requestId)
          if (result) {
            result.endTime = Date.now()
            result.status = "failed"
            this.logger.error(`Image ${i} failed: ${error}`)
          }
        })

      promises.push(promise)
    }

    // Start concurrent model generations
    for (let i = 0; i < this.concurrentModels; i++) {
      const requestId = `model_${i}`
      const prompt = `Test model ${i + 1}: A detailed 3D object with unique features`

      this.testResults.set(requestId, {
        startTime: Date.now(),
        status: "started"
      })

      const promise = this.modelGenFactory
        .generateModel(prompt)
        .then((result) => {
          const testResult = this.testResults.get(requestId)
          if (testResult) {
            testResult.endTime = Date.now()
            testResult.status = "completed"
            const duration = testResult.endTime - testResult.startTime
            this.logger.info(`Model ${i} completed in ${duration}ms`)
          }
          return result
        })
        .catch((error) => {
          const testResult = this.testResults.get(requestId)
          if (testResult) {
            testResult.endTime = Date.now()
            testResult.status = "failed"
            this.logger.error(`Model ${i} failed: ${error}`)
          }
        })

      promises.push(promise)
    }

    // Wait for all generations to complete
    try {
      await Promise.all(promises)
      const totalDuration = Date.now() - startTime

      this.logger.info("🎉 All generations completed!")
      this.logger.info(`  - Total time: ${totalDuration}ms`)

      // Analyze concurrency
      this.analyzeConcurrency()
    } catch (error) {
      this.logger.error(`Test failed with error: ${error}`)
    }
  }

  /**
   * Analyze if generations ran concurrently
   */
  private analyzeConcurrency(): void {
    this.logger.info("\nTestConcurrentGeneration: Concurrency Analysis:")

    // Check for overlapping generation times
    const results = Array.from(this.testResults.entries())
    let overlappingGenerations = 0

    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const [id1, result1] = results[i]
        const [id2, result2] = results[j]

        if (result1.endTime && result2.endTime) {
          // Check if generations overlapped in time
          const overlap =
            (result1.startTime <= result2.startTime && result2.startTime <= result1.endTime) ||
            (result2.startTime <= result1.startTime && result1.startTime <= result2.endTime)

          if (overlap) {
            overlappingGenerations++
            this.logger.info(`  - ${id1} and ${id2} ran concurrently`)
          }
        }
      }
    }

    if (overlappingGenerations > 0) {
      this.logger.info(`\nTestConcurrentGeneration: CONCURRENT GENERATION CONFIRMED`)
      this.logger.info(`  - Found ${overlappingGenerations} overlapping generation pairs`)
    } else {
      this.logger.info(`\nTestConcurrentGeneration: No concurrent generations detected`)
      this.logger.info(`  - Generations may have run sequentially`)
    }
  }

  /**
   * Get test results
   */
  public getTestResults(): Map<string, any> {
    return this.testResults
  }
}
