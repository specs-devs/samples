import {BaseButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/BaseButton"
import {LensConfig} from "SpectaclesInteractionKit.lspkg/Utils/LensConfig"
import {UpdateDispatcher} from "SpectaclesInteractionKit.lspkg/Utils/UpdateDispatcher"
import {NavigationDataComponent} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/NavigationDataComponent"
import {CustomLocationPlacesImageDisplay} from "./CustomLocationPlacesImageDisplay"

/**
 * Manages a highlight ring and icon on the map to alert the user to anything that might disrupt their
 * navigation.
 */
@component
export class MinimapHighlightManager extends BaseScriptComponent {
  private defaultColor: vec4

  @input private navigationComponent: NavigationDataComponent
  @input private mapInteractables: BaseButton[]
  @input @allowUndefined private display: Image
  @input private customLocationImage: CustomLocationPlacesImageDisplay
  @input private promptDisplay: Image
  @input
  @allowUndefined
  private audio?: AudioComponent

  @input
  @widget(new ColorWidget())
  private promptColor: vec4
  @input
  @widget(new ColorWidget())
  private localizedColor: vec4

  @input
  private promptTexture: Texture
  @input
  private noInternetTexture: Texture
  @input
  private localizedTexture: Texture

  private isHovered = false
  private isPrompting = false
  private justVisited = 0

  private onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.start())
  }

  private start(): void {
    if (isNull(this.display)) return
    this.defaultColor = this.display.mainPass.baseColor

    this.mapInteractables.forEach((m) => {
      m.onHoverEnter.add(() => {
        this.isHovered = true
        this.updateDisplay()
      })

      m.onHoverExit.add(() => {
        this.isHovered = false
        this.updateDisplay()
      })
    })

    this.customLocationImage.onPromptAvailable.add((place) => {
      this.isPrompting = !isNull(place)
      this.updateDisplay()
    })

    const updateDispatcher: UpdateDispatcher = LensConfig.getInstance().updateDispatcher
    const update = updateDispatcher.createUpdateEvent("UpdateEvent")
    update.bind(() => {
      if (this.justVisited > 0) {
        this.justVisited -= getDeltaTime()
      } else {
        this.updateDisplay()
        update.enabled = false
      }
    })

    this.navigationComponent.onArrivedAtPlace(() => {
      this.justVisited = 5
      update.enabled = true
      this.audio?.play(1)
      this.updateDisplay()
    })

    this.promptDisplay.sceneObject.enabled = false
    this.updateDisplay()
  }

  private updateDisplay(): void {
    this.promptDisplay.sceneObject.enabled = false
    if (this.isHovered) {
      this.display.mainPass.baseColor = this.defaultColor
      this.display.sceneObject.enabled = true
    } else if (!global.deviceInfoSystem.isInternetAvailable()) {
      this.promptDisplay.sceneObject.enabled = true
      this.promptDisplay.mainPass.baseTex = this.noInternetTexture
      this.display.mainPass.baseColor = this.promptColor
      this.display.sceneObject.enabled = true
    } else if (this.justVisited > 0) {
      this.display.mainPass.baseColor = this.localizedColor
      this.promptDisplay.mainPass.baseTex = this.localizedTexture
      this.promptDisplay.sceneObject.enabled = true
      this.display.sceneObject.enabled = true
    } else if (this.isPrompting) {
      this.promptDisplay.sceneObject.enabled = true
      this.promptDisplay.mainPass.baseTex = this.promptTexture
      this.display.mainPass.baseColor = this.promptColor
      this.display.sceneObject.enabled = true
    } else {
      this.display.sceneObject.enabled = false
    }
  }
}
