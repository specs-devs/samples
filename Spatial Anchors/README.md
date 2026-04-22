# Spatial Persistence

[![SIK](https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?) [![Spatial Anchors](https://img.shields.io/badge/Spatial%20Anchors-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/apis/spatial-anchors?) [![Persistent Storage](https://img.shields.io/badge/Persistent%20Storage-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/features/persistent-cloud-storage/overview?) [![Multiplayer](https://img.shields.io/badge/Multiplayer-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/features/lens-cloud/lens-cloud-overview?)

<img src="./README-ref/sample-list-spatial-persistance-rounded-edges.gif" alt="spatial-persistance" width="500" />

## Overview

This template project demonstrates how to use the Spectacles [Spatial Anchor API](https://developers.snap.com/spectacles/about-spectacles-features/apis/spatial-anchors) to place and persist AR post-it notes tied to real-world locations. Users can create named areas, attach sticky notes to spatial anchors, and return to find their notes exactly where they left them across Lens sessions. The sample also showcases persistent cloud storage, AR keyboard input, and a recovery flow when localization fails.

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

[AppController.ts](./Assets/Scripts/App/AppController.ts) - Main entry point and lifecycle coordinator: area selection, anchor session flow, widget spawning, capture/localization, and navigation between app screens.

[AnchorController.ts](./Assets/Scripts/Anchors/AnchorController.ts) - Encapsulates AnchorModule session management for creating, saving, following, and tracking spatial anchors (ported from the prior AnchorManager pattern).

[TextInputRouter.ts](./Assets/Scripts/Shared/TextInputRouter.ts) - Routes AR keyboard input from the Text Input module to the currently focused note widget.

## Testing the Lens

### In Lens Studio Editor

In the [Interactive Preview Panel](https://developers.snap.com/lens-studio/lens-studio-workflow/previewing-your-lens#interactive-preview), click the **New Area** button in the area selection menu with the left mouse button. A panel will appear where you can drag different post-it notes into the scene. Click **Main Menu** to return to the area selection menu.

### In Spectacles Device

To install your Lens on your device, refer to the guide provided [here](https://developers.snap.com/spectacles/get-started/start-buiding/test-lens-on-spectacles).

After successfully installing the Lens, select the **New Area** button with a pinch gesture. The localization process will begin with a prompt asking you to look around. After localization completes, a panel will appear where you can drag different post-it notes into the scene. Pinch **Main Menu** to return to the area selection menu.

### Spatial Persistence

Exit the Lens and open it again. If the same area is selected, the previously created notes will spawn in the same position in the space.

### Recovery Mode

When the Lens fails to locate a previously mapped area, recovery mode activates. Notes are restored in front of the user with the same relative positions. The user can adjust the anchor point and press **Save** to update the mapping.

<img src="./README-ref/recovery-mode.gif" alt="recovery-mode" />

### Edit Notes with AR Keyboard

After a post-it note is created, select the edit button on its top-left corner to launch the AR keyboard.

<img src="./README-ref/ar-keyboard.gif" alt="ar-keyboard" />

## Support

If you have any questions or need assistance, please don't hesitate to reach out. Our community is here to help, and you can connect with us and ask for support [here](https://www.reddit.com/r/Spectacles/). We look forward to hearing from you and are excited to assist you on your journey!

## Contributing

Feel free to provide improvements or suggestions or directly contributing via merge request. By sharing insights, you help everyone else build better Lenses.

---

*Built with <3 by the Spectacles team*

---
 
