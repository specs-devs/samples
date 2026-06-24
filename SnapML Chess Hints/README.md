# SnapML Chess Hints

[![SIK](https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?) [![AI](https://img.shields.io/badge/AI-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/apis/machine-learning?) [![SnapML](https://img.shields.io/badge/SnapML-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.MLComponent/) [![Networking](https://img.shields.io/badge/Networking-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview?)

<img src="./README-ref/sample-list-chess-hint-rounded-edges.gif" alt="chess-hints" width="500" />

## Overview

This project uses SnapML to detect chess pieces in real time and provides move suggestions powered by Google Gemini AI. It demonstrates how Spectacles can enhance real-world activities through on-device computer vision and cloud AI assistance. The lens detects all 12 chess piece classes, builds a FEN string representation of the board, and displays the suggested move as an animated 3D arc overlay.

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
- **1 Standard Physical Chess Board**
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

To enable AI move suggestions, generate an API token via the Remote Service Gateway Token Generator in the Lens Studio Asset Library, then apply it to the `RemoteServiceGatewayCredentials` object in the Scene Hierarchy.

## Key Script

[ChessBoardPredictor.ts](./Assets/Scripts/ChessBoardPredictor.ts) - Orchestrates piece detection, board alignment via corner pins, and move suggestion requests; the central controller for the lens experience.

[ChessAI.ts](./Assets/Scripts/ChessAI.ts) - Converts detected piece positions to FEN notation, validates the board state, and calls the Gemini API to fetch the best move suggestion.

[MLController.ts](./Assets/Scripts/ML/MLController.ts) - Runs the YOLOv7-tiny ML model on cropped camera frames and forwards detected chess pieces to the board predictor.

[CameraService.ts](./Assets/Scripts/CameraService.ts) - Manages device camera setup, crop provider initialization, and timestamped camera pose history for accurate unprojection.

## Testing the Lens

### In Lens Studio Editor

1. Open the project in Lens Studio — a virtual chess board is generated automatically in the scene.
2. Disable simulation in the Preview Panel if visual misalignment occurs.
3. Use your mouse to interact with the hint button to test the AI suggestion workflow.
4. Chess pieces cannot be manually moved, but the Randomize button reshuffles piece positions for testing different board states.

### In Spectacles Device

1. Position your Spectacles to view a complete physical chess board.
2. Once the board is detected, place the L pin at the front-left corner closest to your color pieces.
3. Place the R pin at the front-right corner of the board to complete alignment.
4. Press the Get Hint button with your finger to request an AI-powered move suggestion.
5. The system analyzes the board state and displays the recommended move as an animated arc.
6. To recalibrate, look at your left palm and pinch to reset board alignment.

## Support

If you have any questions or need assistance, please don't hesitate to reach out. Our community is here to help, and you can connect with us and ask for support [here](https://www.reddit.com/r/Spectacles/). We look forward to hearing from you and are excited to assist you on your journey!

## Contributing

Feel free to provide improvements or suggestions or directly contributing via merge request. By sharing insights, you help everyone else build better Lenses.

---

*Built with <3 by the Spectacles team*

---
 
