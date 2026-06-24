/**
 * Specs Inc. 2026
 * Snap3 DInteractable component for the BLE Playground Spectacles lens.
 */
import {setTimeout} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils"

@component
export class Snap3DInteractable extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Snap3DInteractable – generative 3D object display card</span><br/><span style="color: #94A3B8; font-size: 11px;">Shows spinner, preview image and final mesh as a Snap3D generation progresses.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Parent scene object where generated model nodes are parented")
  private modelParent: SceneObject

  @input
  @hint("Image component used to display the generated preview texture")
  private img: Image

  @input
  @hint("Text component showing the submitted generation prompt")
  private promptDisplay: Text

  @input
  @hint("Spinner scene object shown while generation is in progress")
  private spinner: SceneObject

  @input
  @hint("Material applied to the instantiated GLTF model")
  private mat: Material

  @input
  @hint("Display plate scene object used for layout positioning")
  private displayPlate: SceneObject

  @input
  @hint("Collider scene object scaled to match the generated object size")
  private colliderObj: SceneObject

  private tempModel: SceneObject = null
  private finalModel: SceneObject = null
  private size: number = 20
  private sizeVec: vec3 = null

  onAwake() {
    // Clone the image material to avoid modifying the original
    const imgMaterial = this.img.mainMaterial
    imgMaterial.mainPass.baseTex = this.img.mainPass.baseTex
    this.img.enabled = false

    const offsetBelow = 0
    this.sizeVec = vec3.one().uniformScale(this.size)
    this.displayPlate.getTransform().setLocalPosition(new vec3(0, -this.size * 0.5 - offsetBelow, 0))
    this.colliderObj.getTransform().setLocalScale(this.sizeVec)
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
      this.spinner.enabled = false
      this.finalModel = model.tryInstantiate(this.modelParent, this.mat)
      this.finalModel.getTransform().setLocalScale(this.sizeVec)
    } else {
      this.tempModel = model.tryInstantiate(this.modelParent, this.mat)
      this.tempModel.getTransform().setLocalScale(this.sizeVec)
    }
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
