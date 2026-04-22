# Laser Pointer

[![SIK](https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?) [![Connected Lenses](https://img.shields.io/badge/Connected%20Lenses-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview?) [![Sync Kit](https://img.shields.io/badge/Sync%20Kit-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-sync-kit/getting-started) [![Multiplayer](https://img.shields.io/badge/Multiplayer-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/features/lens-cloud/lens-cloud-overview?) [![Raycast](https://img.shields.io/badge/Raycast-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.RayCastHit.html)

<img src="./README-ref/sample-list-laser-pointer-rounded-edges.gif" alt="Laser Pointer" width="500" />

## Overview

The Laser Pointer project demonstrates how to create interactive pointers that collide with virtual objects. Users can create colored laser pointer marks that persist for a few seconds before fading away by interacting with an object. This project showcases the Spectacles Interaction Kit (SIK) and Spectacles Sync Kit (SSK), allowing multiple users to see and interact with the object through synchronized pointers in a shared space. Learn more about [Connected Lenses](https://developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview?).

> **NOTE**: This project will only work for the Spectacles platform.

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

[PointerCreation.ts](./Assets/Scripts/PointerCreation.ts) - Spawns networked pointer instances when users interact with the target object, connecting each pointer to its corresponding interactor via the Spectacles Sync Kit Instantiator.

[Pointer.ts](./Assets/Scripts/Pointer.ts) - Manages the position, color, and fade-out behavior of each individual pointer instance, destroying it automatically after it fully fades.

## Testing the Lens

### In Lens Studio Editor

1. Open the project in Lens Studio and enter Preview mode.
2. Select "Multiplayer" in each preview window.
3. Click or tap on the jug to create pointer marks.
4. Observe how pointers fade out after interaction stops.
5. Test with multiple simulated preview windows to verify synchronization.

### In Spectacles Device

1. Build and deploy the project to multiple Spectacles devices.
2. Connect the devices together in the same session.
3. Point at the jug and pinch to create pointer marks.
4. Verify that all users can see pointers created by others.

## Support

If you have any questions or need assistance, please don't hesitate to reach out. Our community is here to help, and you can connect with us and ask for support [here](https://www.reddit.com/r/Spectacles/). We look forward to hearing from you and are excited to assist you on your journey!

## Contributing

Feel free to provide improvements or suggestions or directly contributing via merge request. By sharing insights, you help everyone else build better Lenses.

---

*Built with <3 by the Spectacles team*

---
 
