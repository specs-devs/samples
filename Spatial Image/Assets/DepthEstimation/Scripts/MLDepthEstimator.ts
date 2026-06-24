/**
 * Specs Inc. 2026
 * MLDepthEstimator – runs depth estimation on video frames using a FastDepth ONNX model.
 *
 * Outputs a grayscale depth texture where brightness represents distance.
 * Assign a Screen Crop Texture to outputTexture to wire the result to materials.
 *
 * PIPELINE (per-frame):
 *   Input Texture → ML inference (FastDepth ONNX) → min/max compute →
 *   R32Float procedural texture → Screen Crop output → DepthStereoController shader
 */
import {getVideoTextureProvider, waitForTextureReady} from "./TextureUtils"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"

@component
export class MLDepthEstimator extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ML Depth Estimator – FastDepth ONNX inference driver</span><br/><span style="color: #94A3B8; font-size: 11px;">Runs per-frame depth estimation and outputs a grayscale depth texture for stereo rendering.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Model</span>')
  @input
  @hint("FastDepth ONNX model asset")
  model: MLAsset

  @input
  @hint("Video or camera texture input")
  inputTexture: Texture

  @input
  @hint("Screen Crop Texture to receive depth output")
  outputTexture: Texture

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Depth Output</span>')
  @input
  @hint("Invert depth (near=white, far=black)")
  invertDepth: boolean = false

  @input
  @hint("Flip output horizontally")
  flipX: boolean = false

  @input
  @hint("Flip output vertically")
  flipY: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Normalization</span>')
  @input
  @hint("On: per-frame min/max (better contrast, ~21ms CPU). Off: fixed range (faster).")
  normalizeDepth: boolean = true

  @input
  @hint("Minimum depth when Adaptive is off")
  @showIf("normalizeDepth", false)
  minDepthValue: number = 0

  @input
  @hint("Maximum depth when Adaptive is off")
  @showIf("normalizeDepth", false)
  maxDepthValue: number = 2.5

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  @input
  @hint("Log per-frame timing for inference and post-processing")
  enableTimingLogging: boolean = false

  private logger: Logger
  private mlComponent: MLComponent
  private outputs: OutputPlaceholder[]
  private inputs: InputPlaceholder[]
  private isInitialized: boolean = false
  private isRunning: boolean = false
  private lastFrameTime: number = -1
  private outputConfigured: boolean = false
  private depthProceduralTexture: Texture = null
  private readonly depthWidth: number = 512
  private readonly depthHeight: number = 512

  /** Min/max depth for shader normalization (updated each frame). */
  public depthMin: number = 0
  public depthMax: number = 1

  /** Last ML inference duration in milliseconds. */
  public lastInferenceTimeMs: number = 0

  /** Last full onUpdate loop duration in milliseconds. */
  public lastLoopTimeMs: number = 0

  /** Last post-process duration in milliseconds. */
  public lastPostProcessTimeMs: number = 0

  /** The depth texture output. */
  public get depthTexture(): Texture | null {
    return this.depthProceduralTexture || (this.outputConfigured ? this.outputTexture : null)
  }

  /** Whether the estimator is ready. */
  public get isReady(): boolean {
    return this.isInitialized && this.outputs !== null
  }

  /** Raw depth data as Float32Array for point queries. */
  public getDepthData(): Float32Array | null {
    if (this.outputs?.[0]?.mode === MachineLearning.OutputMode.Data) {
      return this.outputs[0].data
    }
    return null
  }

  /** Trigger a single inference run. */
  public runOnce(): void {
    if (this.mlComponent && this.isInitialized) {
      this.mlComponent.runImmediate(true)
    }
  }

  /** Stop scheduled inference. */
  public stop(): void {
    if (this.mlComponent) {
      this.mlComponent.stop()
    }
  }

  onAwake(): void {
    this.logger = new Logger("MLDepthEstimator", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.prepareInputTexture(() => this.initialize())
  }

  onDestroy(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onDestroy()")
    this.stop()
  }

  private prepareInputTexture(onReady: () => void): void {
    waitForTextureReady(
      this.inputTexture,
      onReady,
      () => this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent,
      (msg) => this.logger.debug(msg)
    )
  }

  private initialize(): void {
    if (!this.model) {
      this.logger.error("No model assigned")
      return
    }
    if (!this.inputTexture) {
      this.logger.error("No input texture assigned")
      return
    }

    this.logger.info("Initializing ML component...")
    this.mlComponent = this.getSceneObject().createComponent("MLComponent")
    this.mlComponent.model = this.model
    this.mlComponent.inferenceMode = MachineLearning.InferenceMode.Accelerator
    this.mlComponent.onLoadingFinished = () => this.onModelLoaded()
    this.mlComponent.build([])
  }

  private onModelLoaded(): void {
    this.outputs = this.mlComponent.getOutputs()
    this.inputs = this.mlComponent.getInputs()

    if (this.inputs.length === 0 || this.outputs.length === 0) {
      this.logger.error("Invalid model inputs/outputs")
      return
    }

    this.inputs[0].texture = this.inputTexture
    this.outputs[0].mode = MachineLearning.OutputMode.Data

    this.depthProceduralTexture = ProceduralTextureProvider.createWithFormat(
      this.depthWidth,
      this.depthHeight,
      TextureFormat.R32Float
    )

    if (this.outputTexture) {
      const control = this.outputTexture.control
      if (control && "inputTexture" in control) {
        ;(control as CropTextureProvider).inputTexture = this.depthProceduralTexture
        this.outputConfigured = true
      }
    }

    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
    this.isInitialized = true
    this.logger.info("Depth inference active")
  }

  private onUpdate(): void {
    if (!this.isInitialized || this.isRunning) return
    if (this.inputTexture.getWidth() <= 0 || this.inputTexture.getHeight() <= 0) return

    this.isRunning = true
    const tLoopStart = getRealTimeNanos()

    try {
      // Skip duplicate frames
      const videoControl = getVideoTextureProvider(this.inputTexture)
      if (videoControl?.lastFrameTime !== undefined) {
        if (videoControl.lastFrameTime === this.lastFrameTime) {
          this.isRunning = false
          if (this.enableTimingLogging) {
            this.lastLoopTimeMs = (getRealTimeNanos() - tLoopStart) / 1e6
            this.logger.debug(`[timing] loop (skipped, same frame): ${this.lastLoopTimeMs.toFixed(2)} ms`)
          }
          return
        }
        this.lastFrameTime = videoControl.lastFrameTime
      }

      // ML inference
      const tInferStart = getRealTimeNanos()
      this.mlComponent.runImmediate(true)
      this.lastInferenceTimeMs = (getRealTimeNanos() - tInferStart) / 1e6
      if (this.enableTimingLogging) {
        this.logger.debug(`[timing] inference: ${this.lastInferenceTimeMs.toFixed(2)} ms`)
      }

      const data = this.outputs?.[0]?.data
      if (!data || data.length === 0) {
        this.finishLoopTiming(tLoopStart, 0)
        return
      }

      const tPostStart = getRealTimeNanos()

      // Compute min/max for shader normalization (sampled at stride 8 for speed)
      let minVal = this.minDepthValue
      let maxVal = this.maxDepthValue
      if (this.normalizeDepth) {
        const stride = 8
        minVal = data[0]
        maxVal = data[0]
        for (let i = stride; i < data.length; i += stride) {
          const v = data[i]
          if (v < minVal) minVal = v
          if (v > maxVal) maxVal = v
        }
        this.logger.debug(`[depth] min: ${minVal.toFixed(2)}, max: ${maxVal.toFixed(2)}`)
      }
      this.depthMin = minVal
      this.depthMax = maxVal

      // Write depth to procedural texture
      const texControl = this.depthProceduralTexture.control as ProceduralTextureProvider
      texControl.setPixelsFloat32(0, 0, this.depthWidth, this.depthHeight, data)

      this.lastPostProcessTimeMs = (getRealTimeNanos() - tPostStart) / 1e6
      this.finishLoopTiming(tLoopStart, this.lastPostProcessTimeMs)
    } catch (e) {
      this.logger.error("Inference error: " + e)
      this.finishLoopTiming(tLoopStart, 0)
    } finally {
      this.isRunning = false
    }
  }

  private finishLoopTiming(tLoopStart: number, postProcessMs: number): void {
    this.lastLoopTimeMs = (getRealTimeNanos() - tLoopStart) / 1e6
    if (this.enableTimingLogging) {
      this.logger.debug(
        `[timing] post-process: ${postProcessMs.toFixed(2)} ms | loop: ${this.lastLoopTimeMs.toFixed(2)} ms`
      )
    }
  }
}
