# AI Playground

[![SIK](https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?) [![Remote Service Gateway](https://img.shields.io/badge/Remote%20Service%20Gateway-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/overview) [![Text To Speech](https://img.shields.io/badge/Text%20To%20Speech-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list) [![Speech To Text](https://img.shields.io/badge/Speech%20To%20Text-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list) [![Camera Access](https://img.shields.io/badge/Camera%20Access-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/apis/camera-module?) [![AI Vision](https://img.shields.io/badge/AI%20Vision-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/compatability-list) [![LLM](https://img.shields.io/badge/LLM-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list) [![Fetch](https://img.shields.io/badge/Fetch-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list) [![Audio](https://img.shields.io/badge/Audio-Light%20Gray?color=D3D3D3)](https://developers.snap.com/lens-studio/features/audio/playing-audio?)

<img src="./README-ref/sample-list-ai-playground-rounded-edges.gif" alt="ai-playground" width="500" />

## Overview

This sample project shows how to connect to multiple AI APIs — Gemini Live, OpenAI Realtime, Gemini image generation, OpenAI DALL-E, and Snap3D — using the Remote Service Gateway package in Lens Studio. It demonstrates real-time audio and video streaming to large language models, text-to-image generation, and text-to-3D generation with interactive results in the Spectacles environment. See more at the [Remote Service Gateway documentation](https://developers.snap.com/spectacles/about-spectacles-features/overview).

> **NOTE**: This project will only work for the Spectacles platform. You must set the simulation mode in the Lens Studio Preview panel to `Spectacles (2024)`. You must also provide your own Remote Service Gateway Key to use the functionality provided by this project.

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

To enable AI features, you must provide a Remote Service Gateway token:

1. Install the Remote Service Gateway Token Generator plug-in from the Asset Browser.
2. Go to **Window > Remote Service Gateway Token**.
3. Click **Generate Token**.
4. Copy and paste the token into the `RemoteServiceGatewayCredentials` object in the Inspector.

<img src="./README-ref/RSGCredentialsObject.png" alt="Remote Service Gateway Credentials object" width="500" />

## Key Script

[AIAssistantUIBridge.ts](./Assets/Scripts/AIAssistantUIBridge.ts) - Connects AI assistants (Gemini Live and OpenAI Realtime) to the Sphere Controller UI and the Snap3D factory.

[GeminiAssistant.ts](./Assets/Scripts/GeminiAssistant.ts) - Manages the Gemini Live WebSocket session, streaming audio and video input and handling text or function call responses.

[OpenAIAssistant.ts](./Assets/Scripts/OpenAIAssistant.ts) - Manages the OpenAI Realtime WebSocket session, handling audio streaming, text responses, and function calls with call ID tracking.

[ImageGenerator.ts](./Assets/Scripts/ImageGenerator.ts) - Wraps the Gemini and OpenAI image generation APIs to return a Texture promise from a text prompt.

[InteractableImageGenerator.ts](./Assets/Scripts/InteractableImageGenerator.ts) - Connects ASR voice queries to the ImageGenerator and displays the resulting image on screen.

[InteractableSnap3DGenerator.ts](./Assets/Scripts/InteractableSnap3DGenerator.ts) - Connects ASR voice queries to the Snap3D factory to generate 3D objects at a target scene position.

[Snap3DInteractableFactory.ts](./Assets/Scripts/Snap3DInteractableFactory.ts) - Creates interactable Snap3D scene objects from text prompts and manages the full generation lifecycle.

[Snap3DInteractable.ts](./Assets/Scripts/Snap3DInteractable.ts) - Receives image preview and final mesh data from the factory and renders them on an interactable scene object.

[ASRQueryController.ts](./Assets/Scripts/ASRQueryController.ts) - Implements a single-query voice button using ASR that fires an event with the transcribed text on completion.

[SphereController.ts](./Assets/Scripts/SphereController.ts) - Manages the orb UI element that follows the user's hand, can be placed in world space, and falls back to screen space when out of view.

[InternetAvailabilityPopUp.ts](./Assets/Scripts/InternetAvailabilityPopUp.ts) - Shows or animates away a popup to inform the user when internet connectivity is unavailable.

[APIKeyHint.ts](./Assets/Scripts/APIKeyHint.ts) - Displays a hint message when any required API key has not been configured in the Remote Service Gateway Credentials component.

## Testing the Lens

### In Lens Studio Editor

1. Open the Preview panel in Lens Studio and set the simulation mode to `Spectacles (2024)`.
2. Ensure your Remote Service Gateway token is correctly set in the `RemoteServiceGatewayCredentials` object.
3. Select either the **Gemini Live** or **OpenAI Realtime** button in the preview to start a session.
4. Use the on-screen orb to activate and deactivate the microphone input to the assistant.

### In Spectacles Device

1. Build and deploy the project to your Spectacles device.
2. Follow the [Spectacles guide](https://developers.snap.com/spectacles/get-started/start-building/preview-panel) for device testing.
3. Look down at your left hand and pinch the orb to activate the AI assistant.
4. Speak a prompt — the assistant will respond with voice and text output.

## Support

If you have any questions or need assistance, please don't hesitate to reach out. Our community is here to help, and you can connect with us and ask for support [here](https://www.reddit.com/r/Spectacles/). We look forward to hearing from you and are excited to assist you on your journey!

## Contributing

Feel free to provide improvements or suggestions or directly contributing via merge request. By sharing insights, you help everyone else build better Lenses.

---

*Built with <3 by the Spectacles team*

---
 
