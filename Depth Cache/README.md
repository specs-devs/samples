# Depth Cache

[![SIK](https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview) [![Remote Service Gateway](https://img.shields.io/badge/Remote%20Service%20Gateway-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/overview) [![ASR](https://img.shields.io/badge/ASR-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/apis/asr-module) [![AI](https://img.shields.io/badge/AI-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list) [![Depth](https://img.shields.io/badge/Depth-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/features/ar-tracking/world/world-mesh-and-depth-texture) [![AR Tracking](https://img.shields.io/badge/AR%20Tracking-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list) [![Object Tracking](https://img.shields.io/badge/Object%20Tracking-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/features/ar-tracking/world/object-tracking)

<img src="./README-ref/sample-list-depth-cache-rounded-edges.gif" alt="Depth Cache" width="500" />

## Overview

The Depth Module API allows caching of depth frames, enabling pixel-to-3D projection even after a delay. This is especially useful for cloud-based vision models — once the results are returned, you can map image-space coordinates back into world space using the cached depth data. This example lens demonstrates that workflow using the spatial reasoning capabilities of Gemini 2.5 Pro Preview, but the same approach can be applied to any vision model that outputs pixel or image-space coordinates. For more details on the Depth API, see the [World Mesh and Depth Texture documentation](https://developers.snap.com/lens-studio/features/ar-tracking/world/world-mesh-and-depth-texture).

> **NOTE:** This project will only work for the Spectacles platform.

## Design Guidelines

Designing Lenses for Spectacles offers all-new possibilities to rethink user interaction with digital spaces and the physical world.
Get started using our [Design Guidelines](https://developers.snap.com/spectacles/best-practices/design-for-spectacles/introduction-to-spatial-design)

## Prerequisites

- **Lens Studio**: v5.15.4+

**Note:** Ensure Lens Studio is [compatible with Spectacles](https://ar.snap.com/download) for your Spectacles device and OS versions.

- **Spectacles OS Version**: v5.64+
- **Spectacles App iOS**: v0.64+
- **Spectacles App Android**: v0.64+


To update your Spectacles device and mobile app, please refer to this [guide](https://support.spectacles.com/hc/en-us/articles/30214953982740-Updating).

You can download the latest version of Lens Studio from [here](https://ar.snap.com/download?lang=en-US).

The camera feature requires you to use Experimental APIs. Please see Experimental APIs for more details [here](https://developers.snap.com/spectacles/about-spectacles-features/apis/experimental-apis).

## Getting Started

To obtain the project folder, clone the repository.

> **IMPORTANT:**
> This project uses Git Large Files Support (LFS). Downloading a zip file using the green button on GitHub **will not work**. You must clone the project with a version of git that has LFS.
> You can download Git LFS [here](https://git-lfs.github.com/).

## Initial Project Setup

The project should be pre-configured to get you started without any additional steps. However, if you encounter issues in the Logger Panel, please ensure your Lens Studio environment is set up for [Spectacles](https://developers.snap.com/spectacles/get-started/start-buiding/preview-panel).

Before running the lens, set your API key in the Remote Service Gateway Credentials component on the relevant SceneObject in the hierarchy.

## Key Script

[DepthCache.ts](./Assets/Scripts/DepthCache.ts) - Listens to a stream of depth frames and color camera frames, aligns them by timestamp, and allows saving a snapshot that can later be used to project pixel coordinates into world space.

[GeminiAPI.ts](./Assets/Scripts/GeminiAPI.ts) - Encodes the camera frame as base64 and sends it to Gemini 2.5 Pro via the Remote Service Gateway, parsing bounding box and label data from the structured JSON response.

[SceneController.ts](./Assets/Scripts/SceneController.ts) - Orchestrates the full request flow: captures a depth frame on speech input, sends the image to Gemini, and places world-space labels at the projected 3D positions.

[DebugVisualizer.ts](./Assets/Scripts/DebugVisualizer.ts) - Optional debug overlay that plots the pixel-space points returned by Gemini over the camera frame texture; enable via `showDebugVisuals` in the SceneController inspector.

## Testing the Lens

### In Lens Studio Editor

1. Open the Preview panel in Lens Studio.
2. Use Interactive Preview — WASD and QE for elevation, LMB and RMB to look around the scene.
3. Input your API key for the Remote Service Gateway in the hierarchy.
4. Pinch or tap the microphone button to start recording, then speak a query such as "What objects do you see?".

### In Spectacles Device

1. Build and deploy the project to your Spectacles device.
2. Follow the [Spectacles guide](https://developers.snap.com/spectacles/get-started/start-building/preview-panel) for device testing.
3. Pinch or tap the microphone button to start recording, then speak a query.
4. World-space labels will appear at the 3D positions of detected objects once the Gemini response arrives.

## Support

If you have any questions or need assistance, please don't hesitate to reach out. Our community is here to help, and you can connect with us and ask for support [here](https://www.reddit.com/r/Spectacles/). We look forward to hearing from you and are excited to assist you on your journey!

## Contributing

Feel free to provide improvements or suggestions or directly contributing via merge request. By sharing insights, you help everyone else build better Lenses.

---

*Built with <3 by the Spectacles team*

---
 
