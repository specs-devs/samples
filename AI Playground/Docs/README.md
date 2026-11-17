# AI Playground

## What it is
AI Playground is a sample project that shows how to call several hosted AI services from a Specs Lens through the
Remote Service Gateway: Gemini Live and OpenAI Realtime voice assistants, text-to-image generation, and Snap3D
text-to-3D generation. It is for developers who want working, inspectable reference code for streaming audio and
video to LLMs, handling function calls, and showing generated images and meshes in the world.

## What it does
1. On launch, a red **Credentials needed** panel lists any Remote Service Gateway tokens (Snap, OpenAI, Google) that
   are not set, then the guide is shown. An example carousel steps through three examples.
2. **Realtime AI:** pinch **Gemini** or **OpenAI** to open a live session. An orb appears next to your left hand;
   pinch it to start or stop streaming the microphone (and, for Gemini, camera frames) to the assistant. Replies
   come back as spoken audio and as text on the orb.
3. Both assistants expose a `Snap3D` function. Ask for a 3D object and the assistant calls it, a Snap3D object is
   generated in front of you, and the result is reported back to the assistant.
4. **Image Generator:** pinch the microphone, describe a picture, and the transcribed prompt is sent to OpenAI or
   Gemini image generation; the image is shown on the panel.
5. **Snap3D generator:** pinch the microphone, describe an object, and Snap3D shows a preview image, then the mesh,
   which you can grab and move.
6. Closing the orb ends the session and brings the Gemini / OpenAI buttons back.

## Highlights
- Gemini Live and OpenAI Realtime run over WebSockets with PCM16 microphone input, dynamic audio output and
  interruption when you deactivate the orb.
- One `AIAssistantUIBridge` drives both assistants through the same `updateTextEvent` / `functionCallEvent` shape.
- Snap3D requests stream `image`, `base_mesh` and optional `refined_mesh` stages into a grabbable prefab.
- The orb follows your hand, can be placed in the world, and falls back to screen space when out of view.
- `PlaygroundLogger` logs every Interaction Kit (SIK) interaction, including runtime-spawned objects, to the console
  and an optional on-screen feed.
- An internet popup and an API key hint warn when connectivity or tokens are missing.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/AIAssistantUIBridge.ts` | Connects Gemini Live / OpenAI Realtime to the orb UI and routes `Snap3D` function calls. |
| `Scripts/GeminiAssistant.ts` | Gemini Live WebSocket session: audio/video streaming, text, audio and function-call responses. |
| `Scripts/OpenAIAssistant.ts` | OpenAI Realtime session: audio streaming, text responses and function calls with call IDs. |
| `Scripts/SphereController.ts` | Hand-following orb with world placement and screen-space fallback. |
| `Scripts/ImageGenerator.ts` | Wraps Gemini and OpenAI image generation into a `Texture` promise. |
| `Scripts/InteractableImageGenerator.ts` | Sends ASR voice queries to `ImageGenerator` and shows the image. |
| `Scripts/Snap3DInteractableFactory.ts` | Creates Snap3D objects from text prompts and manages the generation lifecycle. |
| `Scripts/Snap3DInteractable.ts` | Shows the preview image and final mesh on an interactable object. |
| `Scripts/ASRQueryController.ts` | Single-query voice button that fires an event with the transcribed text. |
| `Scripts/CredentialsWarning/CredentialsWarning.ts` | Shows the **Credentials needed** panel while a token is unset. |

## Extra info
- **Requires:** Icons, InteractionKit, Motion, RemoteServiceGateway, SnapDecorators, UIKit, Utilities. Specs only;
  set the Preview panel's device type to Specs to test in Lens Studio (use headphones to avoid audio feedback).
  Needs Remote Service Gateway tokens (generate them with the Remote Service Gateway Token Generator plug-in and
  paste them on `RemoteServiceGatewayCredentials`), an internet connection, and Experimental APIs for camera
  input. Clone with Git LFS.
- **Get started:** open `Assets/Scene.scene`, fill in the `RemoteServiceGatewayCredentials [EDIT ME]` object, then
  try the examples in the Preview or on Specs.
- **More docs:** [../README.md](../README.md) for setup and testing steps.
