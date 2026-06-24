/**
 * Specs Inc. 2026
 * Snap3 DInteractable Factory component for the BLE Playground Spectacles lens.
 */
import {Snap3D} from "RemoteServiceGateway.lspkg/HostedSnap/Snap3D"
import {Snap3DTypes} from "RemoteServiceGateway.lspkg/HostedSnap/Snap3DTypes"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {Snap3DInteractable} from "./Snap3DInteractable"

@component
export class Snap3DInteractableFactory extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Snap3DInteractableFactory – Snap3D generation factory</span><br/><span style="color: #94A3B8; font-size: 11px;">Submits a Snap3D generation job and instantiates a Snap3DInteractable to show progress and the final mesh.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Generation Settings</span>')
  @ui.separator
  @ui.group_start("Submit and Get Status Example")
  @input
  @widget(new TextAreaWidget())
  @hint("Default prompt used when runOnTap is enabled for editor testing")
  private prompt: string = "A cute dog wearing a hat"

  @input
  @hint("Enable mesh refinement pass for higher quality output")
  private refineMesh: boolean = true

  @input
  @hint("Use vertex color instead of texture for the generated mesh")
  private useVertexColor: boolean = false
  @ui.group_end

  @input
  @hint("Enable tap-to-generate for quick editor testing without voice input")
  runOnTap: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Prefab instantiated to display generation progress and the final 3D object")
  snap3DInteractablePrefab: ObjectPrefab

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private avaliableToRequest: boolean = true
  private wcfmp = WorldCameraFinderProvider.getInstance()

  onAwake() {
    this.logger = new Logger("Snap3DInteractableFactory", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.createEvent("TapEvent").bind(() => {
      if (!this.runOnTap) {
        return
      }
      this.createInteractable3DObject(this.prompt)
    })
  }

  createInteractable3DObject(input: string, overridePosition?: vec3): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.avaliableToRequest) {
        this.logger.warn("Already processing a request. Please wait.")
        return
      }
      this.avaliableToRequest = false
      const outputObj = this.snap3DInteractablePrefab.instantiate(this.sceneObject)
      outputObj.name = "Snap3DInteractable - " + input
      const snap3DInteractable = outputObj.getComponent(Snap3DInteractable.getTypeName())
      snap3DInteractable.setPrompt(input)

      if (overridePosition) {
        outputObj.getTransform().setWorldPosition(overridePosition)
      } else {
        const newPos = this.wcfmp.getForwardPosition(80)
        outputObj.getTransform().setWorldPosition(newPos)
      }

      Snap3D.submitAndGetStatus({
        prompt: input,
        format: "glb",
        refine: this.refineMesh,
        use_vertex_color: this.useVertexColor
      })
        .then((submitGetStatusResults) => {
          submitGetStatusResults.event.add(([value, assetOrError]) => {
            if (value === "image") {
              assetOrError = assetOrError as Snap3DTypes.TextureAssetData
              snap3DInteractable.setImage(assetOrError.texture)
            } else if (value === "base_mesh") {
              assetOrError = assetOrError as Snap3DTypes.GltfAssetData
              if (!this.refineMesh) {
                snap3DInteractable.setModel(assetOrError.gltfAsset, true)
                this.avaliableToRequest = true
                resolve("Successfully created mesh with prompt: " + input)
              } else {
                snap3DInteractable.setModel(assetOrError.gltfAsset, false)
              }
            } else if (value === "refined_mesh") {
              assetOrError = assetOrError as Snap3DTypes.GltfAssetData
              snap3DInteractable.setModel(assetOrError.gltfAsset, true)
              this.avaliableToRequest = true
              resolve("Successfully created mesh with prompt: " + input)
            } else if (value === "failed") {
              assetOrError = assetOrError as Snap3DTypes.ErrorData
              this.logger.error("generation failed: " + assetOrError.errorMsg)
              this.avaliableToRequest = true
              reject("Failed to create mesh with prompt: " + input)
            }
          })
        })
        .catch((error) => {
          snap3DInteractable.onFailure(error)
          this.logger.error("Error submitting task or getting status: " + error)
          this.avaliableToRequest = true
          reject("Failed to create mesh with prompt: " + input)
        })
    })
  }

  private onTap() {}
}
