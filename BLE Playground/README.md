# BLE Playground

[![SIK](https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?) [![Experimental API](https://img.shields.io/badge/Experimental%20API-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/apis/experimental-apis?) [![BLE](https://img.shields.io/badge/BLE-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list) [![Remote Service Gateway](https://img.shields.io/badge/Remote%20Service%20Gateway-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/overview)

<img src="./README-ref/sample-list-ble-playground-rounded-edges.gif" alt="BLE Playground" width="500" />

## Overview

**BLE Playground** is a Spectacles lens template that bridges the physical and digital worlds by connecting Spectacles to real Bluetooth Low Energy (BLE) smart home devices — and layering AI on top of them.

The lens does three things:

1. **BLE Device Control** — Scan for nearby BLE peripherals, connect, and control them in real time. Supported peripherals out of the box: Philips Hue smart lights, heart rate monitors (e.g. Polar H10), and environmental climate sensors (e.g. Nordic Thingy:52).

2. **AI Voice → Light Theme** — Record a voice prompt ("ocean vibes", "Halloween", "sunrise"), send it to **OpenAI GPT-4.1** via Remote Service Gateway, and receive a JSON keyframe animation that drives the connected lights with matching color sequences.

3. **AI Vision → Light Placement** — Pinch the camera button to capture a depth + color frame. The image is sent to **Google Gemini** which detects where the lamps are in the room and resolves their physical world-space positions using the depth map. The detected lamp positions are then anchored in AR space so hand gesture controls are context-aware.

> **NOTE:** This project will only work on the Spectacles platform.
> BLE APIs are experimental and may change in future updates.

---

## Design Guidelines

Designing Lenses for Spectacles offers all-new possibilities to rethink user interaction with digital spaces and the physical world.
Get started using our [Design Guidelines](https://developers.snap.com/spectacles/best-practices/design-for-spectacles/introduction-to-spatial-design).

---

## Prerequisites

- **Lens Studio**: v5.15.4+

**Note:** Ensure Lens Studio is [compatible with Spectacles](https://ar.snap.com/download) for your Spectacles device and OS versions.

- **Spectacles OS Version**: v5.64+
- **Spectacles App iOS**: v0.64+
- **Spectacles App Android**: v0.64+


The Bluetooth feature requires **Experimental APIs** to be enabled. See [Experimental APIs](https://developers.snap.com/spectacles/about-spectacles-features/apis/experimental-apis) for more details.

**Extended Permissions** mode on device must be enabled for Bluetooth APIs. See [Extended Permissions](https://developers.snap.com/spectacles/permission-privacy/extended-permissions) for more details.

To update your Spectacles device and mobile app, refer to this [guide](https://support.spectacles.com/hc/en-us/articles/30214953982740-Updating).
Download the latest version of Lens Studio from [here](https://ar.snap.com/download?lang=en-US).

---

## Getting Started

To obtain the project folder, clone the repository.

> **IMPORTANT:**
> This project uses Git Large Files Support (LFS). Downloading a zip file using the green button on GitHub **will not work**. You must clone the project with a version of git that has LFS.
> You can download Git LFS [here](https://git-lfs.github.com/).

---

## Initial Project Setup

### 1. Remote Service Gateway (RSG)

The AI features (OpenAI and Gemini) communicate through Remote Service Gateway. To set it up:

1. Install the **Remote Service Gateway Token Generator** plug-in from the Asset Browser.
2. Go to **Window → Remote Service Gateway Token**.
3. Click **Generate Token**.
4. Copy and paste the token into the **RemoteServiceGatewayCredentials** component in the Inspector.

For more details on RSG setup, token generation, and all supported services (OpenAI, Gemini, Imagen, Lyria, DeepSeek, Snap3D) see the [Remote Service Gateway documentation](https://developers.snap.com/spectacles/about-spectacles-features/apis/remoteservice-gateway).

### 2. BLE Hardware (optional for device testing)

The lens works in editor with `isNoBleDebug` enabled (no hardware required). For real device testing you will need one or more of the following:

| Peripheral | What to buy | BLE profile used |
|---|---|---|
| **Smart Light** | Philips Hue White & Color Ambiance (E26 US / E27 EU) + Hue Bridge v2 | Custom Hue BLE / Zigbee gateway |
| **Heart Rate Monitor** | Polar H10 chest strap | GATT Heart Rate Service `0x180D` |
| **Climate Sensor** | Nordic Semiconductor Thingy:52 | Custom Nordic Thingy weather service |

Any BLE heart rate device that exposes the standard `0x180D` GATT service should work. Any BLE environmental sensor exposing GATT Environmental Sensing Service (`0x181A`) will also work with minor adaptation.

---

## Scene Hierarchy

The scene is organized as follows:

```
Managers
├── BLEServiceHandler        — Starts/stops BLE scans, owns the Bluetooth module
├── ScanResultManager        — Populates the card grid with discovered devices
├── ControllerFactory        — Instantiates the right peripheral UI widget on connect
├── LensInitializer          — Bootstraps the lens; toggle isNoBleDebug for editor testing
├── RoomLightsUI             — AI/hand mode toggle panel, parented to a connected light node
├── ASRQueryController       — Microphone capture and ASR transcription
└── CameraQueryController    — Camera + depth capture trigger for Gemini vision

Light Features
├── CursorVisualHelper       — Visual feedback for the hand cursor
├── UniqueColorService       — Provides unique neon colors per connected light
├── GeminiDepthLightEstimator — Sends camera frame to Gemini, resolves lamp world positions
├── LightAiJsonEventEmitter  — Drives keyframe color animation on all connected lights
├── LightHandInputManager    — Routes grab/index-tip gestures to light controllers
└── LightAiInputManager      — Sends voice queries to OpenAI, parses JSON keyframes

Prefabs
├── PrefabScanResult         — Pre-existing card slot in the BLE device grid
├── PrefabWidget             — Root container widget (UIKit Frame) for a peripheral panel
├── PrefabLight              — Light controller panel (color wheel, power, AI/hand switches)
├── PrefabHeartRate          — Heart rate monitor panel (BPM display, EKG visual)
├── PrefabClimate            — Climate sensor panel (temperature, humidity, air quality)
└── PrefabDetectionMode      — Surface detection visual used during light placement

UIManager
└── Content
    ├── Section              — "Scan Manager" tab (scan grid + filter button)
    │   ├── ScanButton       — Starts/stops BLE scan
    │   ├── FilterButton     — Hides unknown/untyped devices when active
    │   └── Content          — Scroll window with 12 pre-existing card slots
    └── Section              — "Room Lights" tab (AI and hand controls)
        ├── HandControls     — Hand gesture control switch + placement trigger
        └── AIControls       — Voice AI switch + microphone button
```

---

## Script Reference

### Core

| Script | What it does |
|---|---|
| `LensInitializer.ts` | Singleton that bootstraps the lens. Call `getInstance().isNoBleDebug` to bypass BLE on device. Enable the flag in the inspector for full editor testing without hardware. |
| `BleServiceHandler.ts` | Wraps the Bluetooth central module. Starts/stops scans, fires `startScan`, `scanResult`, and `stopScan` events that `ScanResultsManager` subscribes to. Also resets the scan toggle button state when a scan completes or times out. |
| `ScanResultsManager.ts` | Listens to `BleServiceHandler` scan events and assigns discovered devices to pre-existing card slots in the `GridLayout`. Manages arrays for each type (light, HRM, climate, unknown, untyped). Handles filter toggle visibility and serial auto-connect for known device name substrings. |
| `ScanResult.ts` | Attached to each card slot in the grid. Owns one device's connection lifecycle — connects via GATT, interrogates services to determine type, spawns a widget via `ControllerFactory`, manages connection state changes, and drives the card's Name/Status texts and Logo icon. |
| `ControllerFactory.ts` | On connect success, inspects the GATT services to detect device type (Hue light → `PrefabLight`, HRM → `PrefabHeartRate`, Thingy:52 → `PrefabClimate`) and instantiates the matching prefab widget. |
| `Widget.ts` | Generic container for a peripheral controller panel. Uses a UIKit `Frame` for draggable/billboarding behavior. On first translation, it detaches from the BLE hub anchor and becomes a free-floating world panel. |

### Peripheral — Light

| Script | What it does |
|---|---|
| `LightController.ts` | The main coordinator for a connected Hue light. Generates the procedural color wheel texture, routes color selection and power toggle commands to `HueEventEmitter`, and initializes `RoomLightsUI`. |
| `HueEventEmitter.ts` | Writes power, brightness, and color to the BLE Hue light via GATT characteristics. Implements throttling to avoid flooding the BLE stack with rapid drag updates. Also handles a "flash" animation when the widget is being moved. |
| `LightStatusVisual.ts` | Mirrors the current power/brightness/color state as a colored sphere in the UI, and drives a UIKit `Slider` to reflect brightness. |
| `LightColorWheelInputManager.ts` | Translates `Interactable` drag events on the color wheel into world-space color selection calls on `LightController`. |
| `LightHandInputManager.ts` | Listens to grab and release gestures globally. When the camera is pointing at a known lamp position, it toggles power on grab and forwards the index-tip screen position to all registered `LightHandEventListener` instances for color selection. |
| `LightHandEventListener.ts` | Per-light prefab listener. On pinch, triggers `SurfaceDetectionMod` to place the light at a detected floor/surface position, contributing the result to `LightHandInputManager`. |
| `LightAiInputManager.ts` | Subscribes to the `ASRQueryController` voice event, sends the transcribed query to **OpenAI GPT-4.1** via RSG with a JSON keyframe prompt, then passes the parsed animation data to `LightAiJsonEventEmitter`. |
| `LightAiJsonEventEmitter.ts` | Drives a timed keyframe animation loop across all registered `LightAiEventListener` instances, interpolating brightness and color over the specified loop length. |
| `LightAiEventListener.ts` | Per-light prefab listener. Forwards `onAiSetBrightnessAndColor` calls from the emitter to `LightController`. |
| `RoomLightsUI.ts` | Manages the mutual exclusion between AI mode and Hand mode via two UIKit `Switch` components. Activating one switch deactivates the other and notifies the respective managers. |
| `GeminiDepthLightEstimator.ts` | Captures a synchronized color+depth frame from `DepthCache`, encodes the JPEG and sends it to **Gemini** with the prompt `"Find the lamps."`. Parses the JSON response to extract pixel coordinates, back-projects them to world space using the depth data, then fires a `lightPlaced` event and stores the world positions for gesture targeting. |
| `CameraQueryController.ts` | A show/hide round button panel that triggers `GeminiDepthLightEstimator.requestAllPositions()` on tap. Shown/hidden by `LightHandInputManager` when hand control mode is active. |

### Peripheral — Heart Rate

| Script | What it does |
|---|---|
| `HeartRateController.ts` | Subscribes to BPM notifications from the GATT Heart Rate Service characteristic and updates the on-screen BPM display. |

### Peripheral — Climate

| Script | What it does |
|---|---|
| `ClimateController.ts` | Reads temperature, humidity, and air quality from the Nordic Thingy:52 weather service characteristics and displays them in the panel. |

### AI

| Script | What it does |
|---|---|
| `ASRQueryController.ts` | Records a voice query on button tap using `AsrModule`, shows an activity indicator while listening, and emits the final transcript via `onQueryEvent`. |
| `ImageGenerator.ts` | Standalone utility for generating images via Imagen / Gemini vision APIs. Not directly connected to the BLE flow. |
| `Snap3DInteractableFactory.ts` | Generates interactable 3D objects from Snap3D (HostedSnap) API responses. |

### Helpers

| Script | What it does |
|---|---|
| `Logger.ts` | Singleton screen logger that forwards messages to a `Text` component for on-screen debug output. |
| `Colors.ts` | Static helpers for common `vec4` colors (white, grey, black). |
| `UniqueColorService.ts` | Returns a unique neon color per call, used to assign a distinct starting color to each connected light. |
| `ErrorUtils.ts` | Wraps `console.error` and forwards the stack trace to the on-screen logger. |
| `FollowCamUi.ts` | Keeps a UI panel facing the user's camera. |
| `RotateScreenTransform.ts` | Spins a `ScreenTransform` continuously — used for loading/connecting indicators. |
| `CursorVisualHelper.ts` | Shows/hides a custom cursor mesh based on hover state. |
| `ButtonFeedback_ForceVisualState.ts` | Forces a `RoundButton` mesh material to reflect toggle state when changed programmatically (used in older parts of the UI). |

### UI

| Script | What it does |
|---|---|
| `SectionController.ts` | Simple static tab controller. Parallel arrays of `BaseButton` and `SceneObject` — pressing button N enables panel N and disables all others. First section is on at start. No frame interaction. |

---

## How the AI + BLE Pipeline Works

```
User speaks → ASRQueryController (AsrModule)
                ↓ onQueryEvent (transcript string)
            LightAiInputManager
                ↓ OpenAI GPT-4.1 (via RemoteServiceGateway)
                ↓ JSON keyframe response
            LightAiJsonEventEmitter
                ↓ timed keyframe loop
            LightAiEventListener (per light)
                ↓ aiSetBrightnessAndColor()
            LightController → HueEventEmitter → BLE GATT write
```

```
User taps camera button → CameraQueryController
                            ↓ requestAllPositions()
                        GeminiDepthLightEstimator
                            ↓ DepthCache saves depth + color frame
                            ↓ Base64 encode JPEG → Gemini API (via RSG)
                            ↓ JSON pixel coordinates response
                            ↓ DepthCache back-project to world space
                        LightHandInputManager stores world positions
                            ↓ used for dot-product camera → lamp targeting
                        Hand gestures route color/power to the correct light
```

---

## Testing the Lens

### In Lens Studio Editor (no BLE hardware required)

1. Open the project in Lens Studio and navigate to the Preview panel.
2. Select the **LensInitializer** scene object.
3. Enable **Is No BLE Debug** in the Inspector.
4. Press the Scan button — the editor will simulate discovering devices and spawn random controller widgets (light, HRM, or climate at random).
5. Interact with the spawned panels to test the color wheel, AI input, and hand controls UI.

> AI calls (OpenAI, Gemini) require real API keys and an active network connection even in the editor.

### On Spectacles Device

1. Ensure **Extended Permissions** and **Experimental APIs** are enabled on your device.
2. Build and deploy via Lens Studio's device preview.
3. Power on your BLE peripheral(s) and make sure they are within ~5 m range.
4. Open the lens — the main UI frame will appear in your view.
5. Tap **Scan** — the grid populates with discovered devices.
6. Tap a card to connect. The lens will interrogate the device's GATT services and spawn the correct controller panel.
7. For lights: the controller panel appears as a floating world panel. Use the **color wheel** to change color, the **brightness slider** to dim, and the **power toggle** to turn the light on/off.
8. Switch to **Hand Controls** mode — point at the lamp and use a grab gesture to toggle power, or move your index finger to change color.
9. Switch to **AI Controls** mode — tap the microphone button, say a color theme, and the light will animate to match.
10. Tap the **camera button** to let Gemini detect lamp positions from a depth+color frame.

---

## Support

If you have any questions or need assistance, please don't hesitate to reach out. Our community is here to help, and you can connect with us and ask for support [here](https://www.reddit.com/r/Spectacles/). We look forward to hearing from you and are excited to assist you on your journey!

## Contributing

Feel free to provide improvements or suggestions or directly contributing via merge request. By sharing insights, you help everyone else build better Lenses.

---

*Built with <3 by the Spectacles team*

---
 
