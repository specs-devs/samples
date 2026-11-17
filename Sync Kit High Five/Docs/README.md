# High Five

## What it is
High Five is a Connected Lenses sample project built on Sync Kit. Two colocated users raise their right hands and
high five; the Lens shares each user's hand position in real time, detects when the hands meet, and celebrates with
a bubble showing the friend's name. It is for developers learning how to synchronize tracked-hand data between
Specs users.

## What it does
1. A guide panel explains the Lens; dismissing it shows a panel describing how to play.
2. You pick **Solo** or **Multiplayer** in the Sync Kit session start flow; in Multiplayer you join a shared,
   colocated session with a friend in the same room.
3. Once the colocated session starts, a box follows the palm center of your right hand whenever it is tracked.
4. Your hand position (relative to the box's parent) is written to a shared realtime store under a per-user key,
   and every client keeps a list of the other users' hand data, removing users who disconnect.
5. When your hand and a friend's hand come within 10 cm of each other, a bubble appears near your hand reading
   **HIGH FIVE! from <friend's name>** and pops after a few seconds.

## Highlights
- `EntryPointMain` waits for `SessionController.notifyOnStartColocated` before starting, so all hand data is
  compared in the shared colocated space.
- Hand data is a small JSON record (`connectionID`, `isActive`, `x`, `y`, `z`) keyed by connection ID in a
  persistent realtime store.
- Losing hand tracking publishes the hand as inactive, so a stale position cannot trigger a high five.
- Logic is plain classes (`HandSynchronization`, `HighFiveController`, `DataSynchronizationController`) wired from
  Inspector-configured `*Input` components.
- Friend names come from the session's active user info (`displayName`).

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/EntryPointMain/EntryPointMain.ts` | Creates the controllers and starts them when the colocated session begins. |
| `Scripts/HighFiveControls/HandSynchronization/HandSynchronization.ts` | Tracks the right palm, moves the box and emits hand position updates. |
| `Scripts/HighFiveControls/SyncControls/DataSynchronizationController.ts` | Creates the realtime store and syncs local and remote hand data. |
| `Scripts/HighFiveControls/SyncControls/RealtimeStoreKeys.ts` | Store key helpers and the hand position data shape. |
| `Scripts/HighFiveControls/HighFiveController/HighFiveController.ts` | Compares hand positions and triggers the high-five bubble. |
| `Scripts/HighFiveControls/BubbleAnimationController/BubbleAnimationController.ts` | Shows, animates and pops the bubble with the friend's name. |

## Extra info
- **Requires:** Icons, InteractionKit, Motion, SnapDecorators, SyncKit, UIKit, Utilities. Two Specs in the same
  session (see the Connected Lenses guide), or two Interactive Previews in Lens Studio with **Multiplayer**
  selected and Webcam mode to use your hand. Extended Permissions may be needed for some APIs on device.
- **Get started:** open `SKHighFive.esproj` (`Assets/Scene.scene`); the `EntryPointMain` component and its input
  components hold all the wiring.
- **More docs:** [../README.md](../README.md).
