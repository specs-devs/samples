import {LensConfig} from "InteractionKit.lspkg/Utils/LensConfig"
import {UpdateDispatcher} from "InteractionKit.lspkg/Utils/UpdateDispatcher"

/**
 * Used to disable content once the user has gone a certain distance from it.
 */
@component
export class DisableOnUserDistance extends BaseScriptComponent {
  private updateDispatcher: UpdateDispatcher = LensConfig.getInstance().updateDispatcher

  @input private userCamera: SceneObject
  @input
  @hint("Distance in centimeters")
  private disableDistance = 1000
  @input private target: SceneObject

  private onAwake(): void {
    this.updateDispatcher.createUpdateEvent("UpdateEvent").bind(() => {
      const position = this.target.getTransform().getWorldPosition()
      const userPosition = this.userCamera.getTransform().getWorldPosition()
      const distance = position.distance(userPosition)
      this.target.enabled = distance < this.disableDistance
    })
  }
}
