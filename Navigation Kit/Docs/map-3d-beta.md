# Map3D [BETA] – 3D city map (Mapbox)

> **Beta.** Not wired into `Scene.scene` and not part of the S9 release scope. Code-only drop in
> `Assets/Map3DBeta/`; tested for type-correctness, not yet in Lens Studio or on device.

## What it does
`Map3D` is a standalone component: give it a latitude/longitude and it builds a round tabletop map
(default 40 cm across) of that spot:

- **Ground**: a Mapbox Static Images texture (`mapbox/dark-v11` by default) on a disc mesh.
- **Buildings**: real footprints and heights from Mapbox Streets v8 vector tiles (`building` layer,
  `height` / `min_height`), extruded with `MeshBuilder` (walls and a triangulated roof).
- **Landmarks**: the top POIs around the spot (Tilequery on `poi_label`, ranked by `filterrank` and
  `sizerank`) shown as pins with labels that turn to face the camera.
- **Centre marker** for the location of interest, labelled with `placeName`.
- **Clamp mask**: content is clipped to the disc. Pinch-drag on the map to pan. The ground texture
  slides inside the disc. Buildings are drawn only while their whole footprint is inside the disc, and
  pins hide at the edge. You can pan up to `panRangeMeters` from the centre.
- **Attribution**: a `© Mapbox © OpenStreetMap` label sits at the front edge of the disc (required, see below).
- **Status text**: `Add your Mapbox token on Map3D` when the token is empty, and request errors (401/403
  token rejected, 429 rate limited, HTTP n). Errors never include the token.

Public API: `setLocation(lat, lon, placeName?)` (re-centres and reloads), `recenter()` (resets the pan),
`load()` (reloads with the current inputs).

## Files
| File | Purpose |
|---|---|
| `Assets/Map3DBeta/Map3D.ts` | The component: loading, meshes, clamp mask, drag-to-pan, labels |
| `Assets/Map3DBeta/MapboxMercator.ts` | Web Mercator helpers: lat/lon ↔ meters, tiles, meters → map cm |
| `Assets/Map3DBeta/MapboxVectorTile.ts` | Minimal MVT (protobuf) decoder for the `building` layer |

## Mapbox token (personal, local only)
1. Sign in at <https://account.mapbox.com/> and open **Access tokens**. Use the default public token
   (`pk.…`) or create one with only the default public scopes. A URL restriction isn't needed for a Lens.
2. In Lens Studio, select **Map3D [BETA]** and paste the token into **Mapbox Token**.
3. **Never commit it.** The field is empty in the repo on purpose. Before you commit or save a prefab,
   clear the field (or don't stage `Scene.scene` / the prefab). Don't put the token in code, docs,
   `.meta` files or chat. The script never prints it.

## Mapbox terms and attribution
- Anything that shows Mapbox maps or data must show `© Mapbox © OpenStreetMap`. The component creates
  that label itself. Don't remove or hide it.
- The static image is requested with `logo=false&attribution=false` because the round crop would cut off
  the logo anyway. Mapbox terms also require the **Mapbox wordmark** for production use. Before any
  public release, add the wordmark (for example as an image next to the attribution) and review the
  [Mapbox ToS](https://www.mapbox.com/legal/tos) and
  [attribution guidelines](https://docs.mapbox.com/help/getting-started/attribution/).
- Usage counts against the token owner's Mapbox account. One load costs 1 Static Images request,
  up to 16 vector tile requests and 1 Tilequery request.

## Limits (beta)
- Building holes (courtyards) are ignored: roofs cover them.
- Buildings that cross a tile border can be duplicated slightly in the tile buffer. This isn't visible
  because they're the same height.
- The clamp works on whole buildings, so the edge of the disc is "building-jagged", not a perfect cut.
- If the device returns vector tiles still gzip-compressed (it shouldn't, since HTTP decompresses them),
  buildings fall back to approximate 14 m boxes at up to 50 Tilequery hits. Enable `enableLogging` to see this.
- At most 16 tiles are requested. If `zoom` × area needs more, zoom drops automatically (13 minimum).
- Tilequery returns at most 50 POIs. Names come from `name_en`, falling back to `name`.
- No zoom gesture yet. Change `radiusMeters` and call `load()`.
- Label `Text` sizes in world space need tuning in the editor (`labelSize`).

## Lens Studio wiring
1. **Scene object**: create an empty SceneObject named `Map3D [BETA]`. Place it about 50–60 cm in front of
   the camera and about 20 cm below eye level, for example position `(0, -20, -55)`, with zero rotation.
   The map lies flat in the object's XZ plane (+Y up, north = −Z).
2. **Component**: add a Script Component with `Assets/Map3DBeta/Map3D.ts` (class `Map3D`).
3. **Materials** (create them in `Assets/Map3DBeta/` and assign):
   - **Ground Material**: an *Unlit* material (Asset Browser → + → Material → Unlit). The script clones it at
     runtime and writes the Mapbox image into `mainPass.baseTex`, so the asset itself stays untouched.
   - **Building Material**: a *PBR* (lit) material with a light grey/white base colour. It needs a light or
     envmap in the scene. With an Unlit material the buildings read as flat silhouettes. If the walls look
     inside-out, enable **Two Sided** on the material.
   - **Pin Material**: Unlit, accent colour (for example cyan).
   - Optional **Marker Material** (for example orange) and **Edge Material** (a thin rim around the disc).
4. **Inputs**: paste **Mapbox Token** for testing only. Set **Latitude/Longitude** (default: Trafalgar
   Square, London 51.5079, -0.1281) and **Place Name**. Defaults: Zoom 15, Radius 300 m, Pan Range 300 m,
   Map Size 40 cm, Height Scale 1.5, Landmarks 8. Leave **Load On Start** on.
5. **Interaction**: nothing to add. On awake, the script adds a box **Collider** (`mapSizeCm × 2 × mapSizeCm`)
   and an InteractionKit **Interactable** to the same object if they're missing. To tune them in the
   editor (for example `targetingMode`), add both yourself beforehand and the script uses yours.
6. **Status text**: optional. Assign your own `Text` to **Status Text**. Otherwise one is created above the
   back edge of the map.
7. **Check in Preview**: with the token, the ground, buildings, pins and attribution should appear in a few
   seconds. Drag on the map to pan. If north and south look mirrored, tick **Flip Ground V**.
8. **Prefab**: drag `Map3D [BETA]` from the Scene Hierarchy into `Assets/Map3DBeta/` to create
   `Map3D [BETA].prefab`. **Clear the Mapbox Token field on the prefab before saving and committing.**
   Instances can then be dropped anywhere, and calling `setLocation()` re-targets them at runtime.

### Driving it from another script
```ts
import {Map3D} from "Map3DBeta/Map3D"

@component
export class ShowPlace extends BaseScriptComponent {
  @input map3d: Map3D
  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.map3d.setLocation(40.758, -73.9855, "Times Square"))
  }
}
```
