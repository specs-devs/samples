import {BaseButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/BaseButton"
import {MapComponent} from "MapComponentModified/Scripts/MapComponent"
import {GeoLocationPlace} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/GeoLocationPlace"
import {NavigationDataComponent} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/NavigationDataComponent"
import {Place} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/Place"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {IPlacesApi, PlaceInfo} from "./IPlacesApi"

/**
 * Searches for nearby places on the map.
 */
@component
export class PlacesSearcher extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  private navigationModule: NavigationDataComponent
  @input
  @allowUndefined
  private searchButton: BaseButton
  @input
  private mapComponent: MapComponent
  @input
  private placesFinder: IPlacesApi

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
    this.logger = new Logger("PlacesSearcher", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    if (!isNull(this.searchButton)) {
      this.searchButton.onTriggerUp.add(() => {
        this.searchCurrentMapPosition()
      })
    }

    this.navigationModule.onNavigationStarted.add((place) => {
      this.removeCurrentPlaces(place)
    })

    this.mapComponent.onUserPositionSet.add(() => {
      this.searchCurrentMapPosition(false)
    })
  }

  private async searchCurrentMapPosition(addCenter: boolean = true): Promise<void> {
    this.removeCurrentPlaces()

    const currentFocus = this.mapComponent.getCurrentLocationFocus()
    this.logger.info(`searching at lat=${currentFocus?.latitude}, lng=${currentFocus?.longitude}`)

    try {
      if (addCenter) {
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

      const nearby = await this.placesFinder.getNearbyPlacesInfo(currentFocus, 15, 500)
      nearby.forEach((p) => {
        const navigationPlace = this.createPlaceFromNearby(p)
        this.currentPlaces.push(navigationPlace)
        this.navigationModule.addPlace(navigationPlace)
      })

      if (nearby.length > 0) {
        return
      }
    } catch (e) {
      const error = e as Error
      this.logger.error("error getting places: " + error.name + " " + error.message + " " + error.stack)
    }
  }

  private createPlaceFromNearby(place: PlaceInfo): Place {
    const geoPosition = place.centroid
    let name = place.name

    if (!isNull(name) && name.length > 15) {
      const splitList = name.split(" ")
      if (splitList.length > 1) {
        name = splitList[0] + " " + splitList[1]
      } else {
        name = name.substring(0, 15)
      }
    }

    const navigationPlace = new GeoLocationPlace(
      geoPosition,
      10,
      name,
      null,
      place.subtitle,
      this.navigationModule.getUserPosition()
    )

    return navigationPlace
  }

  private removeCurrentPlaces(except: Place = null): void {
    this.currentPlaces.forEach((place) => {
      if (place === except) {
        return
      }
      this.navigationModule.removePlace(place)
    })
    this.currentPlaces = this.currentPlaces.filter((e) => e === except)
  }
}
