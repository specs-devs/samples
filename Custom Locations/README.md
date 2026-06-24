# Custom Locations

[![SIK](https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?) [![Location AR](https://img.shields.io/badge/Location%20AR-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/apis/custom-locations)

<img src="./README-ref/sample-list-custom-locations-rounded-edges.gif" alt="custom-locations" width="500" />

## Overview

This project contains a sample application built to localize against a location in London. It demonstrates how to use Custom Locations to anchor AR content to a real-world scanned location, and showcases activation and deactivation of content based on user proximity and camera view. Learn more about [Custom Locations](https://developers.snap.com/spectacles/about-spectacles-features/apis/custom-locations).

> **NOTE:**
> This project will only work for the Spectacles platform.

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

[ActivateWhenInCameraView.ts](./Assets/Scripts/ActivateWhenInCameraView.ts) - Tracks the user's position and calls activate/deactivate on attached LocatedObject listeners based on proximity and camera visibility.

[ScaleInLocatedObject.ts](./Assets/Scripts/ScaleInLocatedObject.ts) - Animates a scene object scaling in and out when the location is activated or deactivated.

[DeactivateLocationMeshOnDevice.ts](./Assets/Scripts/DeactivateLocationMeshOnDevice.ts) - Hides the CustomLocationGroup scan meshes on device while keeping them visible in Lens Studio.

[AudioLocatedObject.ts](./Assets/Scripts/AudioLocatedObject.ts) - Plays an audio component when the location is activated and stops it when the user moves away.

## Testing the Lens

### In Lens Studio Editor

Open the project and observe a pre-made Custom Location of an office. The statue in the center has an animated cat set to spawn on approach. Moving the camera preview window will simulate the approach of the user and the cat can be observed to appear and a sound effect is played.

### In Spectacles Device

Custom Locations are by nature attached to real places. To test this lens on device:

1. At the physical location where the AR content is anchored, create a series of scans for each main content area using the Custom Locations lens.
2. Once the scans have been published, create a group including all scans, stabilize each member, and publish the Custom Location Group.
3. Open the project in Lens Studio and replace the Group ID on the SceneObject "LocationRoot" with a scan you have made.
4. Click "Reload Group" on the Custom Location Group component.
5. On the SceneObject with the `CustomLocationGroup` component, add `DeactivateLocationMeshOnDevice`.
6. On the SceneObject with the `LocatedAt` component of the first location:
   1. Parent the desired content and position it relative to the scan mesh.
   2. Create an empty scene object representing the center of the scan.
   3. Attach the `ActivateWhenInCameraView` script and update references to the main camera and center SceneObject.
   4. Add the `ScaleInLocatedObject` script and update references to the content and `LocatedAt` component.
   5. Add a child audio asset scene object with the `AudioLocatedObject` script.
   6. Add both `LocatedObject` scripts to the "Listener Objects" field on the activate script.
7. Repeat for all locations as appropriate.
8. Send the lens to Spectacles, launch the lens, and move to the scanned location.

## Support

If you have any questions or need assistance, please don't hesitate to reach out. Our community is here to help, and you can connect with us and ask for support [here](https://www.reddit.com/r/Spectacles/). We look forward to hearing from you and are excited to assist you on your journey!

## Contributing

Feel free to provide improvements or suggestions or directly contributing via merge request. By sharing insights, you help everyone else build better Lenses.

---

*Built with <3 by the Spectacles team*

---
 
