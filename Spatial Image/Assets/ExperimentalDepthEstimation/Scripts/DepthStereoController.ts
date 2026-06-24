/**
 * Specs Inc. 2026
 * DepthStereoController – controls stereo rendering material using depth from MLDepthEstimator.
 *
 * Manages shader parameters for depth-displaced stereo rendering.
 * Connects the depth texture and color texture to the material.
 */
import {MLDepthEstimator} from "./MLDepthEstimator"
import {waitForTextureReady} from "./TextureUtils"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent, bindUpdateEvent} from "SnapDecorators.lspkg/decorators"

@component
export class DepthStereoController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Depth Stereo Controller – depth-displaced stereo rendering</span><br/><span style="color: #94A3B8; font-size: 11px;">Connects depth and color textures to the stereo material and manages shader parameters.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("The stereo rendering material to control")
  material: Material

  @input
  @hint("Reference to the MLDepthEstimator component")
  depthEstimator: MLDepthEstimator

  @input
  @hint("The color/video texture to display")
  colorTexture: Texture

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Stereo Settings</span>')
  @input
  @hint("Depth intensity (0.01–0.05 typical). Higher = more pronounced 3D.")
  @widget(new SliderWidget(0, 0.1, 0.005))
  offsetStrength: number = 0.03

  @input
  @hint("Depth value (0–1) at lens surface. 0.5 = mid-range.")
  @widget(new SliderWidget(0, 1, 0.05))
  convergence: number = 0.5

  @input
  @hint("Vertex displacement intensity. ~70% of 3D effect. Increase for stronger geometry parallax.")
  @widget(new SliderWidget(0, 2, 0.1))
  meshDepthScale: number = 0.5

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private stereoMaterial: Material
  private isInitialized: boolean = false
  private aspectRatio: number = 1.0
  private aspectScaleRetries: number = 0

  /** Get the active material instance. */
  getMaterial(): Material | null {
    return this.stereoMaterial
  }

  /** Check if controller is ready. */
  get isReady(): boolean {
    return this.isInitialized
  }

  onAwake(): void {
    this.logger = new Logger("DepthStereoController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.prepareColorTexture(() => this.initialize())
  }

  private prepareColorTexture(onReady: () => void): void {
    if (!this.colorTexture) {
      this.logger.error("No color texture assigned")
      return
    }
    waitForTextureReady(
      this.colorTexture,
      onReady,
      () => this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent,
      (msg) => this.logger.debug(msg)
    )
  }

  private initialize(): void {
    this.logger.info("Initializing stereo controller...")

    if (!this.material) {
      this.logger.error("No material assigned")
      return
    }

    const renderMesh = this.sceneObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (!renderMesh) {
      this.logger.error("No RenderMeshVisual component found on this SceneObject")
      return
    }

    const w = this.colorTexture.getWidth()
    const h = this.colorTexture.getHeight()
    if (w <= 0 || h <= 0) {
      this.logger.debug("Color texture has invalid dimensions, deferring init")
      const retryEvent = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
      retryEvent.bind(() => this.initialize())
      retryEvent.reset(0.1)
      return
    }

    this.logger.debug(`Color texture: ${w}x${h}`)

    // Clone the material for this instance
    this.stereoMaterial = this.material.clone()
    renderMesh.mainMaterial = this.stereoMaterial

    this.aspectRatio = w / h
    this.logger.debug(`Aspect ratio: ${this.aspectRatio.toFixed(3)}`)
    this.applyAspectScale()

    // Set all material properties
    this.setMaterialProperties()

    // Set blend mode
    this.stereoMaterial.mainPass.blendMode = BlendMode.Normal

    // Connect color texture
    this.stereoMaterial.mainPass.baseTex = this.colorTexture
    this.logger.debug("Color texture assigned to baseTex")

    // Wait for depth estimator to be ready, then connect depth texture
    if (this.depthEstimator) {
      this.waitForDepthEstimator()
    } else {
      this.logger.warn("No depth estimator assigned — stereo effect will not work")
      this.isInitialized = true
    }
  }

  private waitForDepthEstimator(): void {
    const retryEvent = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    const checkReady = () => {
      if (this.depthEstimator.isReady && this.depthEstimator.depthTexture) {
        this.connectDepthTexture()
        this.isInitialized = true
        // Start per-frame depth param sync
        this.createEvent("UpdateEvent").bind(() => this.updateDepthParams())
        this.logger.info("Stereo controller initialized")
      } else {
        this.logger.debug("Depth estimator not ready, retrying in 0.1s")
        retryEvent.reset(0.1)
      }
    }
    retryEvent.bind(checkReady)
    checkReady()
  }

  private connectDepthTexture(): void {
    const depthTex = this.depthEstimator.depthTexture
    if (!depthTex) {
      this.logger.error("Depth texture not available")
      return
    }

    try {
      this.stereoMaterial.mainPass.depthTex = depthTex
      this.logger.debug(`Depth texture connected: ${depthTex.getWidth()}x${depthTex.getHeight()}`)
    } catch (e) {
      this.logger.warn(`Could not set depthTex property — shader may need modification: ${e}`)
    }
  }

  private applyAspectScale(): void {
    if (this.aspectRatio > 0.01 && isFinite(this.aspectRatio)) {
      const t = this.sceneObject.getTransform()
      const scale = t.getLocalScale()
      const baseX = scale.x > 0.01 ? scale.x : scale.y
      const newX = baseX * this.aspectRatio
      t.setLocalScale(new vec3(newX, scale.y, scale.z))
      this.logger.debug(`Aspect scale: ${scale.x.toFixed(1)}→${newX.toFixed(1)}`)
    } else if (this.aspectScaleRetries < 50) {
      this.aspectScaleRetries++
      const retryEvent = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
      retryEvent.bind(() => {
        const w = this.colorTexture.getWidth()
        const h = this.colorTexture.getHeight()
        if (w > 0 && h > 0) this.aspectRatio = w / h
        this.applyAspectScale()
      })
      retryEvent.reset(0.1)
    }
  }

  private setMaterialProperties(): void {
    if (!this.stereoMaterial) return
    this.stereoMaterial.mainPass.offsetStrength = this.offsetStrength
    this.stereoMaterial.mainPass.convergence = this.convergence
    this.stereoMaterial.mainPass.meshDepthScale = this.meshDepthScale
    this.updateDepthParams()
  }

  private updateDepthParams(): void {
    if (!this.stereoMaterial || !this.depthEstimator) return
    const pass = this.stereoMaterial.mainPass
    pass.depthMin = this.depthEstimator.depthMin
    pass.depthMax = this.depthEstimator.depthMax
    pass.invertDepth = this.depthEstimator.invertDepth ? 1 : 0
    pass.depthFlipX = this.depthEstimator.flipX ? 1 : 0
    pass.depthFlipY = this.depthEstimator.flipY ? 1 : 0
  }
}
