/**
 * Specs Inc. 2026
 * Loading component for the BLE Playground Spectacles lens.
 */
import {bindUpdateEvent} from "SnapDecorators.lspkg/decorators"

@component
export class Loading extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Loading – animated loading indicator</span><br/><span style="color: #94A3B8; font-size: 11px;">Spins a loading icon while active and exposes an activation method for the owning controller.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Root scene object that contains the loading icon and any associated UI elements")
  loadingUI: SceneObject

  @input
  @hint("Screen transform of the loading icon that will be rotated each frame")
  loadingIconTransform: ScreenTransform

  private isLoading: boolean = false
  private loadingAngle: number = 0

  onAwake() {
    this.loadingUI.enabled = false
  }

  @bindUpdateEvent
  private onUpdate() {
    if (!this.isLoading) {
      return
    }
    this.loadingAngle += 0.1
    this.loadingIconTransform.rotation = quat.angleAxis(this.loadingAngle, vec3.forward())
  }

  activateLoder(active: boolean) {
    this.loadingUI.enabled = active
    this.isLoading = active
  }
}
