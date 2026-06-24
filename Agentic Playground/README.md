# Agentic Playground

[![SIK](https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview) [![Remote Service Gateway](https://img.shields.io/badge/Remote%20Service%20Gateway-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/apis/remoteservice-gateway) [![Text To Speech](https://img.shields.io/badge/Text%20To%20Speech-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list) [![Speech To Text](https://img.shields.io/badge/Speech%20To%20Text-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list) [![Camera Access](https://img.shields.io/badge/Camera%20Access-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/apis/camera-module) [![LLM](https://img.shields.io/badge/LLM-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list)

<img src="./README-ref/sample-list-agentic-playground-rounded-edges.gif" alt="Agentic Playground Overview" width="500" />

> **NOTE:**
> This project will only work for the **Spectacles platform**. You must set the simulation mode in Lens Studio Preview to `Spectacles (2024)`.
> You must also provide your own **Remote Service Gateway API Token** to use the AI functionality provided by this project.

## Overview

Agentic Playground is an AI-powered educational assistant for Snap Spectacles that demonstrates a full agentic architecture using real-time speech processing, intelligent tool routing, and multi-modal content generation. Students can ask questions, receive lecture summaries, generate visual diagrams, and explore their environment — all through natural voice interaction. The system uses AI reasoning (not hard-coded rules) to route queries to specialized tools. Learn more about building with AI on Spectacles at the [Spectacles Developer Portal](https://developers.snap.com/spectacles).

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

### Remote Service Gateway Token

This project requires a Remote Service Gateway API token to access AI services:

1. Install the **Remote Service Gateway Token Generator** from the Asset Library (Spectacles section)
2. Open: **Windows** > **Remote Service Gateway Token**
3. Click **Generate Token** and copy the generated token
4. Locate `RemoteServiceGatewayCredentials` in your scene and paste the token in the Inspector

The token enables access to OpenAI (Chat, Realtime API, Image Generation), Gemini (Live API with vision), and Snap3D (text-to-3D model generation).

## Key Scripts

[AgentOrchestrator.ts](./Assets/Scripts/Agents/AgentOrchestrator.ts) - Central coordinator that manages the entire agentic flow, receives transcribed queries from the ASR layer, delegates to the ToolRouter, and updates the UI with voice and visual responses.

[ToolRouter.ts](./Assets/Scripts/Tools/ToolRouter.ts) - AI-powered tool selector that analyzes user intent using an LLM (no hard-coded rules) and dispatches to the appropriate specialized tool: GeneralConversationTool, SummaryTool, SpatialTool, DiagramCreatorTool, or DiagramUpdaterTool.

[AgentLanguageInterface.ts](./Assets/Scripts/Agents/AgentLanguageInterface.ts) - Unified abstraction layer over OpenAI and Gemini providers, handling provider switching, text generation, and voice output coordination.

[AISummarizer.ts](./Assets/Scripts/Core/AISummarizer.ts) - Converts raw lecture transcriptions into structured JSON summary cards with strict character limits optimized for AR card display.

[ChatASRController.ts](./Assets/Scripts/ASR/ChatASRController.ts) - Handles turn-based voice input transcription for the conversational chat interface.

[SummaryASRController.ts](./Assets/Scripts/ASR/SummaryASRController.ts) - Continuously captures and transcribes lecture audio, accumulating content for summarization.

## Testing the Lens

### In Lens Studio Editor

1. Open the Preview panel in Lens Studio
2. Set **Device Type Override** to `Spectacles (2024)`
3. Ensure your Remote Service Gateway API token is correctly configured in `RemoteServiceGatewayCredentials`
4. Use headphones to prevent audio feedback during voice testing
5. Enable `testMode` on `SummaryComponent` or `ChatComponent` to test with mock educational data without a live lecture

### In Spectacles Device

1. Build and deploy the project to your Spectacles device
2. Follow the [Spectacles deployment guide](https://developers.snap.com/spectacles/get-started/start-building/preview-panel) for device testing
3. Ensure internet connectivity for AI API access
4. Speak naturally to trigger the chat interface — the AI will route your query to the appropriate tool automatically
5. The spatial tool activates when you ask about what you see in your environment (uses the camera)

## Support

If you have any questions or need assistance, please don't hesitate to reach out. Our community is here to help, and you can connect with us and ask for support [here](https://www.reddit.com/r/Spectacles/). We look forward to hearing from you and are excited to assist you on your journey!

## Contributing

Feel free to provide improvements or suggestions or directly contributing via merge request. By sharing insights, you help everyone else build better Lenses.

---

*Built with <3 by the Spectacles team*

---
 
