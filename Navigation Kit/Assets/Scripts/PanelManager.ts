import {BaseButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/BaseButton"
import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {ElementContent} from "SpectaclesUIKit.lspkg/Scripts/Components/Content/ElementContent"
import {Frame} from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame"
import {FRAME_BUTTON_SETTINGS_BY_APPEARANCE} from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/FrameButtonSettings"
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {InteractableManipulation} from "MapComponentModified/MapManipulation"
import {MapComponent} from "MapComponentModified/Scripts/MapComponent"
import {CancelFunction} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {makeTween} from "MapComponentModified/Scripts/MapUtils"
import {NavigationDataComponent} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/NavigationDataComponent"
import {Place} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/Place"
import {BillboardTS} from "Solvers.lspkg/Scripts/TS/BillboardTS"
import {TetherTS} from "Solvers.lspkg/Scripts/TS/TetherTS"
import {CustomLocationPlacesImageDisplay} from "./CustomLocationPlacesImageDisplay"

const MINIMIZE_ICON = requireAsset("../MapComponentModified/Textures/shrink.png") as Texture
const MINIMIZE_BUTTON_GAP = 1

type PanelState = "default" | "navigation" | "minimized"

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
  @input private frameInnerSizeMinimized: vec2 = new vec2(16, 16)
  @input
  @hint("Tether offset (relative to camera) for the minimized circular map — top-right of view")
  private minimizedTetherOffset: vec3 = new vec3(32, 24, -110)

  @ui.separator
  @ui.label("Map Transform — Default")
  @input private mapLocalPositionDefault: vec3 = vec3.zero()
  @input private mapLocalScaleDefault: vec3 = vec3.one()

  @ui.separator
  @ui.label("Map Transform — Navigation")
  @input private mapLocalPositionNavigation: vec3 = vec3.zero()
  @input private mapLocalScaleNavigation: vec3 = new vec3(0.7, 0.7, 0.7)
  @input private mapLocalScaleMinimized: vec3 = new vec3(0.45, 0.45, 0.45)

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
  private panelState: PanelState = "default"
  private minimizeButton: Button | null = null
  private frameButtonsInitialized: boolean = false
  private mapManipulation: InteractableManipulation | null = null
  private mapInteractable: Interactable | null = null
  private tapCatcher: SceneObject | null = null
  private navigationTetherOffset: vec3

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

    if (!isNull(this.zoomInButton)) this.zoomInButton.onTriggerUp?.add(() => this.mapComponent.zoomIn())
    if (!isNull(this.zoomOutButton)) this.zoomOutButton.onTriggerUp?.add(() => this.mapComponent.zoomOut())
    if (!isNull(this.centerMapButton)) this.centerMapButton.onTriggerUp?.add(() => this.mapComponent.centerMap())

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

    // getUserPosition() can be undefined during start() if NavigationDataComponent
    // hasn't finished initializing yet. Guard the subscription so we don't blow up.
    const userPosition = this.navigationDataComponent.getUserPosition()
    if (!isNull(userPosition)) {
      userPosition.onUserPositionUpdated.add(() => {
        if (this.tourActive && this.currentDestination !== null) {
          this.updateTourStatus()
        }
      })
    }

    if (!isNull(this.tourButton)) {
      this.tourButton.onTriggerUp?.add(() => this.toggleTour())
      this.tourButton.sceneObject.enabled = this.tourModeOnly
    }
    this.updateTourButtonLabel()

    // onInitialized is a ReplayEvent — the callback runs immediately if the
    // frame already initialized, or right after it does.
    this.frame.onInitialized.add(() => this.setupFrameButtons())

    this.navigationTetherOffset = this.tether.offset
    this.tether.enabled = false
    this.billboard.enabled = false
  }

  private setupFrameButtons(): void {
    if (this.frameButtonsInitialized) return
    this.frameButtonsInitialized = true

    // The Frame creates its close button lazily the first time
    // showCloseButton becomes true. Force-create it now so the trigger
    // handler below is attached before the user ever sees the button.
    this.frame.showCloseButton = true
    this.frame.closeButton.onTriggerUp?.add(() => this.navigationDataComponent.stopNavigation())
    this.frame.showCloseButton = false

    // The panel always follows the user; the follow toggle only confuses.
    this.frame.showFollowButton = false

    this.createMinimizeButton()
    this.createTapCatcher()

    // Map panning is disabled while minimized; the map's interactable is
    // disabled too so its (mini) collider can't steal the expand tap.
    this.mapManipulation = this.mapRender.getComponent(
      InteractableManipulation.getTypeName()
    ) as InteractableManipulation
    this.mapInteractable = this.mapRender.getComponent(Interactable.getTypeName()) as Interactable
  }

  // The map's own interactable stops event propagation for its pan handling,
  // so expanding can't reliably piggyback on it. Instead a dedicated collider
  // sits just in front of the minimized map and catches the expand tap.
  private createTapCatcher(): void {
    const obj = global.scene.createSceneObject("MinimapTapCatcher")
    obj.setParent(this.mainPanel)
    obj.layer = this.mainPanel.layer
    // +Z in panel space is toward the user — keep the catcher in front of the map.
    obj.getTransform().setLocalPosition(new vec3(0, 0, 4))

    const collider = obj.createComponent("ColliderComponent") as ColliderComponent
    const shape = Shape.createBoxShape()
    shape.size = new vec3(this.frameInnerSizeMinimized.x, this.frameInnerSizeMinimized.y, 1)
    collider.shape = shape
    collider.fitVisual = false

    const interactable = obj.createComponent(Interactable.getTypeName()) as Interactable
    interactable.onTriggerEnd.add(() => this.expandMap())

    obj.enabled = false
    this.tapCatcher = obj
  }

  private get frameButtonSettings() {
    return FRAME_BUTTON_SETTINGS_BY_APPEARANCE[this.frame.appearance] ?? FRAME_BUTTON_SETTINGS_BY_APPEARANCE["Large"]
  }

  // Builds a round "minimize" button directly below the frame's close button
  // (top-left corner), mirroring the Frame's own ButtonHandler construction.
  private createMinimizeButton(): void {
    const settings = this.frameButtonSettings
    const buttonObject = global.scene.createSceneObject("MinimizeMapButton")
    buttonObject.setParent(this.frame.frameObject)
    buttonObject.layer = this.frame.frameObject.layer

    const button = buttonObject.createComponent(Button.getTypeName()) as Button
    button.setVariant({theme: "SnapOS2", shape: "Round", style: "PrimaryNeutral"})
    button.size = new vec3(settings.buttonSize, settings.buttonSize, 1)
    button.onTriggerUp.add(() => this.minimizeMap())
    button.initialize()

    const content = buttonObject.createComponent(ElementContent.getTypeName()) as ElementContent
    content.leadingIconSize = settings.iconSize
    content.leadingIcon = MINIMIZE_ICON

    this.minimizeButton = button
    this.positionMinimizeButton()
    buttonObject.enabled = false
  }

  private positionMinimizeButton(): void {
    if (isNull(this.minimizeButton)) return
    const settings = this.frameButtonSettings
    const anchor = this.frame.frameVisual.getButtonAnchor(
      "close",
      this.frame.totalSize,
      settings.buttonSize,
      settings.offset
    )
    this.minimizeButton.transform.setLocalPosition(
      anchor.add(new vec3(0, -(settings.buttonSize + MINIMIZE_BUTTON_GAP), 0))
    )
  }

  private setMinimizeButtonVisible(visible: boolean): void {
    if (isNull(this.minimizeButton)) return
    this.minimizeButton.sceneObject.enabled = visible
    if (visible) this.positionMinimizeButton()
  }

  private minimizeMap(): void {
    if (this.panelState !== "navigation") return
    this.panelState = "minimized"

    this.frame.showCloseButton = false
    this.setMinimizeButtonVisible(false)
    if (!isNull(this.mapManipulation)) this.mapManipulation.enabled = false
    if (!isNull(this.mapInteractable)) this.mapInteractable.enabled = false
    if (!isNull(this.tourStatusText)) this.tourStatusText.sceneObject.enabled = false
    if (!isNull(this.tapCatcher)) this.tapCatcher.enabled = true

    // Circular minimap: mask the map tiles to a circle and hide the frame
    // chrome so only the round map remains, parked at the top-right of view.
    this.mapComponent.toggleMiniMap(true)
    this.frame.hideVisual()
    this.tether.offset = this.minimizedTetherOffset

    this.transitionTo(
      this.frameInnerSizeMinimized,
      this.mapLocalPositionNavigation,
      this.mapLocalScaleMinimized,
      vec3.zero()
    )
  }

  private expandMap(): void {
    if (this.panelState !== "minimized") return
    this.panelState = "navigation"

    this.frame.showCloseButton = true
    this.setMinimizeButtonVisible(true)
    if (!isNull(this.mapManipulation)) this.mapManipulation.enabled = true
    if (!isNull(this.mapInteractable)) this.mapInteractable.enabled = true
    if (!isNull(this.tourStatusText)) this.tourStatusText.sceneObject.enabled = true
    if (!isNull(this.tapCatcher)) this.tapCatcher.enabled = false

    this.mapComponent.toggleMiniMap(false)
    this.frame.showVisual()
    this.tether.offset = this.navigationTetherOffset

    this.transitionTo(
      this.frameInnerSizeNavigation,
      this.mapLocalPositionNavigation,
      this.mapLocalScaleNavigation,
      vec3.zero()
    )
  }

  private enterNavigation(): void {
    const wasMinimized = this.panelState === "minimized"
    this.panelState = "navigation"
    this.setButtonsVisible(false)
    this.frame.showCloseButton = true
    this.setMinimizeButtonVisible(true)
    if (!isNull(this.mapManipulation)) this.mapManipulation.enabled = true
    if (!isNull(this.mapInteractable)) this.mapInteractable.enabled = true
    if (!isNull(this.tourStatusText)) this.tourStatusText.sceneObject.enabled = true
    if (!isNull(this.tapCatcher)) this.tapCatcher.enabled = false
    if (wasMinimized) {
      this.mapComponent.toggleMiniMap(false)
      this.frame.showVisual()
    }
    this.tether.offset = this.navigationTetherOffset
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
    const wasMinimized = this.panelState === "minimized"
    this.panelState = "default"
    this.setButtonsVisible(false)
    this.frame.showCloseButton = false
    this.setMinimizeButtonVisible(false)
    if (!isNull(this.mapManipulation)) this.mapManipulation.enabled = true
    if (!isNull(this.mapInteractable)) this.mapInteractable.enabled = true
    if (!isNull(this.tourStatusText)) this.tourStatusText.sceneObject.enabled = true
    if (!isNull(this.tapCatcher)) this.tapCatcher.enabled = false
    if (wasMinimized) {
      this.mapComponent.toggleMiniMap(false)
      this.frame.showVisual()
    }
    this.tether.offset = this.navigationTetherOffset
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
      this.positionMinimizeButton()
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

  /** Show a transient status message on the panel's status text line. */
  public showStatus(message: string): void {
    this.setTourStatusText(message)
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
