# Navigation Kit

## What it is
Navigation Kit is a sample project that builds a guided walking tour on top of the Navigation Kit package. It
combines a map, nearby-place search, an AR direction arrow, HUD quest markers and Custom Locations into one
template. The bundled tour is set in Farringdon, London, but you build your own by replacing the places of
interest. It is for developers making outdoor or indoor navigation and tour experiences on Specs.

## What it does
1. A panel shows a tile-based map (pan, zoom, center) with your position and GPS accuracy, and a scrollable list of
   places.
2. The **Search** button in `BarMenu` queries the Snap Places API for points of interest near you and adds them to
   the list; other buttons zoom, re-center, spawn or clear pins and filter by category.
3. Selecting a place starts navigation: the panel shrinks and follows you, a 3D arrow points to the destination,
   and quest markers show distance and direction to every registered place.
4. Near a Custom Location stop, a `?` prompt image helps you find the scan viewpoint; once localized, the arrow
   switches from GPS to world tracking and content anchored to the location appears.
5. Arriving ends navigation for that stop. With **Start Tour**, stops are visited in list order and a status line
   reports progress until the tour is complete.
6. Optionally, walking turn-by-turn hints are fetched from the Mapbox Directions API.

## Highlights
- Places can be geo-coordinates, single Custom Locations, a whole Custom Location Group, or scene objects, all
  declared in a `ManualPlaceList`.
- `ProjectVariantSelector` switches between an indoor variant (Custom Location Group, tight arrival radius) and an
  outdoor variant (GPS from launch) and enables the matching place list.
- `PanelManager` animates between browse mode and navigation mode and runs the tour state; `tourModeOnly` locks the
  Lens to tour mode.
- `MapAnimator` keeps both the user pin and the destination pin in view.
- Indoors, `OnlyShowArrowAfterGroupLocalization` hides the arrow until the group has localized.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/PanelManager.ts` | Browse / navigation layout transitions, tour start and stop, tour status text. |
| `Scripts/ProjectVariantSelector.ts` | Enables the indoor or outdoor objects and place list at runtime. |
| `Scripts/CustomLocationPlacesImageDisplay.ts` | Shows a Custom Location's prompt image when the user is close enough. |
| `Scripts/OnlyShowArrowAfterGroupLocalization.ts` | Hides the AR arrow until a Custom Location Group member is localized. |
| `Scripts/MinimapHighlightManager.ts` | Minimap highlight for localization state and GPS accuracy. |
| `Scripts/MapAnimator.ts` | Adjusts map zoom to fit the user and destination pins. |
| `Scripts/ExperimentalMapboxHints.ts` | Fetches Mapbox walking directions and emits step events. |
| `MapComponentModified/Scripts/PlacesSearcher.ts` | Searches nearby places and registers them with the Navigation Kit. |
| `MapComponentModified/Scripts/MapComponent.ts` | The modified map component wired to Navigation Kit positions. |
| `MapComponentModified/Scripts/QuestMarkerController.ts` | Screen-space markers for all registered places. |

## Extra info
- **Requires:** AiPreviewAgentInspect, Icons, InteractionKit, Motion, NavigationKit, SnapDecorators, Solvers, UIKit,
  Utilities. Specs only: GPS, Places search, map tiles and Custom Location localization need the device and an
  internet connection. Mapbox hints need your own Mapbox public token (`pk.…`) on `ExperimentalMapboxHints`.
- **Get started:** open `Assets/Scene.scene`; the main panel is under `Navigation > Frame > MainPanel`. Add your
  places to `GuidedTourLists/IndoorPlaceList` or `OutdoorPlaceList` (keep both disabled; the variant selector
  enables one) and pick the variant on `ProjectVariant`.
- **More docs:** [../README.md](../README.md) for the full walkthrough, distance checks and Inspector wiring.
