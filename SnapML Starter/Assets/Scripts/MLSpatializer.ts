/**
 * Specs Inc. 2026
 * MLSpatializer component for the SnapML Starter Spectacles lens.
 */
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {Detection} from "./DetectionHelpers"
import {YOLODetectionProcessor} from "./YOLODetectionProcessor"

class EventWrapper {
  private _callbacks: ((...args: any[]) => void)[] = []
  add(callback: (...args: any[]) => void) {
    this._callbacks.push(callback)
    return callback
  }
  remove(callback: (...args: any[]) => void) {
    const ind = this._callbacks.indexOf(callback)
    if (ind > -1) this._callbacks.splice(ind, 1)
  }
  trigger(...args: any[]) {
    for (const cb of this._callbacks) cb(...args)
  }
}

/**
 * Main entry point for ML-based object detection processing
 * Handles YOLO model inference and detection parsing only
 * Use WorldQueryModuleSpatializer for 3D spatialization
 */
@component
export class MLSpatializer extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">MLSpatializer – YOLO ML inference driver</span><br/><span style="color: #94A3B8; font-size: 11px;">Runs a YOLOv7 ONNX model on the camera input and emits 2D detection results each frame.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">ML Model</span>')
  @input
  @hint("ONNX model asset")
  model: MLAsset

  @input
  @hint("Input texture for the model (Device Camera Texture)")
  inputTexture: Texture

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Detection Settings</span>')
  @input
  @hint("Maximum number of objects to detect and place")
  @widget(new SliderWidget(1, 20, 1))
  maxDetectionCount: number = 5

  @input
  @hint("Time in seconds to keep detections after they disappear")
  @widget(new SliderWidget(0, 5, 0.1))
  detectionPersistence: number = 0.5

  @input
  @hint("Score threshold for detections (0-1) - Lower values make it more sensitive to detections")
  @widget(new SliderWidget(0, 1, 0.01))
  scoreThreshold: number = 0.2

  @input
  @hint(
    "IOU threshold for non-maximum suppression (0-1) - Higher threshold allows more overlapping boxes; lower removes more"
  )
  @widget(new SliderWidget(0, 1, 0.01))
  iouThreshold: number = 0.5

  @input
  @hint("Center threshold (0-1) - Higher values exclude more detections from edges")
  @widget(new SliderWidget(0, 1, 0.01))
  centerThreshold: number = 0.5

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Class Configuration</span>')
  @input
  @hint("Class labels matching the model output order")
  classLabels: string[] = ["Chair", "Table", "Sofa"]

  @input
  @hint("Enable all classes by default")
  enableAllClasses: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Callbacks</span>')
  @input
  @hint("Enable callbacks for detection updates")
  enableCallbacks: boolean = false

  @input
  @hint("Callbacks for monitor detection state changes")
  public monitorDetectionCallbacks: any[] = []

  @input
  @hint("Function names to call on the callback objects when a monitor is detected")
  public monitorDetectedFunctions: string[] = []

  @input
  @hint("Function names to call on the callback objects when a monitor is lost")
  public monitorLostFunctions: string[] = []

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Debug</span>')
  @input
  @hint("Log verbose detection results to console and log text")
  debugLogging: boolean = false

  @input
  @hint("Text component to display status messages")
  logText: Text

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private detectionTimestamps: number[] = []
  private mlComponent: MLComponent
  private outputs: OutputPlaceholder[]
  private inputs: InputPlaceholder[]
  private onDetectionsUpdated = new EventWrapper()
  private isInitialized: boolean = false
  private initAttempts: number = 0
  private maxInitAttempts: number = 5
  private delayedInitEvent: DelayedCallbackEvent
  private isRunning: boolean = false

  private yoloProcessor: YOLODetectionProcessor

  private lastMonitorDetectionState: boolean = false

  onAwake(): void {
    this.logger = new Logger("MLSpatializer", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.logMessage("MLSpatializer initializing...")

    this.delayedInitEvent = this.createEvent("DelayedCallbackEvent")
    this.delayedInitEvent.bind(() => this.delayedInitialize())
  }

  @bindStartEvent
  private onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.delayedInitEvent.reset(1.0)
  }

  /**
   * Attempt initialization with a delay and retries
   */
  private delayedInitialize(): void {
    this.initAttempts++

    if (this.initAttempts < this.maxInitAttempts) {
      this.logMessage(`Starting initialization attempt ${this.initAttempts}/${this.maxInitAttempts}...`)
      this.initialize()
    } else {
      this.logMessage(`Failed to initialize after ${this.maxInitAttempts} attempts`)
      this.logger.error(`Failed to initialize after ${this.maxInitAttempts} attempts`)
    }
  }

  /**
   * Initialize the component
   */
  private initialize(): void {
    this.logMessage("Starting MLSpatializer initialization...")
    this.continueInitialization()
  }

  /**
   * Continue initialization
   */
  private continueInitialization(): void {
    try {
      this.yoloProcessor = new YOLODetectionProcessor(
        this.classLabels,
        this.scoreThreshold,
        this.iouThreshold,
        this.debugLogging,
        this.logger
      )

      this.initML()

      this.isInitialized = true
      this.logMessage("MLSpatializer ready")
    } catch (e) {
      this.logMessage("Error during initialization: " + e)
      this.logger.error("Error during initialization: " + e)
    }
  }

  /**
   * Create ML component
   */
  private initML(): void {
    if (!this.model) {
      this.logger.error("Please set ML Model asset input")
      return
    }

    this.mlComponent = this.getSceneObject().createComponent("MLComponent")
    this.mlComponent.model = this.model
    this.mlComponent.onLoadingFinished = () => this.onLoadingFinished()
    this.mlComponent.inferenceMode = MachineLearning.InferenceMode.Accelerator
    this.mlComponent.build([])
  }

  public getMLOutputs(): OutputPlaceholder[] {
    return this.outputs
  }

  /**
   * Get the YOLO processor for external use
   */
  public getYOLOProcessor(): YOLODetectionProcessor {
    return this.yoloProcessor
  }

  /**
   * Get the latest detections processed by this spatializer
   */
  public getLatestDetections(): Detection[] {
    if (!this.yoloProcessor || !this.outputs) {
      return []
    }

    try {
      const detections = this.yoloProcessor.parseYolo7Outputs(this.outputs)
      return this.filterDetectionsByCenter(detections)
    } catch (e) {
      if (this.debugLogging) {
        this.logMessage("Error getting latest detections: " + e)
      }
      return []
    }
  }

  /**
   * Get raw unfiltered detections (for debugging purposes)
   */
  public getRawDetections(): Detection[] {
    if (!this.yoloProcessor || !this.outputs) {
      return []
    }

    try {
      return this.yoloProcessor.parseYolo7Outputs(this.outputs)
    } catch (e) {
      if (this.debugLogging) {
        this.logMessage("Error getting raw detections: " + e)
      }
      return []
    }
  }

  /**
   * Configure inputs and outputs, start running ML component
   */
  private onLoadingFinished(): void {
    this.outputs = this.mlComponent.getOutputs()
    this.inputs = this.mlComponent.getInputs()

    this.printInfo("Model built")

    this.yoloProcessor.initialize(this.outputs, this.inputs)

    this.inputs[0].texture = this.inputTexture

    if (this.debugLogging) {
      if (this.inputTexture) {
        this.logMessage(`Assigned input texture: ${this.inputTexture.name || "unnamed"}`)
      } else {
        this.logMessage("Warning: No input texture assigned")
      }
    }

    this.mlComponent.runScheduled(true, MachineLearning.FrameTiming.Update, MachineLearning.FrameTiming.Update)

    // Created dynamically after ML loads — not a top-level lifecycle event
    this.createEvent("UpdateEvent").bind((eventData) => this.onUpdate(eventData))
  }

  /**
   * Process outputs on each update
   */
  private onUpdate(eventData: any): void {
    if (this.isRunning || !this.isInitialized) {
      return
    }

    this.isRunning = true

    try {
      const detections = this.yoloProcessor.parseYolo7Outputs(this.outputs)
      const filteredDetections = this.filterDetectionsByCenter(detections)
      this.onRunningFinished(filteredDetections)
    } catch (e) {
      this.logger.error("Error processing ML output: " + e)
      this.logMessage("Error: ML processing failed: " + e)
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Filter detections based on their distance from center of screen
   */
  private filterDetectionsByCenter(detections: Detection[]): Detection[] {
    if (this.centerThreshold <= 0) {
      return detections
    }

    return detections.filter((detection) => {
      const centerX = detection.bbox[0]
      const centerY = detection.bbox[1]

      const distanceX = Math.abs(centerX - 0.5) * 2
      const distanceY = Math.abs(centerY - 0.5) * 2

      const maxDistance = Math.max(distanceX, distanceY)
      const shouldKeep = maxDistance < this.centerThreshold

      if (this.debugLogging && !shouldKeep) {
        this.logger.debug(
          `Filtered out detection at (${centerX.toFixed(2)}, ${centerY.toFixed(2)}) with distance ${maxDistance.toFixed(2)} > threshold ${this.centerThreshold}`
        )
      }

      return shouldKeep
    })
  }

  /**
   * Process ML results and log detections
   */
  private onRunningFinished(detections: Detection[]): void {
    if (this.debugLogging) {
      if (detections.length === 0) {
        this.logger.debug("[MLSpatializer] No objects detected")

        if (Math.random() < 0.05) {
          this.logMessage("TIP: If you're sure objects should be detected, try these troubleshooting steps:")
          this.logMessage("1. Point camera at clear examples of objects to detect")
          this.logMessage("2. Lower scoreThreshold in inspector (try 0.2 or 0.1)")
          this.logMessage("3. Ensure all classes are enabled")
          this.logMessage("4. Check input texture is correctly assigned")
        }
      } else {
        this.logger.debug(`[MLSpatializer] Detected ${detections.length} objects:`)
        detections.forEach((detection, index) => {
          if (index < 5) {
            this.logger.debug(
              `  - ${detection.label}: ${Math.round(detection.score * 100)}% confidence at [${detection.bbox[0].toFixed(
                2
              )}, ${detection.bbox[1].toFixed(2)}]`
            )
          }
        })
        if (detections.length > 5) {
          this.logger.debug(`  - ... and ${detections.length - 5} more`)
        }

        this.logMessage(
          `Detected ${detections.length} objects. Highest confidence: ${Math.round(
            detections[0].score * 100
          )}% (${detections[0].label})`
        )
      }
    }

    const currentTime = getTime()
    for (let i = 0; i < Math.min(detections.length, this.maxDetectionCount); i++) {
      this.detectionTimestamps[i] = currentTime
    }

    this.onDetectionsUpdated.trigger(detections)

    if (this.enableCallbacks) {
      this.handleMonitorDetectionCallbacks(detections.length > 0)
    }
  }

  /**
   * Handle callbacks for monitor detection state changes
   */
  private handleMonitorDetectionCallbacks(isMonitorDetected: boolean): void {
    if (isMonitorDetected !== this.lastMonitorDetectionState) {
      this.lastMonitorDetectionState = isMonitorDetected

      if (this.debugLogging) {
        this.logMessage(`Monitor detection state changed to: ${isMonitorDetected ? "detected" : "lost"}`)
      }

      for (let i = 0; i < this.monitorDetectionCallbacks.length; i++) {
        try {
          const callback = this.monitorDetectionCallbacks[i]
          const functionName = isMonitorDetected ? this.monitorDetectedFunctions[i] : this.monitorLostFunctions[i]

          if (callback && typeof callback[functionName] === "function") {
            callback[functionName]()
          }
        } catch (e) {
          this.logger.error(`Error calling monitor detection callback: ${e}`)
        }
      }
    }
  }

  /**
   * Print debug info if debugLogging is enabled
   */
  private printInfo(msg: string): void {
    if (this.debugLogging) {
      this.logger.debug(msg)
    }
  }

  /**
   * Update the log text component and route through logger
   */
  private logMessage(message: string): void {
    if (this.logText) {
      this.logText.text = message
    }
    this.logger.info(message)
  }

  /**
   * Public method to get the onDetectionsUpdated event
   */
  public getDetectionsUpdatedEvent(): any {
    return this.onDetectionsUpdated
  }

  onDestroy(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onDestroy()")
    this.detectionTimestamps = []
  }
}
