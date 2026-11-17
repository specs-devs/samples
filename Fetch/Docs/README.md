# Fetch

## What it is
A small sample project that shows how to make HTTP requests from a Specs Lens with the Internet Module. An
animated cat fetches a random fact from a public web API each time you pinch it and shows the result in a
thought bubble. It is for developers who want a minimal, readable starting point for `fetch` in Lens Studio.

## What it does
1. After the guide panel is dismissed, a cat sits in the scene with a hint image.
2. Point at the cat and pinch: if internet is available, the cat stands up, the hint fades out and a thought
   bubble slides up and fades in.
3. `FetchCatFacts` sends a GET request to `https://catfact.ninja/fact?max_length=93` and the returned fact is
   written into the thought bubble.
4. Pinch again to fetch a new fact.
5. Without internet the bubble says the cat can't share its secrets; if the connection drops or the Lens is
   paused, the cat goes back to sleep, and it wakes up again when the connection or Lens resumes.

## Highlights
- Uses `require("LensStudio:InternetModule")` and `internetModule.fetch(...)` with a JSON response.
- Results are delivered through a small typed `Event` class (`catFactReceived`) so UI and networking stay separate.
- Reacts to `deviceInfoSystem.onInternetStatusChanged` and to Lens pause / resume events.
- Cat animation states (`stand`, `sleep`) driven through an animation state machine.
- Bubble and text fades use the Interaction Kit (SIK) `animate` utility.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/FetchCatFacts.ts` | Fetches a cat fact from the remote API and invokes `catFactReceived`. |
| `Scripts/CatFactAnimator.ts` | Handles the pinch, internet status, cat animation states and thought-bubble animation. |
| `Scripts/Events.ts` | Minimal typed event class used to broadcast fetch results. |

## Extra info
- **Requires:** bundled packages `Icons`, `InteractionKit`, `Motion`, `SnapDecorators`, `UIKit`, `Utilities`.
  Needs internet access. Works in the Lens Studio Preview (click the cat to simulate a pinch) and on Specs.
- **Get started:** open `Assets/Scene.scene`; the logic sits on the `FetchCatFacts` and `CatFactAnimator`
  objects next to the `Kitty` model.
- **More docs:** [../README.md](../README.md) — overview and testing steps.
