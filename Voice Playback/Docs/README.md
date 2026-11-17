# Voice Playback

## What it is
Voice Playback is a small sample project that records audio from the Specs microphone and plays it back. It shows
how to read raw microphone frames with a `MicrophoneAudioProvider` and replay them through an `AudioOutputProvider`,
driven by two UI Kit buttons. It is for developers who need to capture and replay short voice clips in a Lens.

## What it does
1. A guide panel explains the Lens; dismissing it shows a panel with a short how-to.
2. Pinch and hold **Record** while you speak; recording lasts as long as you hold the pinch. While recording, a text
   readout shows the duration, the size in kB and the sample rate.
3. Let go to stop recording.
4. Pinch **Playback** to hear the recording; the readout shows the playback time against the total length. You
   can replay it as many times as you like.
5. If nothing has been recorded yet, Playback shows a message asking you to record first.
6. Recordings are kept in memory only and are gone once the Lens is closed.

## Highlights
- Microphone audio is captured frame by frame at 44100 Hz into `Float32Array` buffers on each update while
  recording.
- Playback enqueues all recorded frames into an audio output track and stops the `AudioComponent` when the
  recorded duration has elapsed.
- Starting a new recording clears the previous one and stops any playback in progress.
- The buttons are wired with UI Kit `BaseButton` `onTriggerDown` / `onTriggerUp`, so record is press-and-hold.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/MicrophoneRecorder.ts` | Records microphone frames in memory, plays them back and updates the debug text. |
| `Scripts/ActivateMicrophoneRecorder.ts` | Starts recording on button press and stops it on release. |
| `Scripts/PlaybackMicrophoneRecorder.ts` | Plays back the recorded audio when its button is pressed. |
| `Scripts/GuideDismissPanel/GuideDismissPanel.ts` | Shows the intro guide and reveals the Lens content when dismissed. |

## Extra info
- **Requires:** Icons, InteractionKit, Motion, SnapDecorators, UIKit, Utilities. Built for Specs. In Lens Studio,
  enable live microphone input in the Preview so the Lens receives microphone data. Long recordings grow in memory,
  so keep clips short.
- **Get started:** open `VoicePlayback.esproj` (`Assets/Scene.scene`); the `MicrophoneRecorder` component takes a
  microphone audio track asset and an audio output track asset.
- **More docs:** [../README.md](../README.md).
