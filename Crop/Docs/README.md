# Crop

## What it is
Crop is a sample project that lets you "crop" the real world with your hands on Specs: you frame an object between
two pinches and the Lens asks an OpenAI vision model what it is. It shows how to combine the Camera Module, hand
tracking from Interaction Kit (SIK), world-to-camera projection, and the Remote Service Gateway. It is for
developers building camera-based AI vision features.

## What it does
1. On launch, a red **Credentials needed** panel appears if the Snap token is not set, then the guide is shown.
2. Pinch with both hands close together: a scanner (crop frame) is spawned between your hands.
3. Keep both pinches held and pull your right hand down diagonally. The frame's corners follow your thumb tips and
   the live camera feed inside the frame is cropped to match.
4. Release both pinches. Frames smaller than 8 cm on a side are discarded; otherwise the cropped image is frozen, a
   loading indicator appears, and the image is sent to OpenAI chat completions with a short "identify this object"
   prompt.
5. The answer (a few words) pops in as a caption above the crop with an elastic scale-in animation.
6. In the Lens Studio Preview, clicking anywhere spawns a scanner in front of the camera and sends a capture.

## Highlights
- Requests the right color camera (default camera in the editor) through `CameraModule` and feeds it into a crop
  texture.
- Virtual cameras mirror the device's tracking camera pose so world points can be projected into camera space.
- `CropRegion` recomputes the crop rectangle from the four corner objects every frame and resets it when a corner
  leaves the image.
- The image is Base64-encoded as JPEG and sent with a capped token count for short captions.
- On request failure the caption shows an error message instead of loading forever.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/PictureController.ts` | Detects a close two-hand pinch and instantiates the scanner prefab (click to test in the editor). |
| `Scripts/PictureBehavior.ts` | Moves the crop corners with your pinches, captures the image on release and requests the caption. |
| `Scripts/CameraService.ts` | Starts the Camera Module, sets up the crop texture and virtual tracking cameras for projection. |
| `Scripts/CropRegion.ts` | Projects the corner objects into camera space and updates the crop rectangle each frame. |
| `Scripts/ChatGPT.ts` | Encodes the captured texture and sends it to OpenAI through the Remote Service Gateway. |
| `Scripts/CaptionBehavior.ts` | Places and animates the caption text above the crop. |
| `Scripts/CredentialsWarning/CredentialsWarning.ts` | Shows the **Credentials needed** panel while the Snap token is unset. |

## Extra info
- **Requires:** Icons, InteractionKit, InteractionKitExamples, Motion, RemoteServiceGateway, SnapDecorators, UIKit,
  Utilities. Specs only. Needs a Remote Service Gateway Snap token on `RemoteServiceGatewayCredentials` (generate it
  with the Remote Service Gateway Token Generator plug-in), an internet connection, Experimental APIs for camera
  access, and Extended Permissions on the device. Clone with Git LFS.
- **Get started:** open `Assets/Scene.scene`, set the token on `RemoteServiceGatewayCredentials`, then click in the
  Preview or push to Specs and pinch with both hands. The scanner is `Prefabs/Scanner.prefab`.
- **More docs:** [../README.md](../README.md) for setup and testing steps.
