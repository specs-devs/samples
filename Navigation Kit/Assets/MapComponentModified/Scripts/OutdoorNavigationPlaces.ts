import {GeoLocationPlace} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/GeoLocationPlace"
import {NavigationDataComponent} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/NavigationDataComponent"
import {Place} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/Place"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {PanelManager} from "../../Scripts/PanelManager"
import {PlacesApi, SnapPlaceInfo} from "./PlacesApi"

const NEARBY_PLACES_COUNT = 15
const NEARBY_DISTANCE_THRESHOLD = 500

/**
 * Wires up outdoor navigation UI buttons from PanelManager: spawn/clear pins,
 * search nearby places, and filter by category (restaurants, cafes, bars).
 */
@component
export class OutdoorNavigationPlaces extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input private panelManager: PanelManager
  @input private navigationModule: NavigationDataComponent
  @input private placesApi: PlacesApi

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private currentPlaces: Place[] = []

  private onAwake(): void {
    this.logger = new Logger("OutdoorNavigationPlaces", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private start(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    if (!isNull(this.panelManager.spawnPinButton)) {
      this.panelManager.spawnPinButton.onTriggerUp.add(() => {
        this.panelManager.mapComponent.addPinByLocalPosition(vec2.zero())
      })
    }

    if (!isNull(this.panelManager.clearPinsButton)) {
      this.panelManager.clearPinsButton.onTriggerUp.add(() => {
        this.removeCurrentPlaces()
        this.panelManager.mapComponent.removeMapPins()
      })
    }

    if (!isNull(this.panelManager.showRestaurantsButton)) {
      this.panelManager.showRestaurantsButton.onTriggerUp.add(() => {
        this.searchNearbyPlaces(["Restaurant"])
      })
    }

    if (!isNull(this.panelManager.showCafeButton)) {
      this.panelManager.showCafeButton.onTriggerUp.add(() => {
        this.searchNearbyPlaces(["Coffee"])
      })
    }

    if (!isNull(this.panelManager.showBarButton)) {
      this.panelManager.showBarButton.onTriggerUp.add(() => {
        this.searchNearbyPlaces(["Bar", "Pub"])
      })
    }
  }

  private async searchNearbyPlaces(
    categories: string[] | null = null,
    addSearchCenter: boolean = false
  ): Promise<void> {
    this.removeCurrentPlaces()

    const currentFocus = this.panelManager.mapComponent.getCurrentLocationFocus()

    try {
      if (addSearchCenter) {
        const searchCenter = new GeoLocationPlace(
          currentFocus,
          10,
          "Search Center",
          null,
          "",
          this.navigationModule.getUserPosition()
        )
        this.currentPlaces.push(searchCenter)
        this.navigationModule.addPlace(searchCenter)
      }

      // Use 0 cache threshold for category searches to always get a fresh fetch
      const cacheThreshold = categories !== null ? 0 : NEARBY_DISTANCE_THRESHOLD

      const nearby = await this.placesApi.getNearbyPlacesInfo(
        currentFocus,
        NEARBY_PLACES_COUNT,
        cacheThreshold
      )

      const results =
        categories !== null
          ? nearby.filter((place: SnapPlaceInfo) =>
              categories.some((cat) => place.category?.toLowerCase().includes(cat.toLowerCase()))
            )
          : nearby

      this.logger.info(`Fetched ${nearby.length} places, ${results.length} match filter: ${categories ?? "all"}`)
      nearby.forEach((p) => this.logger.debug(`  - ${p.name} [${p.category}]`))

      for (const place of results) {
        const navPlace = this.createPlaceFromInfo(place)
        this.currentPlaces.push(navPlace)
        this.navigationModule.addPlace(navPlace)
      }
    } catch (e) {
      this.logger.error(`Error fetching nearby places: ${e}`)
    }
  }

  private createPlaceFromInfo(place: SnapPlaceInfo): Place {
    let name = place.name
    if (!isNull(name) && name.length > 15) {
      const splitList = name.split(" ")
      name = splitList.length > 1 ? `${splitList[0]} ${splitList[1]}` : name.substring(0, 15)
    }

    return new GeoLocationPlace(
      place.centroid,
      10,
      name,
      null,
      place.subtitle,
      this.navigationModule.getUserPosition()
    )
  }

  private removeCurrentPlaces(): void {
    for (const place of this.currentPlaces) {
      this.navigationModule.removePlace(place)
    }
    this.currentPlaces = []
  }
}
