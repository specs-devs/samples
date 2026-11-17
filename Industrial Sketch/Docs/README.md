# Industrial Sketch

## What it is
Industrial Sketch is a hand-tracked 3D sketching and concept-modeling tool for Specs, aimed at industrial and
product designers. You draw strokes and surfaces in the air, block out forms with primitives and subdivision
surfaces, reshape them, check proportions and review the result alone or with collaborators. It is also a
reference for building a large, runtime-generated Specs app: procedural meshes, a runtime UI Kit palette, two-hand
navigation, undo / redo, persistence and Sync Kit collaboration.

## What it does
1. On start, the Sync Kit menu asks for **Solo** or **Multiplayer**. Your last sketch is restored automatically.
2. A construction grid appears in front of you and the tool palette floats to the side.
3. Pinch with your dominant hand to use the active tool: draw strokes, sweep / revolve / loft / fill surfaces, drag
   out shapes and SubD cages, grab, edit points, paint, erase, measure or pin review notes.
4. Pinch with the other hand to move and turn the whole sketch; pinch with both hands to scale it.
5. The palette switches tools and settings: cross-sections, brush size and smoothing, colors and finishes,
   symmetry, snapping, layers, mannequin, presentation mode, viewpoints, real-size reference models, save slots
   and OBJ / glTF / STL export.
6. In Multiplayer, every change is shared live, late joiners receive the current sketch, each person's cursor is
   shown and a presenter can bring everyone to their viewpoint.
7. In the Lens Studio Preview, the mouse draws and keyboard shortcuts drive the tools (see the main README).

## Highlights
- Engine-independent geometry kernel: swept tubes / ribbons with parallel-transport frames, revolve, loft, sweep,
  ear-clipped fills, primitives and Catmull-Clark subdivision with face extrusion.
- Live mirror and radial symmetry baked into each item, with ghost cursors.
- Planar drawing on the non-dominant palm's plane, grid / angle snapping and snapped straight lines.
- Snapshot-based undo / redo over a plain JSON document that also feeds saving and collaboration.
- Everything is created at runtime from one component and two materials.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/IndustrialSketch.ts` | Entry component: builds the app, routes hands between navigation and tools, autosaves. |
| `Scripts/Core/SketchDocument.ts` | Items, live edits and the undo / redo history. |
| `Scripts/Core/SketchTypes.ts` | The serializable item model and validation. |
| `Scripts/Core/ItemGeometry.ts` | Item → mesh (with symmetry) and picking distances. |
| `Scripts/Core/AppState.ts` | Observable settings: tool, brush, color, symmetry, snapping, layers. |
| `Scripts/Geometry/*.ts` | Geometry kernel (tubes, surfaces, primitives, SubD, symmetry, curves). |
| `Scripts/Input/HandTracker.ts` | Pinch point, orientation and UI blocking per hand; mouse fallback in the editor. |
| `Scripts/Input/PreviewShortcuts.ts` | Keyboard shortcuts for the Lens Studio Preview. |
| `Scripts/Tools/*.ts` | Stroke, Surface, Shapes / SubD, Grab, Edit, Paint, Erase, Measure and Notes tools, selection actions. |
| `Scripts/Workspace/Workspace.ts` | Sketch root, world navigation, viewpoints, grid, mannequin, presentation turntable. |
| `Scripts/Workspace/ReferenceLibrary.ts` | Real-size reference models built from primitives. |
| `Scripts/Render/*.ts` | Materials per color and finish, mesh upload, item views and gizmos. |
| `Scripts/UI/Palette.ts` | The runtime UI Kit palette (Tools, Options, Color, Scene, Review, File). |
| `Scripts/UI/Hud.ts` | Hint and toast line, hand readout, measurement and note labels. |
| `Scripts/Persistence/*.ts` | Save slots, autosave, and OBJ / MTL, glTF and STL export. |
| `Scripts/Collab/CollabSession.ts` | Sync Kit co-creation, remote cursors and shared viewpoints. |

## Extra info
- **Requires:** Icons, InteractionKit, Motion, SyncKit and UIKit (all bundled). Specs only (hand tracking); the
  Lens Studio Preview supports the mouse and keyboard. Clone with Git LFS.
- **Get started:** open `IndustrialSketch.esproj` (`Assets/Scene.scene`). The `Industrial Sketch` object holds
  the component; assign `Materials/Sketch PBR` and `Materials/Sketch Unlit` if you rebuild the scene.
- **More docs:** [../README.md](../README.md) for the feature list, controls and testing steps.
