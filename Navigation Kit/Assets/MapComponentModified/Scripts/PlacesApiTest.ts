import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {PlacesApi, SnapNearbyPlace} from "./PlacesApi"

/**
 * Tests the raw Places API with multiple locations.
 */
@component
export class PlacesApiTest extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">References</span>')
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

  private onAwake(): void {
    this.logger = new Logger("PlacesApiTest", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private async onStart(): Promise<void> {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    await this.runTests()
  }

  private async runTests(): Promise<void> {
    await this.testLocation("Snap HQ Santa Monica", 34.0168716, -118.4555594)
  }

  private async testLocation(label: string, lat: number, lng: number): Promise<void> {
    const location = { latitude: lat, longitude: lng } as unknown as GeoPosition

    this.logger.info(`\n=== ${label} (${lat}, ${lng}) ===`)

    try {
      const raw: SnapNearbyPlace[] = await this.placesApi.getNearbyPlaces(location, 10)
      this.logger.info(`${raw.length} results:`)
      raw.forEach((p, i) => {
        this.logger.info(`  ${i}: ${p.name} | ${p.categoryName} | ${p.placeTypeEnum}`)
      })
    } catch (e) {
      this.logger.error(`Error: ${e}`)
    }
  }
}
