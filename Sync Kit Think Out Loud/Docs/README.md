# Think Out Loud

## What it is
Think Out Loud is a Connected Lenses sample project for social events, built on Sync Kit, Interaction Kit (SIK) and
UI Kit. Every participant gets a floating status label above their head, can ping other people to connect, and
manages their own status from a palm-activated hand menu. It is for developers learning synced per-player objects,
network events and Cloud Storage persistence on Specs.

## What it does
1. A guide panel explains the Lens; dismissing it shows a panel describing how to play.
2. You pick **Solo** or **Multiplayer**; in Multiplayer you join a session with people nearby.
3. Each player gets a synced player object, synced left and right hand objects (coloured per player) and a head
   label that follows their head pose and shows their name and status.
4. Turning your right palm toward the camera opens the hand menu after a short timed reveal; you type a status and
   press **Update Status**, and your head label updates for everyone.
5. Pinching someone else's head label sends them a ping request; they get a popup to accept or reject.
6. When a ping is accepted, both users' head labels switch to the accepted (blue) material. **Exit Ping** in the
   hand menu disconnects and resets the materials.
7. Status and availability are saved with Cloud Storage and restored when you rejoin.

## Highlights
- Head label data (user name, status, sub-status, availability and ping state) is shared with Sync Kit `StorageProperty` values on a `SyncEntity`, so
  remote labels update through property callbacks.
- The ping flow is three network events on a session-scoped `SyncEntity`: `ping_request`, `ping_response` and
  `ping_connection_update`.
- Player, hand and head label prefabs are instantiated once the session and instantiator are ready, one set per
  player.
- `PlayerColorAssigner` hashes the connection ID so each player gets the same colour on every device and session.
- `HandMenuTester` toggles the hand menu or exits a ping with a tap, for testing without hand tracking.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/HeadLabel/HeadLabelObjectController.ts` | Syncs, positions and styles one player's head label; persists data with Cloud Storage. |
| `Scripts/HeadLabel/HeadLabelObjectManager.ts` | Instantiates and tracks the head labels of all players. |
| `Scripts/HeadLabel/HeadLabelUpdater.ts` | Bridges the hand menu UI to the local player's synced head label. |
| `Scripts/PingMenu/PingMenu.ts` | Sends and receives ping request, response and connection events and updates label materials. |
| `Scripts/HandMenu/HandMenu.ts` | Shows the hand menu when the right palm faces the camera, with show / hide delays. |
| `Scripts/HandMenu/HandMenuController.ts` | Handles hand menu input and updates the head label. |
| `Scripts/Hands/HandObjectManager.ts` | Instantiates the synced left and right hand objects. |
| `Scripts/Player/PlayerObjectManager.ts` | Instantiates the local player's synced object. |
| `Scripts/Utils/PlayerColorAssigner.ts` | Deterministic per-player colour from the connection ID. |

## Extra info
- **Requires:** Icons, InteractionKit, Motion, SnapDecorators, SyncKit, UIKit, Utilities. Two or more Specs on
  different Snapchat accounts for the full experience, or Multi-User Preview in Lens Studio with the device type
  set to Specs. Uses Cloud Storage to persist status between sessions.
- **Get started:** open `SKThinkOutLoud.esproj` (`Assets/Scene.scene`); the managers in the scene instantiate the
  `PlayerObject`, hand object and `HeadLabel` prefabs from `Prefabs/`.
- **More docs:** [../README.md](../README.md).
