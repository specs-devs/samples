# Depth Cache

## What it is
A sample project that shows how to cache depth frames on Specs so that pixel coordinates can be projected into
the 3D world after a delay. This matters for cloud vision models: by the time a response arrives the user has
moved, but the cached depth frame and its camera pose still map image-space results back to the right place.
The sample uses Gemini through the Remote Service Gateway; the same approach works with any model that returns
pixel coordinates.

## What it does
1. After the guide panel is dismissed, a microphone button floats in front of the user.
2. Pinch or tap the button and speak a query such as "What objects do you see?"; speech is transcribed with
   the ASR Module.
3. When the transcription arrives, the Lens saves the latest depth frame paired with the closest color camera
   frame, shows a loading indicator and sends the camera image plus the query to Gemini (`gemini-2.5-pro`).
4. Gemini returns a message and a list of labelled points; the message appears in a response bubble.
5. Each point is projected into world space with the cached depth frame and a world label (or a world arrow,
   when the response asks for one) scales into place at that position. The cached frame is then disposed.

## Highlights
- `DepthCache.ts` aligns the depth stream and color camera stream by timestamp and keeps snapshots by ID.
- Projection uses the cached frame's device camera and pose, so results land correctly even after head movement.
- Gemini is asked for structured JSON (message, labelled points, optional arrow), parsed in `GeminiAPI.ts`.
- Optional debug overlay (`showDebugVisuals` on `SceneController`) plots Gemini's pixel points over the camera frame.
- Editor fallbacks: without depth frames in the Preview, labels are placed on a simulated plane in front of the
  camera; without camera frames, a red-dot simulation verifies the debug overlay wiring.
- Credentials warning panel and API key hint when the Remote Service Gateway token is not set.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/DepthCache.ts` | Pairs depth and camera frames, saves snapshots and projects pixels to world positions. |
| `Scripts/SceneController.ts` | Orchestrates speech → depth snapshot → Gemini request → world labels. |
| `Scripts/GeminiAPI.ts` | Encodes the camera frame and sends it to Gemini, parsing labels and points from the JSON reply. |
| `Scripts/ASRController.ts` | Runs the ASR session and exposes partial and final transcription events. |
| `Scripts/SpeechUI.ts` | Microphone button and speech feedback in front of the user. |
| `Scripts/ResponseUI.ts` | Response bubble and instantiation of world labels / arrows. |
| `Scripts/WorldLabel.ts` | Floating label that scales in after a random delay. |
| `Scripts/DebugVisualizer.ts` | Debug overlay of pixel-space points on the camera frame texture. |

## Extra info
- **Requires:** bundled packages `Icons`, `SpectaclesInteractionKit`, `Motion`, `RemoteServiceGateway`, `SnapDecorators`,
  `SpectaclesUIKit`, `Utilities`. Needs a Remote Service Gateway token on `RemoteServiceGatewayCredentials`, internet
  access and the Specs camera. Depth frames are only delivered on device; the Lens Studio Preview runs the
  simulated fallbacks described above.
- **Get started:** open `Assets/Scene.scene` and start from the `SceneController` object.
- **More docs:** [../README.md](../README.md) — overview, setup and testing steps.
