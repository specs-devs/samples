# Shared Sync Controls

## What it is
Shared Sync Controls is a sample Connected Lens for Specs that keeps UI Kit controls in sync for everyone in a
session: three RGB sliders, a text input field and a button. It shows how to share UI state through a single
Sync Kit realtime store (`GeneralDataStore`) without per-object sync entities. It is for developers building
collaborative panels or shared settings.

## What it does
1. After the guide, the Sync Kit start menu lets you start a multiplayer session (**Multiplayer**) or play alone
   (**Solo**).
2. When the session is ready, `UIKitSyncManager` looks for a realtime store with the ID `UIKitSyncManager`. The
   first user creates it and seeds it with the current UI values ("User A"); users who join later find it and load
   its values into their UI ("User B").
3. The control panel then appears:
   - Moving the R, G or B slider writes the value to the store and tints the floating object for everyone.
   - Editing the text field shares the text with everyone.
   - Pressing the button shows "User A Clicked" or "User B Clicked" on every device.
4. Remote changes arrive through `onRealtimeStoreUpdated`; updates made by the local device are ignored.

## Highlights
- One component, one store: all shared state lives under five keys (`COLOR_R`, `COLOR_G`, `COLOR_B`, `SYNC_TEXT`,
  `BUTTON_TEXT`).
- The store is created unowned with session persistence, so any user can write to it.
- Guards stop programmatic slider and text updates from echoing back into the store.
- Uses UI Kit `Slider`, `TextInputField` and `RectangleButton` events directly (`onValueChange`, `onTextChanged`,
  `onTriggerUp`).
- The panel stays hidden until `SessionController` reports the session is ready.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/UIKitSyncManager.ts` | Creates or joins the shared store and binds the sliders, text field and button to it. |
| `Scripts/GuideDismissPanel/GuideDismissPanel.ts` | Shows the project guide and reveals the content when you dismiss it. |
| `Scripts/ExampleCarousel/ExampleCarousel.ts` | Shared example-carousel helper shipped with the project (not used in this scene). |

## Extra info
- **Requires:** Icons, InteractionKit, Motion, SnapDecorators, SyncKit, UIKit, Utilities. Built for Specs and
  Connected Lenses. In Lens Studio, open two Interactive Previews and press **Multiplayer** in both to join the
  same session; on device, connect two Specs to the same session. Clone with Git LFS.
- **Get started:** open `SKSharedSyncControls.esproj` (`Assets/Scene.scene`); the controls (`SyncSliders`,
  `SyncText`, `SyncButtons`) are wired on the `UIKitSyncManager` object.
- **More docs:** [../README.md](../README.md) for testing steps.
