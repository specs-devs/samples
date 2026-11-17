# Air Hockey

## What it is
A two-player Connected Lens sample built with Sync Kit: an air hockey table that two Specs users share in the
same space. It shows how to sync physics-driven gameplay, per-player ownership and scores between devices, and
how to represent the opponent with a Bitmoji avatar driven by inverse kinematics. It is for developers learning
multiplayer patterns with sync entities and storage properties.

## What it does
1. Choose multiplayer to join a colocated Connected Lens session (or play solo); the air hockey board appears.
2. Each player takes ownership of one paddle (left or right) by hovering / grabbing it.
3. Pinch the `Start` button to start (or restart) the game; the puck is launched and scores reset to zero.
4. Pinch and move your paddle side to side along its line to hit the puck; the puck bounces off walls and paddles.
5. When the puck enters a goal, the score updates on both scoreboards for everyone and the puck resets.
6. The opponent can be shown as a Bitmoji avatar whose arm follows their paddle and whose head tracks the puck.

## Highlights
- Scores are synced with `StorageProperty.manualInt`; paddle position and puck position / velocity are synced
  with storage properties on sync entities.
- The puck extrapolates its position from the synced velocity, so motion stays smooth between network updates.
- Paddles are line-constrained: the grabbed handle is projected onto a line segment.
- `PlayerSlotManager` tracks the left / right player connection IDs and notifies paddle and avatar logic.
- Bitmoji avatars use a FABRIK arm solver and a neck / torso look-at IK (documented in `IK/README.md`).
- Game logic ships in both TypeScript (`Scripts/Typescript/`) and JavaScript (`Scripts/Javascript/`) versions.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/Typescript/GameLogic/AirHockeyControllerTS.ts` | Game session: start / restart, goal detection, synced scores, paddle ownership. |
| `Scripts/Typescript/GameLogic/AirHockeyPuckTS.ts` | Networked puck physics with synced position and velocity. |
| `Scripts/Typescript/GameLogic/AirHockeyPaddleTS.ts` | Line-constrained paddle with synced position and per-frame velocity. |
| `Scripts/Typescript/GameLogic/PlayerSlotManager.ts` | Tracks which connection owns the left and right slots. |
| `Scripts/Typescript/Bitmoji/AirHockeyBitmojiController.ts` | Loads and animates per-player Bitmoji avatars with IK. |
| `Scripts/Typescript/Bitmoji/IK/FABRIK.ts` | FABRIK solver for three-joint arm chains. |
| `Scripts/Typescript/Bitmoji/IK/NeckTorsoIK.ts` | Rotates the avatar's head and torso to track the puck. |
| `Scripts/Javascript/AirHockeyControllerJS.js` | JavaScript version of the game controller. |

## Extra info
- **Requires:** bundled packages `Icons`, `InteractionKit`, `Motion`, `SnapDecorators`, `SyncKit`, `UIKit`,
  `Utilities` (plus the `Bitmoji 3D` component in `Packages/`). Needs internet for the Connected Lens session.
  Test multiplayer in Lens Studio with two Preview panels (each takes a paddle; move it with the mouse); on
  Specs, use the colocated joining flow.
- **Get started:** open `Assets/Scene.scene`; configure the `SessionController [CONFIGURE_ME]` object and start
  reading from the `AirHockeyController` object.
- **More docs:** [../README.md](../README.md) — overview, key scripts and testing steps.
