# Spectacles Mobile Kit

[![Mobile Kit](https://img.shields.io/badge/Mobile%20Kit-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-mobile-kit/getting-started)

<img src="./README-ref/sample-list-mobile-kit-rounded-edges.gif" alt="Spectacles Mobile Kit" width="500" />

## Overview

Spectacles Mobile Kit is a SDK that enables seamless communication between mobile applications and Lenses running on Spectacles via Bluetooth Low Energy (BLE). This sample demonstrates how to establish a secure session, send one-way data, perform request-response exchanges, subscribe to topics, and load remote textures and meshes from a companion mobile app. Learn more about the Spectacles Mobile Kit in the [official documentation](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-mobile-kit/getting-started).

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

Before running the sample, you will also need a companion mobile app for bonding and session management:

- **iOS**: Open [app/iOS/SpectaclesKitSample/](app/iOS/SpectaclesKitSample/) in Xcode 16 and run on a physical iPhone.
- **Android**: Import [app/Android/SpectaclesKitSample/](app/Android/SpectaclesKitSample/) in Android Studio and run on a physical device.

The bonding flow must be completed once via the Spectacles App before a session can be established.

## Key Script

[SpectaclesMobileKitTest_TS.ts](./Assets/Scripts/SpectaclesMobileKitTest_TS.ts) - Drives the full Mobile Kit demo: creates a BLE session with the companion app, performs one-way data send, request-response exchanges, topic subscriptions, and remote texture/mesh loading via the Internet and RemoteMedia modules.

## Testing the Lens

### In Lens Studio Editor

1. Open [SpectaclesMobileKit.esproj](SpectaclesMobileKit.esproj) in Lens Studio.
2. Go to **Project Settings** and verify the Lens Name is set to `MobileKitTest`.
3. Open the **Preview Panel** and select the Spectacles preview mode.
4. Review the Logger Panel for connection status and any errors.

> **NOTE**: This project will only work for the Spectacles platform.

### In Spectacles Device

1. Click **Preview Lens** in Lens Studio to install and launch the Lens on your Spectacles.
2. Launch the companion mobile app on your phone:
   - **iOS**: Tap **SpectaclesKit bind**, grant Bluetooth access, approve the bond in the Spectacles App, then tap **Start Session**.
   - **Android**: Tap the **+** button, approve permissions and the bond in the Spectacles App — the app connects automatically.
3. Once connected, the Lens displays the session status, loads a remote image and mesh, and shows subscription responses from the mobile app.
4. If `Reset After Delay` is enabled, the session closes automatically after 10 seconds.

## Support

If you have any questions or need assistance, please don't hesitate to reach out. Our community is here to help, and you can connect with us and ask for support [here](https://www.reddit.com/r/Spectacles/). We look forward to hearing from you and are excited to assist you on your journey!

## Contributing

Feel free to provide improvements or suggestions or directly contributing via merge request. By sharing insights, you help everyone else build better Lenses.

---

*Built with <3 by the Spectacles team*

---
 
