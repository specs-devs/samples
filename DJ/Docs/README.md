# DJ

## What it is
DJ is a sample project that turns Specs into a two-deck DJ turntable: you pick tracks, drop records onto decks,
scratch them with your hand and crossfade between them. It shows real-time audio synthesis into an Audio Output
asset, hand-driven vinyl physics, and custom-styled UI Kit controls. It is for developers working on audio,
hand-tracking interactions or custom UI visuals.

## What it does
1. After the guide, a DJ console appears with a **Songs** list of track buttons behind it.
2. Pinch a track: its record pops out of the vinyl box, tinted pink or blue.
3. Grab the record and drag it onto the left or right deck; it snaps into place and that deck starts playing the
   track.
4. Move your hand in a circle over a spinning record to scratch: the hand's direction and speed drive the record's
   rotation and the playback rate of that deck. When your hand moves away, the record returns to normal playback
   while the scratch momentum decays out.
5. Drag the sliders to set each deck's speed and the crossfade between deck 1 and deck 2.

## Highlights
- `AudioController` mixes two decks sample by sample at variable rate and enqueues the result into an Audio Output
  track asset.
- When a device build exposes no decoded PCM from the audio track assets, the mixer loads base64-embedded PCM data
  (`EmbeddedTracks/`) instead, keeping pitch and scratch working; if that is incomplete it falls back to direct
  `AudioComponent` playback (volume and pause only, no variable speed).
- `VinylRotator` combines hand input, an inertia model and smoothing filters, with tweened pause and resume.
- A line-projection script turns an `InteractableManipulation` handle into a 0–1 (or 0–2) slider that calls a method
  such as `setSpeed` or `setVolume` on another script.
- `UIKitCustomVisualsFrame` and `UIKitCustomVisualsRectangleButton` show how to replace UI Kit's default visuals with
  gradient `RoundedRectangle` panels.
- Includes a small TWEEN engine (`TweenManager`) driven every frame.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/FloatArrayWrapper/AudioController.ts` | Dual-deck audio engine: track loading, variable-rate mixing, crossfade volume, fallbacks. |
| `Scripts/FloatArrayWrapper/VinylRotator.ts` | Rotates a deck's record from hand input with inertia and sets that deck's playback rate. |
| `Scripts/FloatArrayWrapper/HandController.ts` | Tracks the closest hand around the record center to get scratch direction and speed. |
| `Scripts/FloatArrayWrapper/VinylInteraction.ts` | Drag-and-snap of the movable record onto the left or right deck, with color feedback. |
| `Scripts/FloatArrayWrapper/VolumeController.ts` | `setVolume()` crossfader between deck 1 and deck 2. |
| `CustomUI/Scripts/InteractableManipulatorController.ts` | Projects a manipulated handle onto a line and forwards the value as a slider. |
| `CustomUI/UIKitCustomVisualsRectangleButton.ts` | Custom gradient visuals for UI Kit rectangle buttons. |
| `Scripts/TweenManager/TweenManager.ts` | Runs the TWEEN engine and exposes start / stop / pause / resume helpers. |

## Extra info
- **Requires:** Icons, InteractionKit, Motion, SnapDecorators, UIKit, Utilities. Built for Specs; hand tracking
  features use Experimental APIs and Extended Permissions on the device. In the Lens Studio Preview you can test
  track selection, deck snapping and rotation with the simulated hands. Clone with Git LFS.
- **Get started:** open `DJ.esproj` (`Assets/Scene.scene`) and follow the example carousel; the four bundled loops
  live in `Assets/Audio`.
- **More docs:** [../README.md](../README.md) for setup and testing steps.
