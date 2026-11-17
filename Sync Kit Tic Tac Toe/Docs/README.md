# Tic Tac Toe

## What it is
A two-player Connected Lens sample built with Sync Kit and Interaction Kit (SIK): a 3D tic-tac-toe game played
on a 3 × 3 × 3 grid of snap points shared between two Specs users. It demonstrates turn-based multiplayer with
sync entities, storage properties, networked events and the Sync Kit `Instantiator`. It is for developers
learning how to keep game state consistent across devices.

## What it does
1. Choose `Multiplayer` to join a colocated Connected Lens session; the players are assigned the X and O roles.
2. When it is your turn, an X or O piece is spawned for you with the `Instantiator`.
3. Grab the piece and move it into the grid; released near a snap point, it eases into place with a snap sound.
4. Once placed the piece is locked, the grid state is synced, and the turn passes to the other player.
5. The game checks every line through the 3D cube for a win (three in a row in any direction, even across
   layers); winning pieces animate, a result message appears and the synced X / O score text updates.
6. The restart button sends a networked restart event so both players start a new game together.

## Highlights
- The whole grid is stored as one string (`StorageProperty.manualString("gameGrid", ...)`), avoiding custom
  serialization.
- Scores are `StorageProperty.manualInt` values (`xScore`, `oScore`) on a sync entity.
- Restart and presence use `syncEntity.sendEvent` / `onEventReceived` networked events.
- Only the player whose turn it is can translate their piece (`setCanTranslate`).
- `SpatialGrid.ts` uses a flat map for fast lookup of snap points within the snap radius.
- Grid size, spacing and snap distance live in `constants.ts`.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/Controller.ts` | Player role assignment, piece spawning with the `Instantiator`, restart and presence events. |
| `Scripts/GameManager.ts` | Turn logic, 3D win detection and synced score tracking. |
| `Scripts/Piece.ts` | Per-piece manipulation, snapping to grid points and win animation. |
| `Scripts/SyncEntityGrid.ts` | String-based game grid synced through a storage property. |
| `Scripts/SpatialGrid.ts` | Fast spatial lookup of snapping points. |
| `Scripts/GridPosition.ts` | Layer / row / column of one snap point, placed in local space. |
| `Scripts/constants.ts` | Grid dimensions, spacing, offsets and snap distance. |

## Extra info
- **Requires:** bundled packages `Icons`, `InteractionKit`, `Motion`, `SnapDecorators`, `SyncKit`, `UIKit`,
  `Utilities`. Needs internet and two players for the Connected Lens session. Test in Lens Studio with two
  Preview panels (move pieces with the mouse), or on two Specs with the colocated joining flow.
- **Get started:** open `Assets/Scene.scene`; configure the `SessionController [CONFIGURE_ME]` and
  `ColocatedWorld [CONFIGURE_ME]` objects, then read from the `Controller` object.
- **More docs:** [../README.md](../README.md) — overview, key scripts and testing steps.
