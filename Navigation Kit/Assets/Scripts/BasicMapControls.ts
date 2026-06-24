import {BaseButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/BaseButton"
import {MapComponent} from "MapComponentModified/Scripts/MapComponent"

/**
 * A simplified script that adds {@link BaseButton} controls to the {@link MapComponent}.
 */
@component
export class BasicMapControls extends BaseScriptComponent {
  @input
  private zoomInButton: BaseButton
  @input
  private zoomOutButton: BaseButton
  @input
  private centerMapButton: BaseButton
  @input
  private mapComponent: MapComponent

  private onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.zoomInButton.onTriggerUp.add(() => {
        this.mapComponent.zoomIn()
      })
      this.zoomOutButton.onTriggerUp.add(() => {
        this.mapComponent.zoomOut()
      })
      this.centerMapButton.onTriggerUp.add(() => {
        this.mapComponent.centerMap()
      })
    })
  }
}
