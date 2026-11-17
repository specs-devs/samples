# Mobile Kit

## What it is
Mobile Kit is a sample project that shows how a Lens on Specs talks to a companion phone app over Bluetooth Low
Energy using the Mobile Kit. It ships the Lens, sample iOS and Android apps (`app/`), the native SDK sources
(`sdk/`) and API references for all three sides. It is for developers who want to connect their own mobile app to a
Lens.

## What it does
1. The Lens creates a Mobile Kit session through `SpectaclesMobileKitModule` and waits for the phone to connect,
   logging every step on an on-screen log panel.
2. On the phone you bond once through the Specs App, then start a session from the sample app.
3. Once connected, the Lens:
   - sends one-way data (`sendData`),
   - requests `app://digest` to get the connected app's SHA-256 digest so it can be verified,
   - sends a request and shows the app's echoed response,
   - subscribes to the `hello world times` topic and logs each update,
   - loads `spectacleskit://test.png` as an image texture and `spectacleskit://test.glb` as a mesh from the phone
     through the Internet and Remote Media modules, and shows both.
4. If the phone disconnects, the test restarts so the Lens reconnects when it comes back. With `resetAfterDelay`
   on, the session closes after 10 seconds.
5. The example carousel switches between the TypeScript and JavaScript versions of the same test; switching closes
   the previous session.

## Highlights
- The same flow in TypeScript (`MobileKitTest_TS.ts`) and JavaScript (`MobileKitTest_JS.js`).
- Each test run is numbered so callbacks from a stopped run are ignored.
- Remote textures are awaited with `ensureLoaded()` before being assigned to the material.
- Earlier meshes are cleared before a new run so they do not pile up.
- `lens-api.md`, `ios-api.md` and `android-api.md` document sessions, requests, subscriptions, bonding and
  permissions on each side.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/MobileKitTest_TS.ts` | TypeScript test: session, one-way data, digest, request-response, subscription, remote image and mesh. |
| `Scripts/MobileKitTest_JS.js` | The same test in JavaScript. |
| `Scripts/ExampleCarousel/ExampleCarousel.ts` | Steps between the TypeScript and JavaScript examples. |

## Extra info
- **Requires:** Icons, InteractionKit, Motion, SnapDecorators, UIKit, Utilities. Specs only, with a physical iPhone
  or Android phone running the sample app from `app/iOS/SpectaclesKitSample/` (Xcode) or
  `app/Android/SpectaclesKitSample/` (Android Studio). Bonding is done once through the Specs App. The sample apps
  look for the Lens name `SpecsMobileKit` and Lens ID `com.snap.mobilekittest`. The module needs the internet
  permission, so accessing sensitive data at the same time requires Extended Permissions. Clone with Git LFS.
- **Get started:** open `MobileKit.esproj` (`Assets/Scene.scene`), push the Lens to Specs, then bond and start a
  session from the phone app.
- **More docs:** [../README.md](../README.md) for setup steps; `../lens-api.md`, `../ios-api.md` and
  `../android-api.md` for the API references.
