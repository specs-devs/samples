# Sync Kit

## What it is
Sync Kit is a sample Connected Lens for Specs that walks through the core building blocks of Sync Kit, one small
example at a time: synced transforms and materials, `SyncEntity` and `SessionController` scripting, storage
properties, networked instantiation and ownership. It is for developers starting a multiplayer Lens who want to see
each Sync Kit feature working on its own, in both TypeScript and JavaScript.

## What it does
1. After the guide, the Sync Kit start menu lets you start a multiplayer session or play alone.
2. An example carousel steps through the examples with Previous / Next; each step is shown on its own:
   - **Components:** pinch the ghost and move it and everyone sees it move (Sync Transform); a cube cycles through
     materials in sync for everyone (Sync Material).
   - **Basic:** script-only examples of `SyncEntity`, `SessionController` and the Snapchat user API. Nothing
     appears; they report session events in the logs.
   - **StorageProperty:** shared values for everyone. A text types itself, cubes change color and stripes, and
     shapes circle around (top row TypeScript, bottom row JavaScript).
   - **Instantiator:** each step spawns a shared ghost for everyone (automatically, from TypeScript, from
     JavaScript) that you can pinch and move.
   - **SyncEntityDebug:** a debug panel shows the entity's network id, owner and a synced property; pinch
     **Claim** / **Unclaim** to take or release ownership. The second step spawns the same panel from a prefab.
   - **DisplayStorageProperty:** a text shows the current time, updated by its owner for everyone.

## Highlights
- Every example ships in TypeScript and JavaScript side by side.
- Covers auto and manual storage properties for text, transforms, position / rotation / scale, mesh color and
  material properties.
- Shows the three ways to spawn networked objects: automatic instantiation, and instantiation from TypeScript or
  JavaScript.
- Ownership is visible and controllable through the debug panel.
- The example scripts come from the bundled `SpectaclesSyncKit.lspkg` (its `Examples/` folder, e.g.
  `SyncEntityExample.ts`, `InstantiatorExample.ts`, `StorageProperty/TextStoragePropertyExample.ts`); the project's
  own `Assets/Scripts` only holds the guide and carousel.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/ExampleCarousel/ExampleCarousel.ts` | Steps through the Sync Kit examples, showing one at a time with its instructions. |
| `Scripts/GuideDismissPanel/GuideDismissPanel.ts` | Shows the project guide and reveals the examples when you dismiss it. |

## Extra info
- **Requires:** Icons, InteractionKit, Motion, SnapDecorators, SyncKit, UIKit, Utilities. Built for Specs and
  Connected Lenses; test with several users. In Lens Studio, open two Interactive Previews and join the same
  session from both. Clone with Git LFS.
- **Get started:** open `SKBasicExample.esproj` (`Assets/Scene.scene`). The examples are the children of
  `Examples`; configure `SessionController [CONFIGURE_ME]` and `ColocatedWorld [CONFIGURE_ME]` for your own Lens.
- **More docs:** [../README.md](../README.md) for Sync Kit concepts and patterns.
