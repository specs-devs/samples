# Essentials

## What it is
Essentials is a sample project that collects small, focused examples of the foundational building blocks of a Specs
Lens: interaction, UI, component access, instantiation, solvers, raycasting, snapping, physics and runtime gizmos.
Each example isolates one mechanic in legible TypeScript (with JavaScript equivalents for many), so you can copy it
into your own project or hand the project to an LLM as context. It is for developers learning Lens Studio scripting
for Specs.

## What it does
1. A guide panel introduces the project; dismissing it reveals a UI Kit carousel with **Previous** / **Next**.
2. The carousel shows one example at a time in front of you, with a short description of what to try:
   - Interaction Kit (SIK) and UI Kit components together, including the Rocket Workshop (pick parts, set a flight
     path, launch).
   - Interactable helpers, function-call helpers, component access from TS and JS, runtime instantiation layouts
     (circles, lines, grids, random points), hand attachment and runtime gizmos (lines, splines, spirals, circles).
   - Solvers shown in third person: a red "Head pose" sphere moves on its own and each solver reacts to it, one
     solver every few seconds.
   - Surface placement, snapping to planes and lines, raycasting, physics collisions with a soft press, and custom
     UI Kit visuals.
   - Mini demos: archery, drag and drop, directional shadows, dot product, raycast hover and painting, previous /
     next pagination and the SnapSaber game.
3. Sub-steps (for example individual solvers or mini demos) are stepped through one at a time with their parents.

## Highlights
- Many examples ship as matching `*TS.ts` and `*JS.js` scripts to compare both languages.
- Larger topics (AccessComponents, Instantiation, Solvers, RuntimeGizmos, SurfacePlacement, HandAttacher,
  InteractableHelper, FunctionCallHelper) live in their own bundled packages, so they can be reused as-is.
- TypeScript examples follow one style: `Logger` from Utilities with `enableLogging` toggles, `@bindStartEvent` /
  `@bindUpdateEvent` from SnapDecorators, and `@ui.label` / `@hint` inspector annotations.
- `SolversShowcase` turns first-person solver behaviour into a readable third-person diagram with labels.
- `CustomVisualsGallery` builds six UI Kit buttons, each with its own `RoundedRectangleVisual` style per state (glass, accent, outline, gradient, lift, toggle).

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/ExampleCarousel/ExampleCarousel.ts` | Steps through the examples and their sub-steps with a UI Kit panel. |
| `Scripts/GuideDismissPanel/GuideDismissPanel.ts` | Shows the intro guide and reveals the carousel when dismissed. |
| `Scripts/SolversShowcase/SolversShowcase.ts` | Drives a moving head-pose stand-in so each solver can be watched in third person. |
| `Examples/Raycast/SimpleRaycastTS.ts` | Casts a ray, reads hits and attaches an object to the hit position. |
| `Examples/Snap/SnapToPlaneTS.ts` | Snaps an object onto a plane when it comes within a distance. |
| `Examples/Physics-Collision/SoftPressControllerTS.ts` | Collision-driven soft press interaction. |
| `Examples/MiniDemos/DragAndDrop/DragAndDrop.ts` | Drag and drop built on Interactable manipulation events. |
| `Examples/MiniDemos/Archery/TS/ArcheryProjectileManagerTS.ts` | Arrow projectile physics for the archery demo. |
| `Examples/MiniDemos/SnapSaber/TS/SnapSaberGlobalManager.ts` | Game state and scoring for the SnapSaber demo. |

## Extra info
- **Requires:** [Prefab Preview Environment], AccessComponents, FunctionCallHelper, HandAttacher, Icons,
  Instantiation, InteractableHelper, InteractionKit, InteractionKitExamples, MarkerTrackingHelper, Motion,
  RuntimeGizmos, SnapDecorators, Solvers, SurfacePlacement, UIKit, Utilities. Most examples work in the Lens Studio
  Preview; hand-based examples (hand attachment, soft press) and surface placement are best tried on Specs. Camera
  features need Experimental APIs, and some APIs need Extended Permissions on the device.
- **Get started:** open `Essentials.esproj` (`Assets/Scene.scene`) and use the carousel, or open the objects in the
  Scene Hierarchy one by one and read their scripts.
- **More docs:** [../README.md](../README.md) for a per-folder breakdown and code snippets.
