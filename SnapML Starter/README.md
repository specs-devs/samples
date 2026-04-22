# SnapML Starter

[![SIK](https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?) [![AR Tracking](https://img.shields.io/badge/AR%20Tracking-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?) [![Object Tracking](https://img.shields.io/badge/Object%20Tracking-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?) [![Physics](https://img.shields.io/badge/Physics-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/features/physics/physics-overview?) [![World Query](https://img.shields.io/badge/World%20Query-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/apis/world-mesh-api) [![Depth](https://img.shields.io/badge/Depth-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/features/ar-tracking/world/world-mesh-and-depth-texture)

<img src="./README-ref/sample-list-snapml-starter-rounded-edges.gif" alt="snapml-detection" width="500" />

## Overview

This project demonstrates how to leverage SnapML on Spectacles for object detection using custom machine learning models. SnapML brings powerful computer vision capabilities to Spectacles, enabling developers to create AR experiences that can recognize and interact with real-world objects. This template provides a complete workflow for training and deploying custom YOLOv7 models on Spectacles. For more details, visit the [SnapML on Spectacles Documentation](https://developers.snap.com/spectacles-templates/snapml).

> **NOTE**: This project will only work for the Spectacles platform.
>
> The complete workflow involves cloud-based development environments (Paperspace) and dataset management tools (Roboflow).

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

> **Disclaimer:**
> We do not endorse these services. This project is for educational purposes and you could use other alternatives if you'd like.

- **Paperspace Account**: For cloud-based ML training environment
- **Roboflow Account**: For dataset management and annotation

## Getting Started

To obtain the project folder, clone the repository.

> **IMPORTANT:**
> This project uses Git Large Files Support (LFS). Downloading a zip file using the green button on GitHub **will not work**. You must clone the project with a version of git that has LFS.
> You can download Git LFS [here](https://git-lfs.github.com/).

The complete SnapML workflow consists of these major phases:

1. **Setup**: Prepare your development environment in Paperspace
2. **Data Preparation**: Manage and export your dataset with Roboflow
3. **Training**: Train a custom YOLOv7 model using your dataset
4. **Export**: Convert your trained model to ONNX format for SnapML
5. **Deployment**: Import your model into Lens Studio for use on Spectacles

```bash
# Quick Start Workflow
# 1. Set up environment in Paperspace with PyTorch template
git clone https://github.com/Snapchat/snapml-templates.git
git clone https://github.com/hartwoolery/yolov7
cd yolov7
git checkout export-snapml
pip install -r requirements.txt

# 2. Download dataset from Roboflow in YOLOv7 format
pip install --upgrade roboflow
# Use Roboflow API to download your dataset

# 3. Download pre-trained weights
wget https://github.com/WongKinYiu/yolov7/releases/download/v0.1/yolov7-tiny.pt

# 4. Train model
python train.py --data your-dataset/data.yaml --cfg cfg/training/yolov7-tiny.yaml \
  --weights yolov7-tiny.pt --img 224 224 --batch-size 64 --epochs 200 \
  --name detection --device 0 --hyp data/hyp.scratch.tiny.yaml

# 5. Export to ONNX for SnapML
python export.py --weights runs/train/detection/weights/best.pt --grid \
  --simplify --export-snapml --img-size 224 224 --max-wh 224
```

## Initial Project Setup

The project should be pre-configured to get you started without any additional steps. However, if you encounter issues in the Logger Panel, please ensure your Lens Studio environment is set up for [Spectacles](https://developers.snap.com/spectacles/get-started/start-buiding/preview-panel).

This template provides **two main modes for object detection and spatialization**. Only one mode should be enabled at a time:

---

### Depth Cache Mode (supports "Click To Detect" and "Continuous" modes)

Uses device depth data to spatialize detected objects in 3D space with high accuracy. Features advanced smoothing and static/dynamic prefab modes.

<img src="./README-ref/depth-implement-1.gif" alt="snapml-detection" width="500" />

<img src="./README-ref/depth-implement-2.gif" alt="snapml-detection" width="500" />

- **Enable**: `DepthCacheSpatializer` object and its script.
- **Disable**: `WorldQueryModuleSpatializer` object and script.
- **Modes**: "Click To Detect" (button press) or "Continuous" (`enableContinuousUpdate`).

---

### World Query Module Mode (supports "Click To Detect" only)

Uses the World Query Module to place detected objects on real-world surfaces via hit-testing.

- **Enable**: `WorldQueryModuleSpatializer` object and its script.
- **Disable**: `DepthCacheSpatializer` object and script.

---

> **Important:** `MLSpatializer.ts` must always be enabled and configured regardless of which mode you use.

## Key Script

[MLSpatializer.ts](./Assets/Scripts/MLSpatializer.ts) - Runs the YOLOv7 ML model on the camera input and produces 2D detection results for the spatializer scripts.

[DepthCacheSpatializer.ts](./Assets/Scripts/DepthCacheSpatializer.ts) - Projects 2D ML detections into 3D world space using device depth data with smooth lerp transitions and static/dynamic scene modes.

[WorldQueryModuleSpatializer.ts](./Assets/Scripts/WorldQueryModuleSpatializer.ts) - Projects 2D ML detections into 3D world space using WorldQueryModule hit-testing on button press.

[DepthCache.ts](./Assets/Scripts/DepthCache.ts) - Manages depth frame acquisition and synchronization between color and depth camera frames.

[PinholeCapture.ts](./Assets/Scripts/PinholeCapture.ts) - Provides camera pose and projection utilities for mapping 2D detections to world space rays.

[YOLODetectionProcessor.ts](./Assets/Scripts/YOLODetectionProcessor.ts) - Parses raw YOLOv7 model outputs into structured detection objects with NMS and IOU filtering.

[DetectionContainer.ts](./Assets/Scripts/DetectionContainer.ts) - Holds UI references for displaying per-detection label, confidence, and bounding box polyline.

## Testing the Lens

### In Lens Studio Editor

1. Open the project in Lens Studio.
2. Import your ONNX model using the SnapML component in the ML Controller object.
3. Configure the class mappings to match your trained model's labels.
4. To test detection without a device, turn off all SIK-related utilities, set Preview to "No Simulation", and use a custom background image.

<img src="./README-ref/editor-test.png" alt="snapml-detection" width="500" />

### In Spectacles Device

1. Build and deploy the project to your Spectacles device.
2. Point your Spectacles at objects matching your trained model's classes.
3. Press the detect button to trigger a detection pass and place 3D markers on detected objects.
4. Verify tracking performance and adjust `scoreThreshold` or `iouThreshold` in `MLSpatializer` as needed.

<img src="./README-ref/compare-see-not-see.gif" alt="snapml-detection" width="500" />

<img src="./README-ref/compare-stabilize.gif" alt="snapml-detection" width="500" />

## Resources

- [Detailed SnapML Workflow Documentation](https://developers.snap.com/spectacles-templates/snapml)
- [SnapML Templates GitHub Repository](https://github.com/Snapchat/snapml-templates)
- [YOLOv7 GitHub Repository](https://github.com/WongKinYiu/yolov7)
- [Roboflow Documentation](https://docs.roboflow.com/)
- [Lens Studio ML Documentation](https://docs.snap.com/lens-studio/references/guides/lens-features/machine-learning/ml-overview)
- [Video Tutorial on YouTube](https://www.youtube.com/watch?v=kr3rvqWLEFE)

## Support

If you have any questions or need assistance, please don't hesitate to reach out. Our community is here to help, and you can connect with us and ask for support [here](https://www.reddit.com/r/Spectacles/). We look forward to hearing from you and are excited to assist you on your journey!

## Contributing

Feel free to provide improvements or suggestions or directly contributing via merge request. By sharing insights, you help everyone else build better Lenses.

---

*Built with <3 by the Spectacles team*

---
 
