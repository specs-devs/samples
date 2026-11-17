# Spatial Image

## What it is
Spatial Image is a sample project that turns flat photos into 3D on Specs. Its main example sends each photo to the
Snap Spatial Image API and shows the returned spatialized mesh in an auto-advancing gallery, with depth that eases
in and flattens at steep viewing angles. It also includes Gaussian splat playback and on-device ML depth estimation
examples. It is for developers who want to display depth-enhanced imagery in a Lens.

## What it does
1. If the Snap token is missing, a red **Credentials needed** panel appears first; **Continue without credentials**
   goes on to the guide. Pinching **Ok, I understood** on the guide reveals a panel with **Previous** / **Next**.
2. The panel switches between four examples:
   - **Spatial Image API gallery**: the flat photo is shown while it is spatialized, then swapped for the 3D mesh;
     the depth animates in, and a few seconds later the gallery moves on to the next image (optionally shuffled).
   - **Gaussian splat**: a splat imported from a `.ply` file, rendered in 3D.
   - **Gaussian splat sequence**: a sequence of splats played back from its first frame as a spatial video each
     time it is shown.
   - **Depth estimation**: an on-device FastDepth model estimates depth from the camera image and displays it as a
     depth-displaced 3D surface.
3. In the gallery, moving your head off-axis past the valid viewing zone flattens the depth; moving back restores
   it.

## Highlights
- The spatialized image is shown with a faded border, and its focal point is set from the camera distance each
  time it is shown.
- Angle validation and depth animation are separate components, so the flattening behaviour can be reused alone.
- A flat placeholder is shown until the spatialized mesh arrives, so the gallery never shows an empty frame.
- `SpatialAnimationSequence` is a drop-in alternative to `SpatialGallery` that pre-spatializes all frames and then
  plays them back quickly by swapping cached meshes.
- The depth estimation pipeline runs ML inference per frame into an `R32Float` texture consumed by a stereo shader.

## Core scripts
| Script | What it does |
|---|---|
| `Scripts/SpatialGallery.ts` | Optionally shuffles the images, calls `setImage` on the spatializer and placeholder, and advances after each spatializes. |
| `Scripts/SpatialImageFrame.ts` | Wraps the `SpatialImage` spatializer: sets the image and the focal point from the camera distance. |
| `Scripts/SpatialImageSwapper.ts` | Swaps the flat placeholder for the spatialized mesh once loading completes. |
| `Scripts/SpatialImageDepthAnimator.ts` | Eases depth in on load and flattens it when the viewing angle is invalid. |
| `Scripts/SpatialImageAngleValidator.ts` | Measures the camera angle to the image and fires enter / exit callbacks for the valid zone. |
| `Scripts/GaussianSplatPlayer.ts` | Restarts a Gaussian splat sequence whenever its object is shown. |
| `Scripts/SpatialAnimationSequence.ts` | Pre-spatializes gallery frames and plays them back as a sequence. |
| `ExperimentalDepthEstimation/Scripts/MLDepthEstimator.ts` | Runs FastDepth ML inference on video frames into a depth texture. |
| `ExperimentalDepthEstimation/Scripts/DepthStereoController.ts` | Feeds the depth and color textures to the stereo depth material. |
| `Scripts/CredentialsWarning/CredentialsWarning.ts` | Lists missing Remote Service Gateway credentials before the guide. |

## Extra info
- **Requires:** Icons, InteractionKit, Motion, RemoteServiceGateway, SnapDecorators, UIKit, Utilities. The Spatial
  Image API example needs an internet connection and a **Snap** token on the `RemoteServiceGatewayCredentials`
  object (OpenAI and Google tokens are not needed). Built for Specs; the API gallery can also be tried in the Lens
  Studio Preview with the device type set to Specs.
- **Get started:** open `SpatialImage.esproj` (`Assets/Scene.scene`), set the Snap token, press Play. Each example
  is a prefab in `Prefabs/` (for example `SpatialImageGallery-API.prefab`).
- **More docs:** [../README.md](../README.md).
