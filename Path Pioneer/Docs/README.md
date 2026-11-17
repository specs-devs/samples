# Path Pioneer

## What it is
A sample project for creating and walking a path in the real world on Specs. The player places a start line on
the detected ground, walks a route that is recorded as they go, closes it with a finish line or into a loop, and
then walks it again with live pace, lap and progress feedback. It is for developers interested in ground
detection, world raycasting, procedural meshes and state-machine driven gameplay in TypeScript.

## What it does
1. After the guide panel, a tutorial plays, then the home panel offers to create a path.
2. To place the start line, surface detection uses world hit testing to find and confirm a stable horizontal
   ground surface; the Lens caches the ground offset from the camera.
3. The player then walks: preview arrows and a dotted trail show the path being recorded.
4. The path ends by placing a finish line, or by returning to the start to close a loop (a loop lock ring
   animates while the loop is confirmed).
5. The recorded points are smoothed and turned into a path mesh with side arrows along it.
6. Walking the path shows lap count, lap / session time, a progress bar and pace; a warning overlay appears
   when the player moves faster than the pace limit.

## Highlights
- Path creation is a state machine (`IdleState`, `PlacingStartState`, `BuildingPathState`, `PlacingFinishState`).
- Path smoothing helpers: Hermite and Catmull-Rom splines, curve resampling and end-of-path smoothing.
- `PathBuilder.ts` generates the path ribbon at runtime with `MeshBuilder`.
- Rolling window of directional side arrows spawned near the player along the path.
- World-space soft-follow UI panels with custom gradient visuals for UI Kit buttons, frames, sliders and switches.
- Sound effects played from a pool of `AudioComponent`s.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/LensInitializer.ts` | Bootstraps the session, caches ground offset and runs the make → walk lifecycle. |
| `Scripts/PathMaker.ts` | Drives the path-creation states from start placement to finish or loop. |
| `Scripts/PathMakerStates/BuildingPathState.ts` | Records the walked path with preview arrows and the dotted trail mesh. |
| `Scripts/PathWalker.ts` | Walking experience: laps, pace, progress bar and session end. |
| `Scripts/PathBuilder.ts` | Builds the path mesh from a list of points. |
| `SurfaceDetection/Scripts/SurfaceDetection.ts` | Finds and confirms the ground plane with world hit testing. |
| `Scripts/UI.ts` | Visibility and transitions of the soft-follow UI panels and the loop lock indicator. |
| `Scripts/ArrowsSpawner.ts` | Spawns directional side arrows near the player along the path. |
| `Scripts/WarningController.ts` | Shows the pace-limit warning overlay. |

## Extra info
- **Requires:** bundled packages `Icons`, `SpectaclesInteractionKit`, `Motion`, `SnapDecorators`, `SpectaclesUIKit`, `Utilities`.
  Built for Specs; the flow can be followed in the Lens Studio Interactive Preview (WASD / QE to move). Use an
  open area free of traffic and obstacles, and walk rather than run.
- **Get started:** open `Assets/Scene.scene` and start from the `LensInitializer` component.
- **More docs:** [../README.md](../README.md) — overview, safety notes and testing steps.
