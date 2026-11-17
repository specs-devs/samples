# Custom Locations

## What it is
Custom Locations is a sample project that anchors AR content to a real-world place that has been scanned with
Custom Locations. It ships localized against a scanned location in London and shows how to switch content on and
off based on how close the user is and whether the spot is in view. It is for developers building location-bound
experiences on Specs.

## What it does
1. A guide panel explains the Lens; pressing **Ok, I understood** dismisses it and shows a minimized carousel panel
   with a one-line description of the experience.
2. A `Custom Location Group` under `LocationRoot` holds three scanned areas (`Located At`), each with an animal
   attached: a fox, a red panda and a kitty.
3. When the device localizes against an area, its listeners are told it was found.
4. Walking within range of an area while looking at it makes its animal scale in and play a glitter sound effect.
5. Walking further away (beyond the activation distance times a multiplier) scales the animal out and stops the
   sound.
6. On device the scan meshes are hidden; in Lens Studio they stay visible so you can place content against them.

## Highlights
- A small `LocatedObject` interface (`activate`, `deactivate`, `localize`) lets any script react to a location.
- Activation uses 2D distance to the location center plus `Camera.isSphereVisible`, with hysteresis between the
  activation and deactivation distances to avoid flicker.
- In the Lens Studio Preview the location counts as localized, so moving the preview camera simulates approaching
  the content.
- Each area is configured purely in the Inspector: center object, listener list, radius and distances.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/ActivateWhenInCameraView.ts` | Tracks the user against a `LocatedAtComponent` and calls activate / deactivate / localize on its listeners. |
| `Scripts/LocatedObject.ts` | Interface implemented by objects bound to a location. |
| `Scripts/ScaleInLocatedObject.ts` | Scales content in on activate and out on deactivate. |
| `Scripts/AudioLocatedObject.ts` | Plays an audio component on activate and stops it on deactivate. |
| `Scripts/DeactivateLocationMeshOnDevice.ts` | Disables the scan meshes of a `CustomLocationGroup` on device only. |
| `Scripts/GuideDismissPanel/GuideDismissPanel.ts` | Shows the guide panel and reveals the rest of the Lens when dismissed. |
| `Scripts/ExampleCarousel/ExampleCarousel.ts` | UI Kit panel that describes the experience. |

## Extra info
- **Requires:** Icons, InteractionKit, InteractionKitExamples, Motion, SnapDecorators, UIKit, Utilities. Specs only
  for real localization; the content only appears at the scanned place, so to test on device you must scan your own
  location, publish a Custom Location Group and replace the Group ID on `LocationRoot`.
- **Get started:** open `Assets/Scene.scene`, select `LocationRoot` / `Custom Location Group`, and follow the setup
  steps in the project README to attach your content and the scripts above to each `Located At` object.
- **More docs:** [../README.md](../README.md).
