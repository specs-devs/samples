/**
 * Specs Inc. 2026
 * Snap3 DObject component for the AI Music Gen Spectacles lens.
 */
import {setTimeout} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class Snap3DObject extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Snap3D Object – 3D model and preview image display</span><br/><span style="color: #94A3B8; font-size: 11px;">Shows a preview image while generating, then transitions to the base and refined 3D mesh.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Scene References</span>')
  @input
  @hint("Parent SceneObject under which instantiated 3D models are placed")
  private modelParent: SceneObject

  @input
  @hint("Image component used to display the preview texture before the model is ready")
  private img: Image

  @input
  @hint("Text component that shows the current prompt or status message")
  private promptDisplay: Text

  @input
  @hint("SceneObject for the loading spinner shown during generation")
  private spinner: SceneObject

  @input
  @hint("Material applied to instantiated 3D models")
  private mat: Material

  @input
  @hint("SceneObject containing the display plate positioned below the model")
  private displayPlate: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private tempModel: SceneObject = null
  private finalModel: SceneObject = null
  private size: number = 20
  private sizeVec: vec3 = null

  onAwake() {
    this.logger = new Logger("Snap3DObject", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    // Clone the image material to avoid modifying the original
    const imgMaterial = this.img.mainMaterial.clone()
    this.img.clearMaterials()
    this.img.mainMaterial = imgMaterial
    imgMaterial.mainPass.baseTex = this.img.mainPass.baseTex
    this.img.enabled = false

    const offsetBelow = 0
    this.sizeVec = vec3.one().uniformScale(this.size)
    this.displayPlate.getTransform().setLocalPosition(new vec3(0, -this.size * 0.5 - offsetBelow, 0))
    this.img.getTransform().setLocalScale(this.sizeVec)
  }

  setPrompt(prompt: string) {
    this.promptDisplay.text = prompt
  }

  setImage(image: Texture) {
    this.img.enabled = true
    this.img.mainPass.baseTex = image
  }

  setModel(model: GltfAsset, isFinal: boolean) {
    this.img.enabled = false
    if (isFinal) {
      if (!isNull(this.finalModel)) {
        this.finalModel.destroy()
      }
      this.finalModel = model.tryInstantiate(this.modelParent, this.mat)
      this.finalModel.getTransform().setLocalScale(this.sizeVec)
    } else {
      this.tempModel = model.tryInstantiate(this.modelParent, this.mat)
      this.tempModel.getTransform().setLocalScale(this.sizeVec)
    }
  }

  setSpinnerEnabled(enabled: boolean) {
    this.spinner.enabled = enabled
  }

  onFailure(error: string) {
    this.img.enabled = false
    this.spinner.enabled = false
    if (this.tempModel) {
      this.tempModel.destroy()
    }
    if (this.finalModel) {
      this.finalModel.destroy()
    }
    this.promptDisplay.text = "Error: " + error
    setTimeout(() => {
      this.destroy()
    }, 5000) // Hide error after 5 seconds
  }
}
