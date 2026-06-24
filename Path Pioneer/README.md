# Path Pioneer

[![SIK](https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?) [![Raycast](https://img.shields.io/badge/Raycast-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.RayCastHit.html) [![Graphics Material Particles](https://img.shields.io/badge/Graphics%20Material%20Particles-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/features/graphics/materials/overview)

<img src="./README-ref/sample-list-path-pioneer-rounded-edges.gif" alt="path-pioneer" width="500" />

## Overview

Path Pioneer is a sample project demonstrating path creation and path-walking in a TypeScript codebase. Players place a start line on a detected ground surface, walk a route, place a finish line (or close the path into a loop), and then walk the recorded path with real-time pace, lap count, and progress feedback. The project showcases Spectacles raycasting, holographic mesh reconstruction, and the Spectacles Interaction Kit. Learn more about [Spectacles world interaction](https://developers.snap.com/spectacles/about-spectacles-features/apis/world-query).

> **NOTE:** This project will only work for the Spectacles platform and Lens Studio.

> **IMPORTANT:** This project enables you to design and store a walkable path using holographic reconstruction technology. To ensure safety and optimal experience, we recommend choosing an outdoor area that is free from traffic and other potential obstacles. For best results, walking is preferred over running. Stay aware of your surroundings!

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

## Getting Started

To obtain the project folder, clone the repository.

> **IMPORTANT:**
> This project uses Git Large Files Support (LFS). Downloading a zip file using the green button on GitHub **will not work**. You must clone the project with a version of git that has LFS.
> You can download Git LFS [here](https://git-lfs.github.com/).

## Initial Project Setup

The project should be pre-configured to get you started without any additional steps. However, if you encounter issues in the Logger Panel, please ensure your Lens Studio environment is set up for [Spectacles](https://developers.snap.com/spectacles/get-started/start-buiding/preview-panel).

## Key Script

[LensInitializer.ts](./Assets/Scripts/LensInitializer.ts) - Bootstraps the lens session, caches the ground offset from the camera, and orchestrates the path making and walking lifecycle.

[PathMaker.ts](./Assets/Scripts/PathMaker.ts) - Drives the path creation state machine from start line placement through path building to finish line placement or loop closure.

[PathWalker.ts](./Assets/Scripts/PathWalker.ts) - Manages the walking experience including lap counting, pace tracking, progress bar updates, and session end handling.

[BuildingPathState.ts](./Assets/Scripts/PathMakerStates/BuildingPathState.ts) - Controls what the player sees and records while actively building the path, including preview arrows and the dotted trail mesh.

[UI.ts](./Assets/Scripts/UI.ts) - Controls the visibility and transitions of all world-space soft-follow UI panels and the loop lock circle indicator.

## Testing the Lens

### In Lens Studio Editor

1. Open the Preview panel in Lens Studio.
2. Use Interactive Preview, WASD (+QE for elevation), LMB and RMB to move around the scene.
3. Follow in-lens UI prompts to place the start line, walk a path, and place the finish line.

### In Spectacles Device

1. Build and deploy the project to your Spectacles device.
2. Follow the [Spectacles guide](https://developers.snap.com/spectacles/get-started/start-building/preview-panel) for device testing.
3. Follow in-lens UI prompts to detect the ground surface, place the start line, walk your path, and place the finish line or close a loop.

## Support

If you have any questions or need assistance, please don't hesitate to reach out. Our community is here to help, and you can connect with us and ask for support [here](https://www.reddit.com/r/Spectacles/). We look forward to hearing from you and are excited to assist you on your journey!

## Contributing

Feel free to provide improvements or suggestions or directly contributing via merge request. By sharing insights, you help everyone else build better Lenses.

---

*Built with <3 by the Spectacles team*

---
 
