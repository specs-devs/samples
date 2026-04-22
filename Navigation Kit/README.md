# Navigation Kit

[![SIK](https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?) [![Location AR](https://img.shields.io/badge/Location%20AR-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/features/location-ar/custom-landmarker?) [![Outdoor Navigation](https://img.shields.io/badge/Outdoor%20Navigation-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/compatability-list?) [![Map Component](https://img.shields.io/badge/Map%20Component-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/features/location-ar/map-component?) [![Places](https://img.shields.io/badge/Places-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/features/remote-apis/snap-places-api?)

<img src="./README-ref/sample-list-navigation-kit-rounded-edges.gif" alt="Navigation Kit" width="500" />

## Overview

This project demonstrates how to build guided tour experiences using the [Spectacles Navigation Kit (SNK)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-navigation-kit/getting-started). The example is set in London but users can build their own tours by simply replacing the places of interest.
A search button can be used to populate the list with places nearby to the user.

> **NOTE:**
> This project will only work for the Spectacles platform.

### Other Useful Projects

This project differs from the [Outdoor Navigation project](https://github.com/Snapchat/Spectacles-Sample/tree/main/Outdoor%20Navigation) in that it applies the Navigation Kit as the basis for all of its features. The Map Component used here has been heavily modified for this use case, so if the map is the primary feature you wish to use it may be worth evaluating that project for a more standalone map.

The [Custom Location project](https://github.com/Snapchat/Spectacles-Sample/tree/main/Custom%20Locations) also provides examples of how to use Custom Locations within a project and provides scripts to help with that. This project shows an example of them incorporated into a guided tour, but there is functionality specific to that project too.

## Design Guidelines

Designing Lenses for Spectacles offers opportunities to rethink user interaction with digital spaces and the physical world.
Get started using our [Design Guidelines](https://developers.snap.com/spectacles/best-practices/design-for-spectacles/introduction-to-spatial-design)

## Prerequisites

- **Lens Studio**: v5.15.4+

**Note:** Ensure Lens Studio is [compatible with Spectacles](https://ar.snap.com/download) for your Spectacles device and OS versions.

- **Spectacles OS Version**: v5.64+
- **Spectacles App iOS**: v0.64+
- **Spectacles App Android**: v0.64+


To update your Spectacles device and mobile app, refer to this [guide](https://support.spectacles.com/hc/en-us/articles/30214953982740-Updating).

You can download the latest version of Lens Studio from [here](https://ar.snap.com/download?lang=en-US).

## Getting the project

To obtain the project folder, you need to clone the repository.

> **IMPORTANT**:
> This project uses Git Large Files Support (LFS). Downloading a zip file using the green button on Github
> **will not work**. You must clone the project with a version of git that has LFS.
> You can download Git LFS here: https://git-lfs.github.com/.

---

## Part 1 — Standard Navigation

### Overview

Standard navigation lets users browse a list of nearby places on an interactive map, select a destination, and follow AR guidance to reach it. The following features work together:

- **Map Component** (`Assets/MapComponentModified/`) — renders a live tile-based map, supports pan, zoom, and center. The modified version in this template is wired to the Navigation Kit for position updates.
- **GPS / User Position** — `NavigationDataComponent.getUserPosition()` provides real-time geo-coordinates and heading. Accuracy status is visualized on the minimap via `LocationAccuracyDisplay`.
- **Places API** (`PlacesSearcher`) — attached to `[MapComponent]` in the scene hierarchy. Tap the Search button in `BarMenu` to query the Snap Places API for nearby points of interest and populate the scrollable list automatically.
- **AR Navigation Arrow** (`ARNavigation`) — a 3D world-space arrow rendered by the Overlay Camera that continuously points toward the selected destination. It enters a "here" state when the user is within the `hereRadius` (default 10 m, 0.5 m indoors).
- **Quest Markers** (`QuestMarkerController`) — 2D screen-space HUD markers showing distance and direction to all registered places simultaneously. Useful for spatial awareness without requiring the user to look at the map.
- **Mapbox Turn-by-Turn Hints** (`ExperimentalMapboxHints` / `ExperimentalMapboxHintsUI`) — optional step-by-step walking directions fetched from the Mapbox Directions API. Add your Mapbox public access token (`pk.…`) to the `ExperimentalMapboxHints` component to enable this feature. Directions refresh every 20 m of movement.

### UI Layout

The main panel lives under `Navigation > Frame > MainPanel` in the scene hierarchy and contains:

| Element | Purpose |
|---|---|
| `PlacesUIComponentScroll` | Scrollable list of places (browse mode) |
| `BarMenu` | Row of action buttons (zoom in/out, center map, search, spawn pin, clear pins, category filters) |
| `TourButton` | Start / Stop Tour toggle button (see Part 2) |
| `StatusTour` | Status text showing tour progress |
| `[MapComponent]` | Embedded map render and controls |
| `ARNavigation` | Overlay camera with 3D navigation arrow |

`PanelManager` orchestrates layout transitions between **browse mode** (full panel, scrollable list, all buttons visible) and **navigation mode** (compact panel, tether + billboard enabled, close button shown). Transitions animate the frame inner size, map position, and map scale over `transitionDuration` seconds (default 0.4 s).

### Selecting a Destination

1. Browse the scrollable list or use the Search button to find nearby places.
2. Tap a list entry — `NavigationDataComponent.onNavigationStarted` fires with the selected `Place`.
3. The panel transitions to navigation mode: the list hides, the frame shrinks, the AR arrow activates.
4. Walk to the destination. On arrival `onArrivedAtPlace` fires and navigation ends.
5. Tap the X (close button) on the frame at any time to stop navigation and return to browse mode.

### Adding Places (Standard Navigation)

Places are registered via a `ManualPlaceList` component attached to the `GuidedTourLists` scene object (or its children). Each list can contain any combination of:

- **Manual Geo Locations** — latitude/longitude coordinates.
- **Custom Location Places** — `LocatedAtComponent` references to scanned Custom Locations.
- **Custom Location Group Places** — a `CustomLocationGroup` (imports all child Custom Locations automatically).
- **Scene Object Places** — world-space `SceneObject`s (positions are relative to the user's position at Lens start).

---

## Part 2 — Guided Tour with Custom Locations

### Overview

The Guided Tour mode lets users walk a predefined linear sequence of stops. Navigation automatically advances to each stop in order. The tour uses the same `NavigationDataComponent` as standard navigation, with `tourMode` enabled.

### Scene Hierarchy

```
GuidedTourLists
├── IndoorPlaceList          ← disabled by default
└── OutdoorPlaceList         ← disabled by default

GuidedTourLists - EnableToUse - LocationsAssets
├── IndoorLocations          ← indoor Custom Location roots
└── OutdoorLocations         ← outdoor Custom Location roots
```

Both `IndoorPlaceList` and `OutdoorPlaceList` are **disabled by default** in the scene. `ProjectVariantSelector` enables the correct list at runtime based on the Indoor / Outdoor dropdown selection.

### Selecting Indoor vs Outdoor

The `ProjectVariantSelector` component on the `ProjectVariant` scene object controls which variant is active:

- **Outdoor** — enables `OutdoorPlaceList` and the outdoor location objects; initializes GPS updates.
- **Indoor** — enables `IndoorPlaceList` and the indoor location objects; sets the AR arrow `hereRadius` to 0.5 m.

Both variants disable the opposing set of objects before enabling their own, preventing double-registration of places.

> **Important**: Custom Location roots in `OutdoorLocations` must have their `Active` checkbox enabled in the Inspector for their `LocatedAtComponent` to function correctly.

### Place Types in a Tour

**GPS-only places** (Manual Geo Locations):
- Defined by latitude/longitude in `ManualPlaceList`.
- Navigation starts immediately from GPS position.
- No scan required; no prompt image displayed.
- Arrival is detected when the user comes within the `hereRadius`.

**Custom Location + GPS places** (Custom Location Places):
- Defined by a `LocatedAtComponent` attached to a scanned location asset.
- When the user is within the `nearbyRadius` (default 50 m), the Custom Location is enabled for localization.
- When the user is within the `promptRadius` (default 15 m), a prompt image appears in the list and minimap to guide the user to the exact scan viewpoint.
- Once localized, the AR arrow switches from GPS-based to world-space tracking, achieving centimeter-level accuracy.
- AR content anchored to the location (via `EnableObjectsOnFound`) becomes visible after successful localization.

### Starting and Stopping the Tour

The **TourButton** in `MainPanel` toggles tour mode. Its label automatically switches between **Start Tour** and **Stop Tour**.

**On Start Tour:**
1. `PanelManager.toggleTour()` sets `navigationDataComponent.tourMode = true`.
2. All `BarMenu` buttons are hidden.
3. Navigation begins to the first place in the list (`navigationDataComponent.navigateToPlace(places[0])`).
4. `StatusTour` displays: `Heading to your first stop: [Name]`.

**While the Tour is Running:**
- `StatusTour` updates continuously as the user's position changes:
  `Heading to: [Name] (Xm) — X/N visited`
- On arrival at each stop: `You reached [Name]! (X/N stops) — Select your next destination.`
- The user taps the next destination in the list to continue (or the tour auto-advances if `tourMode` handles sequential navigation).

**On Tour Complete** (all places visited):
- `onAllPlacesVisited` fires.
- Tour mode is deactivated, `BarMenu` buttons reappear.
- `StatusTour` displays: `Tour complete! All N stops visited.`

**On Stop Tour (manual):**
1. `navigationDataComponent.stopNavigation()` is called.
2. `BarMenu` buttons reappear, `TourButton` is hidden (unless `tourModeOnly` is true).
3. `StatusTour` is cleared.

### Tour Mode Only

Set `tourModeOnly = true` on the `PanelManager` component to lock the lens into guided tour mode:
- On start, `TourButton` is visible and `BarMenu` is hidden.
- Stopping the tour does **not** show `BarMenu` or hide `TourButton` — the user can restart the tour.

Set `tourModeOnly = false` (default) for mixed use — standard navigation and tour are both available. `TourButton` is hidden until explicitly shown.

### Wiring the Tour in the Inspector

On the `PanelManager` component under `Navigation > Frame > MainPanel`:

| Input | Scene Object |
|---|---|
| `tourButton` | `MainPanel/TourButton` (BaseButton) |
| `tourButtonLabel` | `MainPanel/TourButton/Label` (Text) |
| `tourStatusText` | `MainPanel/StatusTour` (Text) |
| `tourModeOnly` | `true` for tour-only lens, `false` for mixed |

On `GuidedTourLists`:

| Component | Scene Object |
|---|---|
| `ManualPlaceList` (indoor) | `GuidedTourLists/IndoorPlaceList` — disabled by default |
| `ManualPlaceList` (outdoor) | `GuidedTourLists/OutdoorPlaceList` — disabled by default |

On `ProjectVariantSelector`:

| Input | Value |
|---|---|
| `indoorObjects` | Objects to enable for indoor mode |
| `outdoorObjects` | Objects to enable for outdoor mode |
| `indoorPlaceList` | `IndoorPlaceList` |
| `outdoorPlaceList` | `OutdoorPlaceList` |

---

## Indoors vs Outdoors

The template supports both indoor and outdoor navigation. Transitions between the two are not currently supported at runtime.

**Outdoor** experiences should use individual Custom Locations and geo-coordinates. Users may launch the lens far from any destination, so GPS-based navigation must work from the moment the lens starts.

**Indoor** experiences should be built on a single Custom Location Group. GPS is unreliable indoors; the AR arrow should only be shown after a group member has been localized (see `OnlyShowArrowAfterGroupLocalization`). The `WelcomeSignIndoors` prefab demonstrates the recommended pattern: a splash prompt on first launch that guides the user to localize before navigation begins.

---

## Distance Checks

| Check | Component | Default | Notes |
|---|---|---|---|
| Nearby radius | `ManualPlaceList` (per entry) | 50 m | Enables Custom Location for localization when user is within range |
| Prompt radius | `CustomLocationPlacesImageDisplay` | 15 m (10 m indoors) | Distance at which the prompt image becomes available |
| Here radius | `ARNavigation` | 10 m (0.5 m indoors) | Distance at which the AR arrow enters its "here" state |
| Dismiss radius | `DismissOnWalkAway` on `UI/MainPanel` | — | Distance the user must walk before the main panel auto-dismisses |

---

## Key Scripts

| Script | Location | Purpose |
|---|---|---|
| `PanelManager.ts` | `Assets/Scripts/` | Manages panel layout transitions between browse and navigation modes; drives tour start/stop logic and status text |
| `MinimapHighlightManager.ts` | `Assets/Scripts/` | Controls the highlight ring on the minimap to signal localization state and GPS accuracy |
| `CustomLocationPlacesImageDisplay.ts` | `Assets/Scripts/` | Binds a `CustomLocationPlace` to a prompt image shown when the user is close enough to a destination |
| `OnlyShowArrowAfterGroupLocalization.ts` | `Assets/Scripts/` | Hides the AR navigation arrow until a Custom Location Group member has been localized (indoor use) |
| `ProjectVariantSelector.ts` | `Assets/Scripts/` | Switches between indoor and outdoor variants; enables/disables the correct `ManualPlaceList` and location objects |
| `ExperimentalMapboxHints.ts` | `Assets/Scripts/` | Fetches Mapbox walking directions and exposes step-by-step instructions via events |
| `ExperimentalMapboxHintsUI.ts` | `Assets/Scripts/` | Renders the Mapbox hints data in the UI |
| `MapAnimator.ts` | `Assets/Scripts/` | Adjusts map zoom so both the user pin and the destination pin are visible simultaneously |
| `PlacesSearcher.ts` | `Assets/MapComponentModified/Scripts/` | Queries the Snap Places API for nearby places and registers them with `NavigationDataComponent` |
| `LocationAccuracyDisplay.ts` | `Assets/Scripts/` | Scales a graphic on the minimap to represent current GPS horizontal accuracy |

---

## Walkthrough

### 1. Scan Locations

Create a Custom Location at each physical location where AR content will be anchored.

<img src="./README-ref/custom-locations-scanning.gif" alt="Scan Locations" width="500" />

For indoor or small outdoor experiences, create a Custom Location Group. Instructions on creating groups can be found [here](https://developers.snap.com/spectacles/about-spectacles-features/apis/custom-locations).

### 2. Add the Locations to Lens Studio

#### Individual Custom Locations

Add Custom Location objects to your scene and set the ID on the `LocationAsset`.

<img src="./README-ref/addCustomLocation.png" alt="Add custom location" width="500" />

More information: [Adding Multiple Custom Locations](https://developers.snap.com/lens-studio/features/location-ar/custom-landmarker#adding-multiple-custom-locations)

#### Custom Location Groups

Add a `CustomLocationGroup` component to a `SceneObject`. This imports all child Custom Locations automatically.

### 3. Anchor Content to Locations

Use the Custom Location mesh as a guide for content placement. The `EnableObjectsOnFound` script ensures content is only shown after successful localization.

<img src="./README-ref/addContent.png" alt="Add content" width="500" />

### 4. Add References to ManualPlaceList

Add your Custom Locations to the correct `ManualPlaceList` (indoor or outdoor) and fill in each place's label, icon, and description.

- Edit `IndoorPlaceList` for indoor tours.
- Edit `OutdoorPlaceList` for outdoor tours.
- Match each entry's type to your location type (geo coordinate, individual Custom Location, or Custom Location Group).

<img src="./README-ref/manualPlaceList.png" alt="Add content" width="500" />

> **Remember**: Both `IndoorPlaceList` and `OutdoorPlaceList` should remain **disabled** in the scene hierarchy. `ProjectVariantSelector` enables the correct one at runtime.

### 5. Add Prompt Images

Add a prompt image to each place in `ManualPlaceList` to help users find and localize against Custom Locations. When the user is within `promptRadius`, a `?` indicator appears in the list and on the minimap. Tapping it reveals the prompt image.

### 6. Configure Tour Mode (optional)

If you want a guided tour experience:

1. Set `tourModeOnly` on `PanelManager` to `true` (tour-only) or `false` (mixed mode).
2. Wire `tourButton`, `tourButtonLabel`, and `tourStatusText` in the Inspector.
3. Ensure the order of places in `ManualPlaceList` matches the intended tour sequence.

### 7. Test Your Lens

Once complete, push the lens to your Spectacles device and walk through the tour.

---

## Support

If you have any questions or need assistance please don't hesitate to reach out. Our community is here to help and you can connect with us and ask for support [here](https://www.reddit.com/r/Spectacles/). We look forward to hearing from you!

## Contributing

Feel free to provide improvements or suggestions or directly contribute via merge request. By sharing insights you help everyone else build better Lenses.

---

*Built with 👻 by the Spectacles team*
 
