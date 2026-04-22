# Think Out Loud

[![Sync Kit](https://img.shields.io/badge/Sync%20Kit-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-sync-kit) [![SpectaclesInteractionKit](https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit) [![UIKit](https://img.shields.io/badge/UIKit-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-ui-kit) [![Connected Lenses](https://img.shields.io/badge/Connected%20Lenses-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/connected-lenses) [![Cloud Storage](https://img.shields.io/badge/Cloud%20Storage-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/apis/cloud-storage) [![Hand Tracking](https://img.shields.io/badge/Hand%20Tracking-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/apis/hand-tracking)

<img src="./README-ref/sample-list-think-out-loud-rounded-edges.gif" alt="Think Out Loud" width="500" />

> **NOTE**: This project will only work for the Spectacles platform.

## Overview

Think Out Loud is a social AR networking application for Snap Spectacles that lets participants connect in real time at any social event. Floating status panels hover above each user's head, a visual ping system lets users send connection requests with material-based feedback, and a palm-detected hand menu provides personal settings management. All state is synchronized in real time using Spectacles Sync Kit and persisted across sessions via Cloud Storage. Learn more about [Connected Lenses](https://developers.snap.com/spectacles/spectacles-frameworks/connected-lenses).

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

[HeadLabelObjectController.ts](./Assets/Scripts/HeadLabel/HeadLabelObjectController.ts) - Controls data synchronization, head-tracked positioning, and ping visual state for each player's floating status panel.

[PingMenu.ts](./Assets/Scripts/PingMenu/PingMenu.ts) - Manages the three-phase ping request, response, and connection-update network event flow via SyncEntity.

[HandMenu.ts](./Assets/Scripts/HandMenu/HandMenu.ts) - Detects right palm facing the camera and instantiates the status settings menu with a timed reveal animation.

[HeadLabelObjectManager.ts](./Assets/Scripts/HeadLabel/HeadLabelObjectManager.ts) - Manages instantiation and session-wide tracking of all player head labels.

## Testing the Lens

### In Lens Studio Editor

1. Set **Device Type Override** to `Spectacles (2024)` in the Preview panel.
2. Open **Multi-User Preview** to simulate multiple connected users.
3. In one user's session, raise the right palm toward the camera to open the hand menu.
4. Update the status text and press **Update Status** to see the change reflect on the head label.
5. Use the second simulated user to trigger a ping on the first user's head label and verify the accept/reject flow.

### In Spectacles Device

1. Deploy the lens to two or more Spectacles devices using different Snapchat accounts.
2. Verify that each device shows floating head labels for all other users.
3. Test the complete ping flow:
   - User A opens the hand menu by showing their right palm and updates their status.
   - User B reaches toward User A's head label to trigger a ping request.
   - User A accepts the ping via the popup menu.
   - Both users' head label materials change to the accepted (blue) state.
4. Use the **Exit Ping** button in the hand menu to disconnect and confirm materials reset to default.
5. Rejoin the session to verify that status and availability are restored from Cloud Storage.

## Support

If you have any questions or need assistance, please don't hesitate to reach out. Our community is here to help, and you can connect with us and ask for support [here](https://www.reddit.com/r/Spectacles/). We look forward to hearing from you and are excited to assist you on your journey!

## Contributing

Feel free to provide improvements or suggestions or directly contributing via merge request. By sharing insights, you help everyone else build better Lenses.

---

*Built with <3 by the Spectacles team*

---
 
