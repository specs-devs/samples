import Event, {PublicApi} from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {NavigationDataComponent} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/NavigationDataComponent"
import {Place} from "SpectaclesNavigationKit.lspkg/NavigationDataComponent/Place"
import {MapComponent} from "MapComponentModified/Scripts/MapComponent"

const TAG = "[ExperimentalMapboxHints]"

// Minimum distance (m) the user must move before we re-fetch directions
const REFRESH_THRESHOLD_METERS = 20

// ─── Exported data types (consumed by ExperimentalMapboxHintsUI) ─────────────

export interface DirectionStep {
  instruction: string
  distanceMeters: number
  maneuverType: string
}

export interface HintsUpdate {
  steps: DirectionStep[]
  totalDistanceMeters: number
  totalDurationSeconds: number
  /** Non-empty when showing a loading/error status instead of real steps */
  statusMessage: string
  isArrived: boolean
  arrivedPlaceName: string
}

// ─── Internal type ────────────────────────────────────────────────────────────

interface DirectionsRoute {
  steps: DirectionStep[]
  totalDistanceMeters: number
  totalDurationSeconds: number
}

/**
 * Data layer for Mapbox walking directions.
 * Fetches and parses route data, exposes it via events.
 * All visual rendering is handled by ExperimentalMapboxHintsUI.
 */
@component
export class ExperimentalMapboxHints extends BaseScriptComponent {
  // ─── Inspector inputs ───────────────────────────────────────────────────

  @input
  @hint("Mapbox public access token (pk.…)")
  @allowUndefined
  mapboxApiKey: string

  @input
  @hint("NavigationDataComponent driving the current navigation session")
  private navigationDataComponent: NavigationDataComponent

  @input
  @hint("MapComponent used to receive live GPS position updates")
  private mapComponent: MapComponent

  private internetModule: InternetModule = require("LensStudio:InternetModule")

  // ─── Public events ──────────────────────────────────────────────────────

  private onHintsChangedEvent = new Event<HintsUpdate>()
  /** Fires whenever route data, status, or arrival state changes. */
  public onHintsChanged: PublicApi<HintsUpdate> = this.onHintsChangedEvent.publicApi()

  private onNavigationActiveEvent = new Event<boolean>()
  /** Fires true when navigation starts, false when it ends. */
  public onNavigationActive: PublicApi<boolean> = this.onNavigationActiveEvent.publicApi()

  // ─── Runtime state ──────────────────────────────────────────────────────

