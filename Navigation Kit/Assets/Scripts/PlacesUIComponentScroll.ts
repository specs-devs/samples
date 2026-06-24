import {GridLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/GridLayout/GridLayout"
import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {ScrollWindow} from "SpectaclesUIKit.lspkg/Scripts/Components/ScrollWindow/ScrollWindow"
import {CancelToken, setTimeout} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils"
import {NavigationDataComponent} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/NavigationDataComponent"
import {Place} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/Place"
import {UserPosition} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/UserPosition"

const TAG = "[PlacesUIComponentScroll]"

const BUTTON_WIDTH = 14
const BUTTON_HEIGHT = 5
const BUTTON_DEPTH = 1
const BUTTON_STYLE = "PrimaryNeutral"
const GRID_SPACING = 0.5
const TITLE_FONT_SIZE = 36
const SUBTITLE_FONT_SIZE = 26
const TITLE_COLOR = new vec4(1, 1, 1, 1)
const SUBTITLE_COLOR = new vec4(0.7, 0.7, 0.7, 1)
const ACTIVE_TITLE_COLOR = new vec4(0.3, 0.85, 0.5, 1)
const COMPLETED_TITLE_COLOR = new vec4(0.5, 0.5, 0.5, 1)
const TEXT_RECT_HALF_WIDTH = 6
const TEXT_RECT_HALF_HEIGHT = 1.5
const Z_OFFSET = 0.5

enum PlaceStatus {
  idle,
  active,
  completed
}

interface PlaceEntry {
  place: Place
  button: RectangleButton
  titleText: Text
  subtitleText: Text
  status: PlaceStatus
}

/**
 * Dynamically generates a single-column grid of RectangleButtons
 * from NavigationDataComponent places, replacing the legacy ScrollView/PlaceListItem system.
 */
@component
export class PlacesUIComponentScroll extends BaseScriptComponent {
  @input
  private navigationComponent: NavigationDataComponent

  @input("vec2", "{16,20}")
  @hint("Visible window size (width, height) in cm")
  private windowSize: vec2 = new vec2(16, 20)

  private scrollWindowObject: SceneObject
  private scrollWindow: ScrollWindow
  private gridContainer: SceneObject
  private gridLayout: GridLayout
  private entries: PlaceEntry[] = []
  private userPosition: UserPosition
  private rebuildDelay: CancelToken | null = null

  private onAwake(): void {
    print(TAG + " onAwake called")
    this.createEvent("OnStartEvent").bind(() => this.start())
  }

  private start(): void {
    print(TAG + " start called")

    if (isNull(this.navigationComponent)) {
      print(TAG + " ERROR: navigationComponent is null! Did you wire it in the inspector?")
      return
    }

    print(TAG + " navigationComponent found: " + this.navigationComponent.getSceneObject().name)

    this.userPosition = this.navigationComponent.getUserPosition()
    print(TAG + " userPosition acquired: " + !isNull(this.userPosition))

    const places = this.navigationComponent.places
    print(TAG + " initial places count: " + (places ? places.length : "null"))

    this.navigationComponent.onPlacesUpdated.add(() => {
      const updatedPlaces = this.navigationComponent.places
      print(TAG + " onPlacesUpdated fired, places count: " + (updatedPlaces ? updatedPlaces.length : "null"))
      // Defer rebuild to avoid destroying the ScrollWindow while an
      // event chain originating from a child button is still executing.
      // Also debounces multiple rapid removePlace() calls into one rebuild.
      if (!isNull(this.rebuildDelay)) {
        this.rebuildDelay.cancelled = true
      }
      this.rebuildDelay = setTimeout(() => {
        this.rebuild()
      }, 10)
    })

    this.navigationComponent.onArrivedAtPlace((place) => {
      print(TAG + " onArrivedAtPlace: " + (place?.name ?? "null"))
      this.setPlaceStatus(place, PlaceStatus.completed)
    })

    this.navigationComponent.onNavigationStarted((place) => {
      print(TAG + " onNavigationStarted: " + (place?.name ?? "null"))
      for (const entry of this.entries) {
        if (entry.status === PlaceStatus.completed) continue
        entry.status = entry.place === place ? PlaceStatus.active : PlaceStatus.idle
      }
      this.refreshAllDisplays()
    })

    this.rebuild()
  }

  private rebuild(): void {
    print(TAG + " rebuild called")
    this.clear()

    const places = this.navigationComponent.places
    print(TAG + " places to build: " + (places ? places.length : "null"))

    if (!places || places.length === 0) {
      print(TAG + " no places available, skipping build")
      return
    }

    for (let i = 0; i < places.length; i++) {
      print(TAG + " place[" + i + "]: name=" + (places[i].name ?? "null") + ", desc=" + (places[i].description ?? "null"))
    }

    this.scrollWindowObject = global.scene.createSceneObject("PlacesScrollWindow")
    this.scrollWindowObject.setParent(this.sceneObject)

    this.scrollWindow = this.scrollWindowObject.createComponent(
      ScrollWindow.getTypeName()
    ) as ScrollWindow

    const totalCellHeight = BUTTON_HEIGHT + GRID_SPACING * 2
    const contentHeight = places.length * totalCellHeight
    const contentWidth = BUTTON_WIDTH + GRID_SPACING * 2

    ;(this.scrollWindow as any)._vertical = true
    ;(this.scrollWindow as any)._horizontal = false
    ;(this.scrollWindow as any)._windowSize = this.windowSize
    ;(this.scrollWindow as any)._scrollDimensions = new vec2(contentWidth, contentHeight)

    this.gridContainer = global.scene.createSceneObject("PlacesGrid")
    this.gridContainer.setParent(this.scrollWindowObject)

    this.gridLayout = this.gridContainer.createComponent(
      GridLayout.getTypeName()
    ) as GridLayout
    this.gridLayout.rows = places.length
    this.gridLayout.columns = 1
    this.gridLayout.cellSize = new vec2(BUTTON_WIDTH, BUTTON_HEIGHT)
    this.gridLayout.cellPadding = new vec4(
      GRID_SPACING,
      GRID_SPACING,
      GRID_SPACING,
      GRID_SPACING
    )
    this.gridLayout.layoutBy = 0
    print(TAG + " gridLayout configured: " + places.length + " rows x 1 column, cellSize: " + BUTTON_WIDTH + "x" + BUTTON_HEIGHT)

    for (let i = 0; i < places.length; i++) {
      print(TAG + " creating button for place[" + i + "]: " + (places[i].name ?? "unknown"))
      const entry = this.createPlaceButton(places[i])
      this.entries.push(entry)
    }

    this.gridLayout.initialize()

    this.scrollWindow.initialize()
    this.scrollWindow.scrollPositionNormalized = new vec2(0, 1)
    print(TAG + " scrollWindow initialized, window: " + this.windowSize.x + "x" + this.windowSize.y + ", content: " + contentWidth.toFixed(1) + "x" + contentHeight.toFixed(1))

    this.applyZOffset()
    this.refreshAllDisplays()
    print(TAG + " rebuild complete, " + this.entries.length + " buttons created")
  }

  private createPlaceButton(place: Place): PlaceEntry {
    const btnObj = global.scene.createSceneObject(place.name ?? "Place")
    btnObj.setParent(this.gridContainer)

    const button = btnObj.createComponent(
      RectangleButton.getTypeName()
    ) as RectangleButton

    if (isNull(button)) {
      print(TAG + " ERROR: failed to create RectangleButton component for " + (place.name ?? "unknown"))
    }

    ;(button as any)._style = BUTTON_STYLE
    button.size = new vec3(BUTTON_WIDTH, BUTTON_HEIGHT, BUTTON_DEPTH)
    button.initialize()
    button.hasShadow = true
    print(TAG + " button created and initialized for: " + (place.name ?? "unknown"))

    const contentObj = global.scene.createSceneObject("Content")
    contentObj.setParent(btnObj)
    contentObj.getTransform().setLocalPosition(new vec3(0, 0.6, 0.1))

    const titleObj = global.scene.createSceneObject("Title")
    titleObj.setParent(contentObj)
    const titleText = titleObj.createComponent("Component.Text") as Text
    titleText.size = TITLE_FONT_SIZE
    titleText.text = place.name ?? "Place"
    titleText.textFill.color = TITLE_COLOR
    titleText.horizontalAlignment = HorizontalAlignment.Center
    titleText.verticalAlignment = VerticalAlignment.Center
    titleText.worldSpaceRect = Rect.create(
      -TEXT_RECT_HALF_WIDTH,
      TEXT_RECT_HALF_WIDTH,
      -TEXT_RECT_HALF_HEIGHT,
      TEXT_RECT_HALF_HEIGHT
    )

    const subtitleObj = global.scene.createSceneObject("Subtitle")
    subtitleObj.setParent(contentObj)
    subtitleObj.getTransform().setLocalPosition(new vec3(0, -1.4, 0))
    const subtitleText = subtitleObj.createComponent("Component.Text") as Text
    subtitleText.size = SUBTITLE_FONT_SIZE
    subtitleText.text = place.description ?? ""
    subtitleText.textFill.color = SUBTITLE_COLOR
    subtitleText.horizontalAlignment = HorizontalAlignment.Center
    subtitleText.verticalAlignment = VerticalAlignment.Center
    subtitleText.worldSpaceRect = Rect.create(
      -TEXT_RECT_HALF_WIDTH,
      TEXT_RECT_HALF_WIDTH,
      -TEXT_RECT_HALF_HEIGHT,
      TEXT_RECT_HALF_HEIGHT
    )

    const entry: PlaceEntry = {
      place,
      button,
      titleText,
      subtitleText,
      status: PlaceStatus.idle
    }

    button.onTriggerUp.add(() => this.handleButtonPress(entry))

    return entry
  }

  private handleButtonPress(entry: PlaceEntry): void {
    print(TAG + " button pressed: " + (entry.place.name ?? "unknown") + ", current status: " + PlaceStatus[entry.status])
    if (entry.status === PlaceStatus.active) {
      print(TAG + " stopping navigation")
      this.navigationComponent.stopNavigation()
      entry.status = PlaceStatus.idle
    } else {
      print(TAG + " navigating to: " + (entry.place.name ?? "unknown"))
      entry.status = PlaceStatus.active
      this.navigationComponent.navigateToPlace(entry.place)
    }
    this.refreshAllDisplays()
  }

  private setPlaceStatus(place: Place, status: PlaceStatus): void {
    for (const entry of this.entries) {
      if (entry.place === place) {
        entry.status = status
      }
    }
    this.refreshAllDisplays()
  }

  private refreshAllDisplays(): void {
    for (const entry of this.entries) {
      this.refreshDisplay(entry)
    }
  }

  private refreshDisplay(entry: PlaceEntry): void {
    const nameText = entry.place.name ?? "Place"
    const distance = this.userPosition.getDistanceTo(entry.place)
    const distanceText = this.formatDistance(distance)
    entry.titleText.text = distanceText ? `${nameText} ${distanceText}` : nameText
    entry.subtitleText.text = entry.place.description ?? ""

    switch (entry.status) {
      case PlaceStatus.active:
        entry.titleText.textFill.color = ACTIVE_TITLE_COLOR
        break
      case PlaceStatus.completed:
        entry.titleText.textFill.color = COMPLETED_TITLE_COLOR
        break
      default:
        entry.titleText.textFill.color = TITLE_COLOR
        break
    }
  }

  private formatDistance(distance: number | null): string {
    if (isNull(distance)) return ""
    if (distance < 1000) return `(${distance.toFixed(0)}m)`
    return `(${(distance / 1000).toFixed(1)}km)`
  }

  private applyZOffset(): void {
    if (!this.gridContainer) return
    for (let i = 0; i < this.gridContainer.getChildrenCount(); i++) {
      const child = this.gridContainer.getChild(i)
      const pos = child.getTransform().getLocalPosition()
      child.getTransform().setLocalPosition(new vec3(pos.x, pos.y, Z_OFFSET))
    }
  }

  private clear(): void {
    this.entries = []
    // Destroy the ScrollWindow COMPONENT first while its scene object is
    // still valid. ScrollWindow's OnDestroyEvent reparents internal children
    // to this.sceneObject — that call crashes if the scene object is already
    // being destroyed. Destroying the component separately lets the cleanup
    // run against a still-valid scene object.
    if (this.scrollWindow && !isNull(this.scrollWindow)) {
      this.scrollWindow.destroy()
      this.scrollWindow = null
    }
    if (this.scrollWindowObject && !isNull(this.scrollWindowObject)) {
      this.scrollWindowObject.destroy()
    }
    this.scrollWindowObject = null
    this.scrollWindow = null
    this.gridContainer = null
    this.gridLayout = null
  }
}
