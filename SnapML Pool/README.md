# SnapML Pool

[![SIK](https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview) [![AI](https://img.shields.io/badge/AI-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/apis/overview) [![SnapML](https://img.shields.io/badge/SnapML-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/features/machine-learning/ml-component/overview) [![AR Tracking](https://img.shields.io/badge/AR%20Tracking-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/world-understanding/overview) [![Object Tracking](https://img.shields.io/badge/Object%20Tracking-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/world-understanding/overview) [![Experimental API](https://img.shields.io/badge/Experimental%20API-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/apis/experimental-apis)

<img src="./README-ref/sample-list-pool-ml-rounded-edges.gif" alt="pool-ml" width="500" />

## Overview

SnapML Pool demonstrates how to run a real-time YoloV7-tiny object detection model on Spectacles to track all 16 pool balls and pocket positions on a physical pool table. The lens uses a pinhole camera model to unproject 2D bounding box detections into 3D world-space coordinates and applies a spatial-temporal multi-object tracking algorithm to maintain consistent ball identities over time. Users calibrate the table by placing two corner pins, after which all viewable balls are tracked live. Learn more about SnapML and the ML Component in the [Lens Studio documentation](https://developers.snap.com/lens-studio/features/machine-learning/ml-component/overview).

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
- **1 Standard Pool Table**
    - With all pieces

To update your Spectacles device and mobile app, please refer to this [guide](https://support.spectacles.com/hc/en-us/articles/30214953982740-Updating).

You can download the latest version of Lens Studio from [here](https://ar.snap.com/download?lang=en-US).

The camera feature requires you to use Experimental APIs. Please see Experimental APIs for more details [here](https://developers.snap.com/spectacles/about-spectacles-features/apis/experimental-apis).

Extended Permissions mode on device must be enabled for enabling some of the Spectacles APIs. Please see Extended Permissions for more details [here](https://developers.snap.com/spectacles/permission-privacy/extended-permissions).

## Getting Started

To obtain the project folder, clone the repository.

> **IMPORTANT:**
> This project uses Git Large Files Support (LFS). Downloading a zip file using the green button on GitHub **will not work**. You must clone the project with a version of git that has LFS.
> You can download Git LFS [here](https://git-lfs.github.com/).

## Initial Project Setup

The project should be pre-configured to get you started without any additional steps. However, if you encounter issues in the Logger Panel, please ensure your Lens Studio environment is set up for [Spectacles](https://developers.snap.com/spectacles/get-started/start-buiding/preview-panel).

## Key Script

[CameraService.ts](./Assets/Scripts/CameraService.ts) - Acquires frames from the Spectacles left camera, builds a pinhole camera model for intrinsics and transforms, and crops a square region for ML processing.

[MLController.ts](./Assets/Scripts/ML/MLController.ts) - Runs the 512x512 YoloV7-tiny ONNX model via MLComponent, parses raw tensor outputs into bounding boxes, and forwards filtered detections to the pool table predictor.

[PoolTablePredictor.ts](./Assets/Scripts/PoolTablePredictor.ts) - Guides the player through a two-pin calibration flow and unprojects 2D bounding box detections to 3D positions using the user-defined reference plane.

[MultiObjectTracking.ts](./Assets/Scripts/ML/MultiObjectTracking.ts) - Maintains consistent pool ball identities across frames using a spatial-temporal algorithm with OneEuroFilter smoothing.

[SimulatedPoolTable.ts](./Assets/Scripts/SimulatedPoolTable.ts) - Instantiates a virtual pool table with physics-enabled balls in the Lens Studio Editor for debugging without a physical table.

## Testing the Lens

### In Lens Studio Editor

1. Open the project in Lens Studio and enter the Preview Panel.
2. A virtual pool table with 16 physics-enabled balls is generated automatically in the scene.
3. For best results, disable simulation in the Preview Panel to prevent visual misalignment.
4. Click or tap in the Preview Panel to apply random impulse forces that shuffle the balls around the table.

### In Spectacles Device

1. Deploy the lens to your Spectacles device.
2. Position your Spectacles to view a complete pool table until the lens detects it.
3. Once the table is detected, place the "L" calibration pin at the bottom-left corner pocket, ensuring it rests on the felt surface.
4. Place the "R" calibration pin at the bottom-right corner pocket to complete calibration.
5. After calibration, all visible balls are tracked in real time with labeled overlays.
6. To recalibrate, look at your left palm and pinch to reset the table alignment.

## Support

If you have any questions or need assistance, please don't hesitate to reach out. Our community is here to help, and you can connect with us and ask for support [here](https://www.reddit.com/r/Spectacles/). We look forward to hearing from you and are excited to assist you on your journey!

## Contributing

Feel free to provide improvements or suggestions or directly contributing via merge request. By sharing insights, you help everyone else build better Lenses.

---

*Built with <3 by the Spectacles team*

---
 
