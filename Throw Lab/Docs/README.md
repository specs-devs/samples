# Throw Lab

## What it is
Throw Lab is a sample project that shows realistic grab-and-throw mechanics on Specs using hand tracking and
physics. It supports three object types (balls, a tennis racket and darts), each with its own grab gesture, hold
behavior and throw logic, built from small reusable components. It is for developers adding physical, hand-driven
object interactions to their Lenses.

## What it does
1. After the guide, a tray of tools appears in front of you, low down: tennis balls, darts and a racket, with a
   dartboard ahead. 3D hand hints show the gestures.
2. Bring your index finger and thumb to a ball or dart and pinch to pick it up; it follows your fingertip.
3. Move your hand and open your fingers to throw. The throw force comes from your hand's velocity plus a base
   force along your finger.
4. Darts aim at the board while held and are thrown toward it. A straight enough hit sticks the dart in the board
   with a hit sound; a steep hit bounces off.
5. Close your whole hand (grab gesture) on the racket to hold it. A ball launcher fires tennis balls toward you every
   few seconds to hit back.
6. When a tool is taken or moves away from its spot on the tray, a new one is spawned there. Dropped objects are
   destroyed after a while, and collisions play impact sounds scaled by speed.
7. In the Lens Studio Preview, click and hold an object with the mouse to grab it, drag, and release to throw.

## Highlights
- One `GestureManager` detects fingertip overlaps and dispatches pinch / grab begin and end to the touched
  `GrabbableObject`.
- `GrabbableObject` has an `objectType` (`Ball`, `Racket`, `Darts`) that selects the gesture, hold rotation and
  throw method.
- `MatchTransform` smoothly follows the hand target and eases from the grab point to a comfortable hold distance.
- Grabs are released if pinch strength drops below a threshold.
- Outline highlight on grabbed objects via `GrabbableOutlineFeedback`.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/GestureManager.ts` | Hand tracking, fingertip overlap detection, pinch / grab events and editor mouse input. |
| `Scripts/GrabbableObject.ts` | Grab state, physics toggling, velocity-based throws and per-type rotation. |
| `Scripts/MatchTransform.ts` | Lerps position and rotation toward the hand target with a hold offset. |
| `Scripts/DartStick.ts` | Sticks a dart to the board when the hit angle is within the limit, else bounces it. |
| `Scripts/ToolPickerBehavior.ts` | Respawns tools at their spawn points when taken or moved out of range. |
| `Scripts/BallInstantiator.ts` | Spawns balls at an interval and launches them toward a target with an impulse. |
| `Scripts/CollisionSound.ts` | Plays an impact sound with volume scaled by collision speed. |
| `Scripts/GrabbableOutlineFeedback.ts` | Adds an outline to an object's meshes while it is grabbed. |

## Extra info
- **Requires:** [Prefab Preview Environment], HandHints3D, Icons, InteractionKit, Motion, SnapDecorators, UIKit,
  Utilities. Built for Specs (hand tracking and physics); the Lens Studio Preview supports mouse grabbing. Clone
  with Git LFS.
- **Get started:** open `ThrowLab.esproj` (`Assets/Scene.scene`). The tools are the prefabs in `Assets/Prefabs`
  (`TennisBall`, `Dart1`, `Dart2`, `TennisRacket`, `DartBoard`, `TennisBallInstantiator`).
- **More docs:** [../README.md](../README.md) for setup and testing steps.
