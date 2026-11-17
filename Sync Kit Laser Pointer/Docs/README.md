# Laser Pointer

## What it is
A Connected Lens sample built with Interaction Kit (SIK) and Sync Kit in which users point at a shared virtual
object and leave short-lived colored laser-pointer marks on it. Every participant in the session sees the marks
the others create. It is a compact example of spawning networked objects with the Sync Kit `Instantiator` and
driving them from an interactor.

## What it does
1. Choose `Multiplayer` (or solo) from the start menu to join a Connected Lens session.
2. Point at the jug and pinch: a pointer mark is instantiated over the network at the aim point.
3. While the pinch is held, the mark follows the interactor's hit position on the object.
4. After release the mark stays fully visible for one second, fades out over the next second and is destroyed.
5. Other users in the session see the marks appear, move and disappear.

## Highlights
- `PointerCreation.ts` spawns pointers with `Instantiator.instantiate`, placing them directly at the interactor's
  `targetHitPosition` so they never flash at the world origin.
- Pointers are instantiated with `Ephemeral` persistence, so short-lived marks are not restored when someone joins.
- Only the owner of a pointer (`doIOwnStore()`) updates it each frame; the transform is synced to the others.
- Each pointer gets a random hue (HSL converted to RGB) and fades by alpha before destroying itself.
- After release the last hit position is re-applied every frame so transform interpolation can't drag the
  fading mark back toward its spawn point.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/PointerCreation.ts` | Listens for triggers on the target interactable and instantiates networked pointers. |
| `Scripts/Pointer.ts` | Position, color, fade-out and self-destruction of one pointer instance. |

## Extra info
- **Requires:** bundled packages `Icons`, `InteractionKit`, `Motion`, `SnapDecorators`, `SyncKit`, `UIKit`,
  `Utilities`. Needs internet for the Connected Lens session. Test with several Lens Studio Preview panels
  (select `Multiplayer` in each, click the jug), or with several Specs in the same session.
- **Get started:** open `Assets/Scene.scene`; configure the `SessionController [CONFIGURE_ME]` and
  `ColocatedWorld [CONFIGURE_ME]` objects, and look at `Prefabs/PointerPrefab.prefab` for the networked mark.
- **More docs:** [../README.md](../README.md) — overview and testing steps.
