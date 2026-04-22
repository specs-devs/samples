import {BaseButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/BaseButton"
import {Frame} from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame"
import {MapComponent} from "MapComponentModified/Scripts/MapComponent"
import {CancelFunction} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {makeTween} from "MapComponentModified/Scripts/MapUtils"
import {NavigationDataComponent} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/NavigationDataComponent"
import {Place} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/Place"
import {BillboardTS} from "Solvers.lspkg/TS/BillboardTS"
import {TetherTS} from "Solvers.lspkg/TS/TetherTS"
import {CustomLocationPlacesImageDisplay} from "./CustomLocationPlacesImageDisplay"

@component
export class PanelManager extends BaseScriptComponent {
  private scrollRootDefaultPosition: vec3
  private frameDefaultPosition: vec3
  private mainPanelDefaultPosition: vec3

  @input mapComponent: MapComponent
  @input private imageDisplay: CustomLocationPlacesImageDisplay
  @input private navigationDataComponent: NavigationDataComponent

  @allowUndefined @input spawnPinButton: BaseButton
  @allowUndefined @input clearPinsButton: BaseButton
  @allowUndefined @input private centerMapButton: BaseButton
  @allowUndefined @input searchMapButton: BaseButton
  @allowUndefined @input private zoomInButton: BaseButton
  @allowUndefined @input private zoomOutButton: BaseButton
  @allowUndefined @input showRestaurantsButton: BaseButton
  @allowUndefined @input showCafeButton: BaseButton
  @allowUndefined @input showBarButton: BaseButton

  @input private mapRender: SceneObject
  @input private scrollRoot: SceneObject

  @ui.separator
  @ui.label("Navigation Layout")
  @input private frame: Frame
  @input private tether: TetherTS
  @input private billboard: BillboardTS
  @input private mapObject: SceneObject
  @input private mainPanel: SceneObject
  @input private scrollView: SceneObject

  @ui.separator
  @ui.label("Frame Reset on Navigation Exit")
  @input
  @allowUndefined
  @hint("Camera / head SceneObject – frame will be repositioned 100 units in front of it when navigation ends")
  private camera: SceneObject

  @ui.separator
  @ui.label("Frame Inner Size")
  @input private frameInnerSizeDefault: vec2 = new vec2(90, 54)
  @input private frameInnerSizeNavigation: vec2 = new vec2(50, 30)

  @ui.separator
  @ui.label("Map Transform — Default")
  @input private mapLocalPositionDefault: vec3 = vec3.zero()
  @input private mapLocalScaleDefault: vec3 = vec3.one()

  @ui.separator
  @ui.label("Map Transform — Navigation")
  @input private mapLocalPositionNavigation: vec3 = vec3.zero()
  @input private mapLocalScaleNavigation: vec3 = new vec3(0.7, 0.7, 0.7)

  @ui.separator
  @ui.label("Transition")
  @input private transitionDuration: number = 0.4

  @ui.separator
  @ui.label("Tour Mode")
  @input tourModeOnly: boolean = false
  @allowUndefined
  @input tourButton: BaseButton
  @allowUndefined
  @input tourButtonLabel: Text
  @allowUndefined
  @input tourStatusText: Text

  private tweenCancel: CancelFunction | null = null
  private tourActive: boolean = false
  private currentDestination: Place | null = null

  private onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      this.start()
    })
  }

  private start(): void {
    this.imageDisplay.onPromptAvailable.add((place) => {
      if (isNull(place)) {
        this.imageDisplay.setVisible(false)
      }
    })
    this.imageDisplay.onIsVisible.add(() => {
      this.adjustSize(false)
    })

    if (!isNull(this.zoomInButton)) this.zoomInButton.onTriggerUp.add(() => this.mapComponent.zoomIn())
    if (!isNull(this.zoomOutButton)) this.zoomOutButton.onTriggerUp.add(() => this.mapComponent.zoomOut())
    if (!isNull(this.centerMapButton)) this.centerMapButton.onTriggerUp.add(() => this.mapComponent.centerMap())

    this.scrollRootDefaultPosition = this.scrollRoot.getTransform().getLocalPosition()
    this.frameDefaultPosition = this.frame.getSceneObject().getTransform().getLocalPosition()
    this.mainPanelDefaultPosition = this.mainPanel.getTransform().getLocalPosition()
    this.mapComponent.onUserPositionSet.add(() => {
      this.adjustSize()
    })
    this.mapComponent.centerMap()
    this.adjustSize()

    this.navigationDataComponent.onNavigationStarted.add((place) => {
      this.currentDestination = place
      if (!isNull(place)) {
        this.enterNavigation()
        if (this.tourActive) {
          this.updateTourStatus()
        }
      } else {
        this.exitNavigation()
      }
    })

    this.navigationDataComponent.onArrivedAtPlace.add((place) => {
      if (!this.tourActive) return
      this.currentDestination = null
      const visited = this.navigationDataComponent.places.filter((p) => p.visited).length
      const total = this.navigationDataComponent.places.length
      this.setTourStatusText(`You reached ${place.name}! (${visited}/${total} stops)\nSelect your next destination.`)
    })

    this.navigationDataComponent.onAllPlacesVisited.add(() => {
      if (!this.tourActive) return
      this.tourActive = false
      this.currentDestination = null
      this.updateTourButtonLabel()
      const total = this.navigationDataComponent.places.length
      this.setTourStatusText(`Tour complete! All ${total} stops visited.`)
      if (!isNull(this.mapComponent) && this.mapComponent.isInitialized) {
        this.setButtonsVisible(true)
      }
    })

    this.navigationDataComponent.getUserPosition().onUserPositionUpdated.add(() => {
      if (this.tourActive && this.currentDestination !== null) {
        this.updateTourStatus()
      }
    })

    if (!isNull(this.tourButton)) {
      this.tourButton.onTriggerUp.add(() => this.toggleTour())
      this.tourButton.sceneObject.enabled = this.tourModeOnly
    }
    this.updateTourButtonLabel()

    const setupCloseButton = () => {
      this.frame.closeButton.onTriggerUp.add(() => {
        this.navigationDataComponent.stopNavigation()
      })
    }

    if (this.frame.closeButton) {
      setupCloseButton()
    } else {
      this.frame.onInitialized.add(() => {
        setupCloseButton()
      })
    }

    this.frame.showCloseButton = false
    this.tether.enabled = false
    this.billboard.enabled = false
  }

  private enterNavigation(): void {
    this.setButtonsVisible(false)
    this.frame.showCloseButton = true
    this.scrollView.enabled = false
    this.tether.enabled = true
    this.billboard.enabled = true

    this.transitionTo(
      this.frameInnerSizeNavigation,
      this.mapLocalPositionNavigation,
      this.mapLocalScaleNavigation,
      vec3.zero()
    )
  }

  private exitNavigation(): void {
    this.setButtonsVisible(false)
    this.frame.showCloseButton = false
    this.scrollView.enabled = true
    this.tether.enabled = false
    this.billboard.enabled = false

    // Reposition the frame SceneObject in front of the user
    const frameT = this.frame.getSceneObject().getTransform()
    if (!isNull(this.camera)) {
      const camT = this.camera.getTransform()
      const camPos = camT.getWorldPosition()
      const camFwd = camT.forward

      // Flatten forward onto the horizontal plane — same approach as TetherTS
      const flatFwd = new vec3(camFwd.x, 0, camFwd.z).normalize()
      // Right vector: cross(up, flatFwd) = (flatFwd.z, 0, -flatFwd.x)
      const flatRight = new vec3(flatFwd.z, 0, -flatFwd.x)

      // Place panel using the tether's configured offset (not a hardcoded distance)
      const offset = this.tether.offset
      frameT.setWorldPosition(new vec3(
        camPos.x + flatRight.x * offset.x + flatFwd.x * offset.z,
        camPos.y,
        camPos.z + flatRight.z * offset.x + flatFwd.z * offset.z
      ))

      // Face panel toward the user — panel face is -Z, so forward must point away from user
      // Same as BillboardTS with lookAway=true
      const angle = Math.atan2(flatFwd.x, flatFwd.z)
      frameT.setWorldRotation(quat.fromEulerAngles(0, angle, 0))
    } else {
      // Fallback: restore original local position
      frameT.setLocalPosition(this.frameDefaultPosition)
    }

    this.transitionTo(
      this.frameInnerSizeDefault,
      this.mapLocalPositionDefault,
      this.mapLocalScaleDefault,
      this.mainPanelDefaultPosition,
      () => this.setButtonsVisible(true)
    )
  }

  private transitionTo(
    targetInnerSize: vec2,
    targetMapPosition: vec3,
    targetMapScale: vec3,
    targetPanelPosition: vec3,
    onComplete?: () => void
  ): void {
    if (this.tweenCancel) {
      this.tweenCancel()
      this.tweenCancel = null
    }

    const mapTransform = this.mapObject.getTransform()
    const panelTransform = this.mainPanel.getTransform()

    const startInnerSize = this.frame.innerSize
    const startMapPos = mapTransform.getLocalPosition()
    const startMapScale = mapTransform.getLocalScale()
    const startPanelPos = panelTransform.getLocalPosition()

    this.tweenCancel = makeTween((t) => {
      this.frame.innerSize = vec2.lerp(startInnerSize, targetInnerSize, t)
      mapTransform.setLocalPosition(vec3.lerp(startMapPos, targetMapPosition, t))
      mapTransform.setLocalScale(vec3.lerp(startMapScale, targetMapScale, t))
      panelTransform.setLocalPosition(vec3.lerp(startPanelPos, targetPanelPosition, t))
      if (t >= 1 && onComplete) onComplete()
    }, this.transitionDuration)
  }

  private setButtonsVisible(visible: boolean): void {
    if (!isNull(this.spawnPinButton)) this.spawnPinButton.sceneObject.enabled = visible
    if (!isNull(this.clearPinsButton)) this.clearPinsButton.sceneObject.enabled = visible
    if (!isNull(this.centerMapButton)) this.centerMapButton.sceneObject.enabled = visible
    if (!isNull(this.searchMapButton)) this.searchMapButton.sceneObject.enabled = visible
    if (!isNull(this.zoomInButton)) this.zoomInButton.sceneObject.enabled = visible
    if (!isNull(this.zoomOutButton)) this.zoomOutButton.sceneObject.enabled = visible
    if (!isNull(this.showRestaurantsButton)) this.showRestaurantsButton.sceneObject.enabled = visible
    if (!isNull(this.showCafeButton)) this.showCafeButton.sceneObject.enabled = visible
    if (!isNull(this.showBarButton)) this.showBarButton.sceneObject.enabled = visible
  }

  private toggleTour(): void {
    this.tourActive = !this.tourActive
    this.navigationDataComponent.tourMode = this.tourActive

    if (this.tourActive) {
      this.setButtonsVisible(false)
      const places = this.navigationDataComponent.places
      if (places.length > 0) {
        this.setTourStatusText(`Heading to your first stop: ${places[0].name}`)
        this.navigationDataComponent.navigateToPlace(places[0])
      } else {
        this.setTourStatusText("No destinations available.")
      }
    } else {
      this.navigationDataComponent.stopNavigation()
      this.currentDestination = null
      this.setTourStatusText("")
      if (!this.tourModeOnly) {
        if (!isNull(this.tourButton)) this.tourButton.sceneObject.enabled = false
        if (!isNull(this.mapComponent) && this.mapComponent.isInitialized) {
          this.setButtonsVisible(true)
        }
      }
    }
    this.updateTourButtonLabel()
  }

  private setTourStatusText(message: string): void {
    if (!isNull(this.tourStatusText)) {
      this.tourStatusText.text = message
    }
  }

  private updateTourButtonLabel(): void {
    if (isNull(this.tourButtonLabel)) return
    this.tourButtonLabel.text = this.tourActive ? "Stop Tour" : "Start Tour"
  }

  private updateTourStatus(): void {
    if (!this.tourActive || this.currentDestination === null) return

    const total = this.navigationDataComponent.places.length
    const visited = this.navigationDataComponent.places.filter((p) => p.visited).length
    const dist = this.navigationDataComponent.getUserPosition().getDistanceTo(this.currentDestination)
    const distStr = isNull(dist) ? "" : dist < 1000 ? ` (${dist.toFixed(0)}m)` : ` (${(dist / 1000).toFixed(1)}km)`
    this.setTourStatusText(`Heading to: ${this.currentDestination.name}${distStr}\n${visited}/${total} visited`)
  }

  private adjustSize(withEnable = true): void {
    if (this.mapComponent.isInitialized || this.imageDisplay.visible) {
      if (withEnable) {
        this.mapRender.enabled = true
        if (!this.tourModeOnly) {
          this.setButtonsVisible(true)
        }
      }
      this.scrollRoot.getTransform().setLocalPosition(this.scrollRootDefaultPosition)
    } else {
      if (withEnable) {
        this.mapRender.enabled = false
        this.setButtonsVisible(false)
      }
      this.scrollRoot.getTransform().setLocalPosition(vec3.zero())
    }
  }
}
