/**
 * Specs Inc. 2026
 * Interactable Image Generator component for the BLE Playground Spectacles lens.
 */
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {ASRQueryController} from "./ASRQueryController"
import {Snap3DInteractableFactory} from "./Snap3DInteractableFactory"

@component
export class InteractableImageGenerator extends BaseScriptComponent {
  @ui.separator
  @ui.label("Example of using generative 3D with Snap3D")

  @ui.label('<span style="color: #60A5FA;">InteractableImageGenerator – voice-to-3D generator</span><br/><span style="color: #94A3B8; font-size: 11px;">Listens for ASR voice queries and spawns a Snap3DInteractable prefab at the target position.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Snap3D factory used to create and position 3D interactable objects from voice prompts")
  snap3DFactory: Snap3DInteractableFactory

  @input
  @hint("ASR query controller that provides the voice query string")
  private asrQueryController: ASRQueryController

  @input
  @hint("Scene object whose world position is used as the spawn target for new 3D objects")
  private targetPosition: SceneObject

  onAwake() {}

  @bindStartEvent
  private onStart() {
    this.asrQueryController.onQueryEvent.add((query) => {
      this.snap3DFactory.createInteractable3DObject(query, this.targetPosition.getTransform().getWorldPosition())
    })
  }
}
