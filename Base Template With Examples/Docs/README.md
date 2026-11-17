# Base Template With Examples

## What it is
A starter sample project for Specs: the Base Template pre-populated with ready-made example content. It wires
Interaction Kit (SIK), UI Kit and the Interaction Kit Examples package into one scene, so you can try common
interaction and UI patterns in the Lens and then build on top of them. It is for developers starting a new
Specs Lens who want working references next to their own content.

## What it does
- On start a guide panel explains the project; pressing its button dismisses it and reveals the examples.
- An example carousel sits below the view and steps through the example groups with Previous / Next buttons,
  showing each example's name and instructions; the "-" / "+" button collapses it to its title bar.
- The example groups in the scene are `[EXAMPLES] Interaction` (manipulation of a box, sphere and mesh and other
  Interaction Kit (SIK) examples), `[EXAMPLES] UI` (UI Kit layouts such as grids, menus, card decks, carousels, chat and modal
  layouts, adaptable text area, rounded rectangle and a video player) and `[EXAMPLES] Rocket Workshop`.
- The video player example is built entirely at runtime by `VideoPlayer.ts` from an assigned video texture.

## Highlights
- Interaction Kit (SIK), UI Kit, SnapDecorators and Utilities already set up in the scene, with hand visuals
  and interactors.
- Examples are listed on the carousel so each one can be tried in the Lens without toggling objects in the editor.
- `VideoPlayer.ts` is a project-owned video player whose timeline is driven by the real `VideoTextureProvider`
  (duration, current time, playback-done), with play / pause / seek / volume / playback-rate controls.
- Examples are re-anchored to the user's head pose when the carousel starts.
- Includes the SpecsSans font family for on-device text.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/ExampleCarousel/ExampleCarousel.ts` | UI Kit carousel that shows one example at a time with its instructions and Previous / Next buttons. |
| `Scripts/GuideDismissPanel/GuideDismissPanel.ts` | Overview guide on a UI Kit Frame; its button hides the guide and reveals the content. |
| `Scripts/VideoPlayer.ts` | Runtime-built video player with transport controls, timeline and volume slider. |

## Extra info
- **Requires:** bundled packages `Icons`, `InteractionKit`, `InteractionKitExamples`, `Motion`, `SnapDecorators`,
  `UIKit`, `Utilities`. Built for Specs; the examples can be explored in the Lens Studio Interactive Preview.
- **Get started:** open `BaseTemplateWithExamples.esproj` and the `Assets/Scene.scene`; add your own content next
  to the `[EXAMPLES]` groups, or remove the groups you don't need.
- **More docs:** [../README.md](../README.md) — project overview, setup and testing.