  private currentGeoPosition: GeoPosition | null = null
  private destinationPlace: Place | null = null
  private currentRoute: DirectionsRoute | null = null
  private lastFetchPosition: GeoPosition | null = null
  private isFetching: boolean = false

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  private onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.start())
  }

  private start(): void {
    if (isNull(this.navigationDataComponent)) {
      print(TAG + " ERROR: navigationDataComponent not wired in inspector")
      return
    }
    if (isNull(this.mapComponent)) {
      print(TAG + " ERROR: mapComponent not wired in inspector")
      return
    }
    if (!this.mapboxApiKey || this.mapboxApiKey.trim() === "") {
      print(TAG + " ⚠️  No Mapbox API key set — add your public access token (pk.…) to enable turn-by-turn hints")
      return
    }

    this.navigationDataComponent.onNavigationStarted.add((place) => {
      if (!isNull(place)) {
        this.onNavigationStarted(place)
      } else {
        this.onNavigationEnded()
      }
    })

    this.navigationDataComponent.onArrivedAtPlace((place) => {
      this.onArrived(place)
    })

    this.mapComponent.onUserPositionSet.add((pos) => {
      this.currentGeoPosition = pos
      if (!isNull(this.destinationPlace)) {
        this.maybeRefreshDirections()
      }
    })

    print(TAG + " initialized – waiting for navigation to start")
  }

  // ─── Navigation state ───────────────────────────────────────────────────

  private onNavigationStarted(place: Place): void {
    print(TAG + " navigation started to: " + (place.name ?? "unknown"))
    this.destinationPlace = place
    this.currentRoute = null
    this.lastFetchPosition = null
    this.onNavigationActiveEvent.invoke(true)
    this.emitStatus("Fetching directions…")
    this.fetchDirections()
  }

  private onNavigationEnded(): void {
    print(TAG + " navigation ended")
    this.destinationPlace = null
    this.currentRoute = null
    this.lastFetchPosition = null
    this.isFetching = false
    this.onNavigationActiveEvent.invoke(false)
  }

  private onArrived(place: Place): void {
    const name = place?.name ?? "your destination"
    print(TAG + " arrived at: " + name)
    this.onHintsChangedEvent.invoke({
      steps: [],
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      statusMessage: "",
      isArrived: true,
      arrivedPlaceName: name
    })
  }

  // ─── Directions fetching ────────────────────────────────────────────────

  private async fetchDirections(): Promise<void> {
    if (isNull(this.destinationPlace)) return
    if (this.isFetching) return

    if (isNull(this.currentGeoPosition)) {
      print(TAG + " waiting for first GPS fix…")
      this.emitStatus("Waiting for GPS…")
      return
    }

    const destPos = this.getPlaceGeoPosition(this.destinationPlace)
    if (isNull(destPos)) {
      print(TAG + " could not read destination coordinates from Place")
      this.emitStatus("No destination coordinates")
      return
    }

    this.isFetching = true
    this.lastFetchPosition = this.currentGeoPosition

    const origin = this.currentGeoPosition.longitude + "," + this.currentGeoPosition.latitude
    const dest = destPos.longitude + "," + destPos.latitude
    const url =
      "https://api.mapbox.com/directions/v5/mapbox/walking/" +
      origin + ";" + dest +
      "?steps=true&language=en&access_token=" + this.mapboxApiKey

    print(TAG + " requesting Mapbox directions… origin: " + origin + " dest: " + dest)

    try {
      const response = await this.internetModule.fetch(new Request(url, {method: "GET"}))
      print(TAG + " response status: " + response.status)

      if (response.status < 200 || response.status >= 300) {
        print(TAG + " Mapbox HTTP error: " + response.status)
        this.emitStatus("Directions unavailable (" + response.status + ")")
        this.isFetching = false
        return
      }

      const body = await response.text()
      print(TAG + " response body length: " + body.length)
      this.isFetching = false

      const route = this.parseMapboxResponse(body)
      if (!isNull(route)) {
        this.currentRoute = route
        this.emitRoute(route)
      } else {
        this.emitStatus("No walking route found")
      }
    } catch (err) {
      this.isFetching = false
      print(TAG + " fetch error: " + err)
      this.emitStatus("Network error")
    }
  }

  private maybeRefreshDirections(): void {
    if (isNull(this.currentGeoPosition)) return
    if (isNull(this.lastFetchPosition)) {
      this.fetchDirections()
      return
    }
    const dist = this.haversineDistance(
      this.currentGeoPosition.latitude, this.currentGeoPosition.longitude,
      this.lastFetchPosition.latitude, this.lastFetchPosition.longitude
    )
    if (dist >= REFRESH_THRESHOLD_METERS) {
      print(TAG + " moved " + dist.toFixed(0) + "m – refreshing directions")
      this.fetchDirections()
    }
  }

  // ─── Parsing ────────────────────────────────────────────────────────────

  private parseMapboxResponse(body: string): DirectionsRoute | null {
    try {
      const data = JSON.parse(body)
      if (!data.routes || data.routes.length === 0) {
        print(TAG + " response contained no routes")
        return null
      }
      const route = data.routes[0]
      const leg = route.legs[0]
      const steps: DirectionStep[] = (leg.steps as any[]).map((s) => ({
        instruction: (s.maneuver && s.maneuver.instruction) ? s.maneuver.instruction : "Continue",
        distanceMeters: s.distance ?? 0,
        maneuverType: (s.maneuver && s.maneuver.type) ? s.maneuver.type : "turn"
      }))
      return {steps, totalDistanceMeters: route.distance ?? 0, totalDurationSeconds: route.duration ?? 0}
    } catch (e) {
      print(TAG + " JSON parse error: " + e)
      return null
    }
  }

  // ─── Event helpers ───────────────────────────────────────────────────────

  private emitRoute(route: DirectionsRoute): void {
    this.onHintsChangedEvent.invoke({
      steps: route.steps,
      totalDistanceMeters: route.totalDistanceMeters,
      totalDurationSeconds: route.totalDurationSeconds,
      statusMessage: "",
      isArrived: false,
      arrivedPlaceName: ""
    })
  }

  private emitStatus(msg: string): void {
    this.onHintsChangedEvent.invoke({
      steps: [],
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      statusMessage: msg,
      isArrived: false,
      arrivedPlaceName: ""
    })
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private getPlaceGeoPosition(place: Place): GeoPosition | null {
    const p = place as any
    if (p.location) return p.location as GeoPosition
    if (p.geoPosition) return p.geoPosition as GeoPosition
    if (p._location) return p._location as GeoPosition
    if (p._geoPosition) return p._geoPosition as GeoPosition
    print(TAG + " WARNING: could not resolve GeoPosition from Place '" + (place.name ?? "?") + "'")
    return null
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000
    const toRad = Math.PI / 180
    const φ1 = lat1 * toRad
    const φ2 = lat2 * toRad
    const Δφ = (lat2 - lat1) * toRad
    const Δλ = (lon2 - lon1) * toRad
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }
}
