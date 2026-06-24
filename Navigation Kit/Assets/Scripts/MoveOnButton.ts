import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {NavigationDataComponent} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/NavigationDataComponent"

/**
 * On pressing, a new unvisited location from the {@link NavigationDataComponent} is selected to go to.
 */
@component
export class MoveOnButton extends BaseScriptComponent {
  // PinchButton was removed from SIK 2.0; this object now has a SpectaclesUIKit
  // RectangleButton — grab it and use its onTriggerUp.
  @input private navigation: NavigationDataComponent

  private button: RectangleButton

  private onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.button = this.sceneObject.getComponent(RectangleButton.getTypeName()) as RectangleButton
      this.button.initialize()
      this.button.onTriggerUp.add(() => this.moveOn())
      this.navigation.onAllPlacesVisited.add(() => {
        this.sceneObject.enabled = false
      })
    })
  }

  private moveOn(): void {
    this.sceneObject.enabled = false
    const places = this.navigation.places
    for (let i = 0; i < places.length; i++) {
      const place = places[i]
      if (!place.visited) {
        this.navigation.navigateToPlace(place)
        return
      }
    }
  }
}
