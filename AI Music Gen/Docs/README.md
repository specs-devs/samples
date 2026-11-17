# AI Music Gen

## What it is
A sample project that generates short AI music tracks on Specs. The user picks genres, vibes and instruments
from a hand-docked menu (or speaks them), and the Lens turns the selection into a track with Google's Lyria
model through the Remote Service Gateway, plus a matching 3D object made with Snap3D. It is for developers who
want to see a full generate → store → play audio pipeline built on Remote Service Gateway and Snap Cloud.

## What it does
1. A guide panel explains the Lens; a **Credentials needed** panel appears first if the Remote Service Gateway
   tokens or the Snap Cloud project are missing.
2. Show the left palm to the camera to open the category menu (Genres, Vibes, Instruments); each item is a
   button with an emoji and a label. Voice input adds a spoken query to the list as well.
3. Selections appear as chips in a scrolling list; duplicates are ignored and a **Generate** button appears.
4. On **Generate**, Gemini condenses the selections into one Lyria prompt and a display title, and Lyria
   (`lyria-3-clip-preview`) returns a 30-second MP3.
5. The MP3 is uploaded to the `generated-music` Snap Cloud Storage bucket, and the `transcode-to-wav` Edge
   Function converts it to WAV (Specs cannot decode MP3 at runtime).
6. A music object spawns: Gemini derives an object prompt from the title, Snap3D shows a preview image and then
   the generated model, and the track is loaded from its URL and played with **Play** / closed with **Close**.

## Highlights
- Uses Lyria through the same Remote Service Gateway `generateContent` endpoint as Gemini; a legacy inline
  Lyria-002 path is kept behind a toggle on `MusicGenerator`.
- Server-side MP3 → WAV transcode with an Edge Function, falling back to the MP3 URL (with a warning) if it fails.
- Tracks are loaded with `RemoteMediaModule.loadResourceAsAudioTrackAsset` and played on an `AudioComponent`.
- Object pool of 30 reusable prompt chips with ease-out-back / ease-in-back scale animations.
- Voice input through the ASR Module in high-accuracy mode with 1.5 s silence detection.
- Internet availability pop-up and a credentials warning panel that lists what is missing.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/MusicGenerator.ts` | Builds the Lyria prompt with Gemini, generates the track, uploads it to Storage and requests the WAV transcode. |
| `Scripts/MusicObject.ts` | One generated track: Snap3D visualization, audio playback and play / close controls. |
| `Scripts/MusicPlayer.ts` | Plays a loaded audio track through an `AudioComponent` and reports when it finishes. |
| `Scripts/SnapCloudRequirements/SnapCloudRequirements.ts` | Holds the Snap Cloud project and builds the Storage / Functions URLs and headers. |
| `Scripts/SelectionController.ts` | Pooled selection list, duplicate prevention, scroll layout and the Generate button. |
| `Scripts/SecondaryUIController.ts` | Category browsing (Genres, Vibes, Instruments) with a shared pool of `Adder` buttons. |
| `Scripts/HandDockedMenu.ts` | Shows the category menu when the left palm faces the camera. |
| `Scripts/ASRQueryController.ts` | Captures a voice query with the ASR Module. |
| `Scripts/Snap3DObject.ts` | Shows the Snap3D preview image, then swaps in the generated model. |
| `Scripts/CredentialsWarning/CredentialsWarning.ts` | Lists missing Remote Service Gateway tokens and Snap Cloud project before the guide. |

## Extra info
- **Requires:** bundled packages `[Prefab Preview Environment]`, `AiPreviewAgentInspect`, `AiPreviewAgentInteract`,
  `Icons`, `InteractionKit`, `Leaf`, `Motion`, `RemoteServiceGateway`, `SnapDecorators`, `SupabaseClient`, `UIKit`,
  `Utilities`. Needs your own Remote Service Gateway tokens (Snap for Snap3D, Google for Gemini and Lyria) set on
  `RemoteServiceGatewayCredentials`, and a Snap Cloud project assigned to `SnapCloudRequirements` with a public
  `generated-music` bucket, an insert policy for authenticated users and the `transcode-to-wav` Edge Function
  (source in `SnapCloud/functions/transcode-to-wav/index.ts`). Requires internet. In the Preview the hand menu is
  shown automatically and MP3 plays even without the transcode; on device the WAV transcode is required for sound.
- **Get started:** open `Assets/Scene.scene`; the pipeline lives on the `MusicGenerator` object. Background and
  design notes are in `Assets/Scripts/SnapCloud-Music-Setup.md`.
- **More docs:** [../README.md](../README.md) — setup, Snap Cloud configuration and testing steps.
