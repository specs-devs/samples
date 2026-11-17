# Spatial Image Gallery

<!-- tags -->
[![SIK](https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview) [![Materials & Shaders](https://img.shields.io/badge/Materials%20%26%20Shaders-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/features/graphics/materials/overview) [![3D Rendering & Meshes](https://img.shields.io/badge/3D%20Rendering%20%26%20Meshes-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/features/graphics/rendering-overview) [![Depth](https://img.shields.io/badge/Depth-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/features/ar-tracking/world/world-mesh-and-depth-texture) [![Spatial Image](https://img.shields.io/badge/Spatial%20Image-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/apis/spatial-image)
<!-- /tags -->

<!-- Preview GIF: place sample-list-spatial-image-rounded-edges.gif in README-ref/ -->

## Overview

Spatial Image Gallery demonstrates how to upload a flat photo and receive a 3D spatialized mesh using the Snap Spatial Image API. The sample showcases depth animation, angle-based depth flattening, and an auto-advancing multi-image gallery. Viewing angle is continuously monitored so the image flattens gracefully when observed from extreme perspectives. Learn more about Spatial Images in the [Snap developer docs](https://developers.snap.com/spectacles/about-spectacles-features/apis/spatial-image).

> **NOTE**: This project will only work for the SPECS platform.

## Design Guidelines

Designing Lenses for SPECS offers all-new possibilities to rethink user interaction with digital spaces and the physical world.
Get started using our [Design Guidelines](https://developers.snap.com/spectacles/best-practices/design-for-spectacles/introduction-to-spatial-design)

## Prerequisites

- **Lens Studio**: v5.24+

**Note:** Ensure Lens Studio is [compatible with SPECS](https://ar.snap.com/download) for your SPECS device and OS versions.

- **SPECS OS Version**: v7.0+
- **SPECS App iOS**: v1.7+
- **SPECS App Android**: v1.7+


To update your SPECS device and mobile app, please refer to this [guide](https://support.spectacles.com/hc/en-us/articles/30214953982740-Updating).

You can download the latest version of Lens Studio from [here](https://ar.snap.com/download?lang=en-US).

## Getting Started

To obtain the project folder, clone the repository.

> **IMPORTANT:**
> This project uses Git Large Files Support (LFS). Downloading a zip file using the green button on GitHub **will not work**. You must clone the project with a version of git that has LFS.
> You can download Git LFS [here](https://git-lfs.github.com/).

## Initial Project Setup

The project should be pre-configured to get you started without any additional steps. However, if you encounter issues in the Logger Panel, please ensure your Lens Studio environment is set up for [SPECS](https://developers.snap.com/spectacles/get-started/start-buiding/preview-panel).

> **Remote Service Gateway**
> To access the spatialization service, a gateway credential is required. Follow the instructions [here](https://developers.snap.com/spectacles/about-spectacles-features/apis/remoteservice-gateway) to obtain a credential and enter it in the **RemoteServiceGatewayCredentials** SceneObject. The Spatial Image API example needs only the **Snap** token; the OpenAI and Google tokens can stay as placeholders.
>
> The sample ships without a token, so on Play a red-framed **Credentials needed** panel ([CredentialsWarning.ts](./Assets/Scripts/CredentialsWarning/CredentialsWarning.ts)) appears before the guide and lists what is missing. Pinch **Continue without credentials** to go on to the guide anyway (the Spatial Image API example won't spatialize until the token is set). Once the Snap token is set, the panel no longer appears and the guide shows directly.

## Key Script

[SpatialGallery.ts](./Assets/Scripts/SpatialGallery.ts) - Drives the gallery: shuffles the images, calls `setImage` on the spatializer (and the flat placeholder) for each one, and advances to the next image a few seconds after it has spatialized.

[SpatialImageFrame.ts](./Assets/Scripts/SpatialImageFrame.ts) - Acts as the central manager, setting each image and its focal point and coordinating the spatializer, swapper, and focal-point tracking.

[SpatialImageSwapper.ts](./Assets/Scripts/SpatialImageSwapper.ts) - Handles the visual swap between the flat placeholder image and the returned spatialized mesh once loading completes.

[SpatialImageDepthAnimator.ts](./Assets/Scripts/SpatialImageDepthAnimator.ts) - Animates the depth scale of the spatialized image, easing it in on load and flattening it when the viewing angle becomes invalid.

[SpatialImageAngleValidator.ts](./Assets/Scripts/SpatialImageAngleValidator.ts) - Continuously measures the camera angle relative to the image and fires callbacks when the user enters or exits the valid viewing zone.

## Testing the Lens

### In Lens Studio Editor

1. Open the project in Lens Studio and ensure the **RemoteServiceGatewayCredentials** SceneObject has a valid API token.
2. Select the **Preview** panel and set the device type to SPECS.
3. Press **Play** — the first image in the gallery will be spatialized and the depth effect will animate in.
4. If the red **Credentials needed** panel appears, set the Snap token (or pinch **Continue without credentials**). Pinch **Ok, I understood** on the guide, then use **Previous** / **Next** on the panel to switch between the four examples. In the Spatial Image API example the gallery moves to the next image by itself a few seconds after each one has spatialized; the flat photo is shown until then.

### In SPECS Device

1. Push the Lens to your SPECS using the Lens Studio push workflow.
2. Ensure your device has an active internet connection so the spatialization service can be reached.
3. Launch the Lens and wait for the first image to spatialize — the flat placeholder will be replaced by the 3D mesh.
4. Pinch **Previous** / **Next** on the panel to switch examples, let the gallery advance through its images, and physically move your head to observe the angle-based depth flattening.

## Support

If you have any questions or need assistance, please don't hesitate to reach out. Our community is here to help, and you can connect with us and ask for support [here](https://www.reddit.com/r/Spectacles/). We look forward to hearing from you and are excited to assist you on your journey!

## Contributing

Feel free to provide improvements or suggestions or directly contributing via merge request. By sharing insights, you help everyone else build better Lenses.

---

 

​

​

​

​

​

---

*Built with 👽 by the SPECS team*
