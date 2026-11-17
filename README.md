<div align="center">

<img src="https://raw.githubusercontent.com/specs-devs/.github/main/profile/SPECS.jpeg" width="600" height="auto" align="center">

# SPECS Samples

**Ready-to-use Lens Studio projects for building on SPECS.**

[![Release](https://img.shields.io/badge/Release-5.25.0-1a1a1a?style=flat&labelColor=1a1a1a)](https://github.com/specs-devs/samples/releases/tag/5.25.0)
[![Lens Studio](https://img.shields.io/badge/Lens%20Studio-5.25.0-FFFC00?style=flat&labelColor=FFFC00&logo=snapchat&logoColor=black)](https://ar.snap.com/lens-studio)
[![Developers](https://img.shields.io/badge/-Developers-1a1a1a?style=flat&labelColor=1a1a1a&logo=readthedocs&logoColor=white)](https://developers.specs.com/)
[![Reddit](https://img.shields.io/badge/-Reddit-ff4500?style=flat&labelColor=ff4500&logo=reddit&logoColor=white)](https://www.reddit.com/r/Spectacles/)
[![YouTube](https://img.shields.io/badge/YouTube-ff0000?style=flat&logo=youtube&logoColor=white)](https://www.youtube.com/@specsfordevs)

---

</div>

Each folder is a complete, working Lens Studio project you can open, run and use as a starting point.

## Releases

| Branch | Lens Studio | Device | Release |
|:--|:--|:--|:--|
| [`main`](https://github.com/specs-devs/samples/tree/main) | 5.25.0 | SPECS 27 | [5.25.0](https://github.com/specs-devs/samples/releases/tag/5.25.0) ← you are here |
| [`5.24.1`](https://github.com/specs-devs/samples/tree/5.24.1) | 5.24.1 | SPECS 27 | [5.24.1](https://github.com/specs-devs/samples/releases/tag/5.24.1) |
| [`5.24`](https://github.com/specs-devs/samples/tree/5.24) | 5.24.0 | SPECS 27 | [5.24.0](https://github.com/specs-devs/samples/releases/tag/5.24.0) |
| [`5.22`](https://github.com/specs-devs/samples/tree/5.22) | 5.22.0 | SPECS 27 | [5.22.0](https://github.com/specs-devs/samples/releases/tag/5.22.0) |
| [`5.15.4`](https://github.com/specs-devs/samples/tree/5.15.4) | 5.15.4 | Spectacles (2024) | [5.15.4](https://github.com/specs-devs/samples/releases/tag/5.15.4) |

> [!IMPORTANT]
> Use the branch that matches your Lens Studio version. `main` always carries the latest release.
> **Spectacles (2024) is supported only on `5.15.4`.** Everything `5.22.0`+ targets SPECS 27.

## Getting Started

This repository uses **Git LFS** for large assets. Install it once before cloning:

```bash
git lfs install
```

Clone everything:

```bash
git clone https://github.com/specs-devs/samples.git
```

Or clone a single project with sparse checkout:

```bash
git clone --filter=blob:none --sparse https://github.com/specs-devs/samples.git
cd samples && git sparse-checkout add "Essentials"
```

Then open the project folder in Lens Studio.

## Project index

| | | |
|:--|:--|:--|
| [AI Playground](./AI%20Playground/) | [Crop](./Crop/) | [Depth Cache](./Depth%20Cache/) |
| [AI Music Gen](./AI%20Music%20Gen/) | [Agent Manager](./Agent%20Manager/) | [Fetch](./Fetch/) |
| [Essentials](./Essentials/) | [Throw Lab](./Throw%20Lab/) | [Voice Playback](./Voice%20Playback/) |
| [Path Pioneer](./Path%20Pioneer/) | [Mobile Kit](./Mobile%20Kit/) | [DJ](./DJ/) |
| [Custom Locations](./Custom%20Locations/) | [Navigation Kit](./Navigation%20Kit/) | [Shared Sync Controls](./Sync%20Kit%20Shared%20Sync%20Controls/) |
| [Tic Tac Toe](./Sync%20Kit%20Tic%20Tac%20Toe/) | [Laser Pointer](./Sync%20Kit%20Laser%20Pointer/) | [High Five](./Sync%20Kit%20High%20Five/) |
| [Air Hockey](./Sync%20Kit%20Air%20Hockey/) | [Think Out Loud](./Sync%20Kit%20Think%20Out%20Loud/) | [Sync Kit](./Sync%20Kit%20Basic%20Example/) |
| [Base Template](./Base%20Template/) | [Base Template With Examples](./Base%20Template%20With%20Examples/) | [Industrial Sketch](./Industrial%20Sketch/) |

## AI

AI-powered experiences and integrations

<table>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="./AI Playground/">
        <img src="./AI Playground/README-ref/sample-list-ai-playground-rounded-edges.gif" alt="ai-playground" width="250px" />
      </a>
      <h3>AI Playground</h3>
      <!-- tags:AI Playground -->
      <p>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/overview"><img src="https://img.shields.io/badge/Remote%20Service%20Gateway-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list"><img src="https://img.shields.io/badge/AI%20%26%20LLM-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list"><img src="https://img.shields.io/badge/Text%20To%20Speech-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list"><img src="https://img.shields.io/badge/Speech%20To%20Text-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list"><img src="https://img.shields.io/badge/AI%20Vision-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:AI Playground -->
      <p>Sample project for AI in using SPECS Remote Service Gateway.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Crop/">
        <img src="./Crop/README-ref/sample-list-crop-rounded-edges.gif" alt="crop" width="250px" />
      </a>
      <h3>Crop</h3>
      <!-- tags:Crop -->
      <p>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/overview"><img src="https://img.shields.io/badge/Remote%20Service%20Gateway-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list"><img src="https://img.shields.io/badge/AI%20%26%20LLM-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/gesture-module"><img src="https://img.shields.io/badge/Gesture%20%26%20Hands-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/camera-module"><img src="https://img.shields.io/badge/Camera%20Access-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list"><img src="https://img.shields.io/badge/AI%20Vision-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Crop -->
      <p>Sample project showing how to "crop" the environment using hand gesture.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Depth Cache/">
        <img src="./Depth Cache/README-ref/sample-list-depth-cache-rounded-edges.gif" alt="depth-cache" width="250px" />
      </a>
      <h3>Depth Cache</h3>
      <!-- tags:Depth Cache -->
      <p>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/overview"><img src="https://img.shields.io/badge/Remote%20Service%20Gateway-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list"><img src="https://img.shields.io/badge/AI%20%26%20LLM-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/ar-tracking/world/world-mesh-and-depth-texture"><img src="https://img.shields.io/badge/Depth-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/ar-tracking/world/world-mesh-and-depth-texture"><img src="https://img.shields.io/badge/AR%20Tracking-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/ar-tracking/world/world-mesh-and-depth-texture"><img src="https://img.shields.io/badge/Object%20Tracking-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Depth Cache -->
      <p>Cache depth frames for pixel-to-3D projection with cloud-based vision models.</p>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="./AI Music Gen/">
        <img src="./AI Music Gen/README-ref/sample-list-ai-music-gen-rounded-edges.gif" alt="ai-music-gen" width="250px" />
      </a>
      <h3>AI Music Gen</h3>
      <!-- tags:AI Music Gen -->
      <p>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/overview"><img src="https://img.shields.io/badge/Remote%20Service%20Gateway-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/audio/playing-audio"><img src="https://img.shields.io/badge/Audio%20%26%20Microphone-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list"><img src="https://img.shields.io/badge/Lyria-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/snap3d"><img src="https://img.shields.io/badge/Snap3D-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list"><img src="https://img.shields.io/badge/Gemini-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:AI Music Gen -->
      <p>Generate AI music using Google's Lyria model. Combine genres, vibes, and instruments to create custom music tracks with 3D visualizations.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Agent Manager/">
        <img src="./Agent Manager/README-ref/sample-list-agent-manager-rounded-edges.gif" alt="agent-manager" width="250px" />
      </a>
      <h3>Agent Manager</h3>
      <!-- tags:Agent Manager -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/overview"><img src="https://img.shields.io/badge/Remote%20Service%20Gateway-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list"><img src="https://img.shields.io/badge/AI%20%26%20LLM-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list"><img src="https://img.shields.io/badge/Text%20To%20Speech-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list"><img src="https://img.shields.io/badge/Speech%20To%20Text-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Agent Manager -->
      <p>Multi-agent assistant hub for SPECS—run and manage multiple AI agents with text and voice input.</p>
    </td>
    <td width="33%"></td>
  </tr>
</table>

## Getting Started

Essential projects to get you started with SPECS development

<table>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="./Fetch/">
        <img src="./Fetch/README-ref/sample-list-fetch-rounded-edges.gif" alt="fetch" width="250px" />
      </a>
      <h3>Fetch</h3>
      <!-- tags:Fetch -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/fetch"><img src="https://img.shields.io/badge/Fetch%20%26%20HTTP-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/scripting/scripting-overview"><img src="https://img.shields.io/badge/Scripting-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/experimental-apis"><img src="https://img.shields.io/badge/Experimental%20API-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/web-view"><img src="https://img.shields.io/badge/Web%20View-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Fetch -->
      <p>Sample project using the SPECS Fetch API.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Essentials/">
        <img src="./Essentials/README-ref/sample-list-essentials-rounded-edges.gif" alt="essentials" width="250px" />
      </a>
      <h3>Essentials</h3>
      <!-- tags:Essentials -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/gesture-module"><img src="https://img.shields.io/badge/Gesture%20%26%20Hands-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.AnimationPlayer.html"><img src="https://img.shields.io/badge/Animation%20%26%20Tween-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/physics/physics-overview"><img src="https://img.shields.io/badge/Physics-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.RayCastHit.html"><img src="https://img.shields.io/badge/Raycast-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Essentials -->
      <p>Collection of foundational concepts for creating lenses in Lens Studio.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Throw Lab/">
        <img src="./Throw Lab/README-ref/sample-list-throw-lab-rounded-edges.gif" alt="throw-lab" width="250px" />
      </a>
      <h3>Throw Lab</h3>
      <!-- tags:Throw Lab -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/gesture-module"><img src="https://img.shields.io/badge/Gesture%20%26%20Hands-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.AnimationPlayer.html"><img src="https://img.shields.io/badge/Animation%20%26%20Tween-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/physics/physics-overview"><img src="https://img.shields.io/badge/Physics-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.RayCastHit.html"><img src="https://img.shields.io/badge/Raycast-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Throw Lab -->
      <p>Sample project demonstrating realistic throwing mechanics in AR.</p>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="./Voice Playback/">
        <img src="./Voice Playback/README-ref/sample-list-voice-playback-rounded-edges.gif" alt="voice-playback" width="250px" />
      </a>
      <h3>Voice Playback</h3>
      <!-- tags:Voice Playback -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/Spatial%20UI-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/audio/playing-audio"><img src="https://img.shields.io/badge/Audio%20%26%20Microphone-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/asr-module"><img src="https://img.shields.io/badge/Speech%20%26%20Voice-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/scripting/scripting-overview"><img src="https://img.shields.io/badge/Scripting-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Voice Playback -->
      <p>Sample project for recording and playing back audio on SPECS.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Path Pioneer/">
        <img src="./Path Pioneer/README-ref/sample-list-path-pioneer-rounded-edges.gif" alt="path-pioneer" width="250px" />
      </a>
      <h3>Path Pioneer</h3>
      <!-- tags:Path Pioneer -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/ar-tracking/world/surface-detection"><img src="https://img.shields.io/badge/World%20%26%20Surfaces-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/graphics/materials/overview"><img src="https://img.shields.io/badge/Materials%20%26%20Shaders-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.AnimationPlayer.html"><img src="https://img.shields.io/badge/Animation%20%26%20Tween-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.RayCastHit.html"><img src="https://img.shields.io/badge/Raycast-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Path Pioneer -->
      <p>Sample project for path creation and path walking experience.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Mobile Kit/">
        <img src="./Mobile Kit/README-ref/sample-list-mobile-kit-rounded-edges.gif" alt="spectacles-mobile-kit" width="250px" />
      </a>
      <h3>Mobile Kit</h3>
      <!-- tags:Mobile Kit -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/Spatial%20UI-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/scripting/scripting-overview"><img src="https://img.shields.io/badge/Scripting-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-mobile-kit/getting-started"><img src="https://img.shields.io/badge/Mobile%20Kit-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview"><img src="https://img.shields.io/badge/Networking-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Mobile Kit -->
      <p>SDK for seamless communication between mobile applications and Lenses running on SPECS via BLE.</p>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="./DJ/">
        <img src="./DJ/README-ref/sample-list-dj-rounded-edges.gif" alt="dj" width="250px" />
      </a>
      <h3>DJ</h3>
      <!-- tags:DJ -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/gesture-module"><img src="https://img.shields.io/badge/Gesture%20%26%20Hands-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/audio/playing-audio"><img src="https://img.shields.io/badge/Audio%20%26%20Microphone-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.AnimationPlayer.html"><img src="https://img.shields.io/badge/Animation%20%26%20Tween-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/physics/physics-overview"><img src="https://img.shields.io/badge/Physics-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:DJ -->
      <p>Interactive DJ turntable experience with realistic vinyl physics and multi-track audio mixing.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Industrial Sketch/">
        <img src="./Industrial Sketch/README-ref/sample-list-industrial-sketch-rounded-edges.gif" alt="industrial-sketch" width="250px" />
      </a>
      <h3>Industrial Sketch</h3>
      <!-- tags:Industrial Sketch -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/gesture-module"><img src="https://img.shields.io/badge/Gesture%20%26%20Hands-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/Spatial%20UI-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/graphics/rendering-overview"><img src="https://img.shields.io/badge/3D%20Rendering%20%26%20Meshes-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-sync-kit"><img src="https://img.shields.io/badge/Sync%20Kit-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Industrial Sketch -->
      <p>Hand-tracked 3D sketching and concept modeling: strokes, surfaces, SubD, symmetry and live co-creation.</p>
    </td>
  </tr>
</table>

## Navigation

Location-based and navigation experiences

<table>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="./Custom Locations/">
        <img src="./Custom Locations/README-ref/sample-list-custom-locations-rounded-edges.gif" alt="custom-locations" width="250px" />
      </a>
      <h3>Custom Locations</h3>
      <!-- tags:Custom Locations -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/location"><img src="https://img.shields.io/badge/Location%20%26%20GPS-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/custom-locations"><img src="https://img.shields.io/badge/Location%20AR-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/location-ar/map-component"><img src="https://img.shields.io/badge/Map%20Component-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/remote-apis/snap-places-api"><img src="https://img.shields.io/badge/Places-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Custom Locations -->
      <p>Map real life areas and create AR experiences around those locations.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Navigation Kit/">
        <img src="./Navigation Kit/README-ref/sample-list-navigation-kit-rounded-edges.gif" alt="navigation-kit" width="250px" />
      </a>
      <h3>Navigation Kit</h3>
      <!-- tags:Navigation Kit -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/custom-locations"><img src="https://img.shields.io/badge/Location%20AR-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list"><img src="https://img.shields.io/badge/Outdoor%20Navigation-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/location-ar/map-component"><img src="https://img.shields.io/badge/Map%20Component-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/remote-apis/snap-places-api"><img src="https://img.shields.io/badge/Places-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Navigation Kit -->
      <p>An example project for indoors or outdoors navigation.</p>
    </td>
    <td width="33%"></td>
  </tr>
</table>

## Connected Lenses

Multi-user collaborative experiences

<table>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="./Sync Kit Shared Sync Controls/">
        <img src="./Sync Kit Shared Sync Controls/README-ref/sample-list-shared-sync-controls-rounded-edges.gif" alt="shared-sync-controls" width="250px" />
      </a>
      <h3>Shared Sync Controls</h3>
      <!-- tags:Sync Kit Shared Sync Controls -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-sync-kit"><img src="https://img.shields.io/badge/Sync%20Kit-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview"><img src="https://img.shields.io/badge/Connected%20Lenses-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview"><img src="https://img.shields.io/badge/Networking-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/lens-cloud/lens-cloud-overview"><img src="https://img.shields.io/badge/Multiplayer-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Sync Kit Shared Sync Controls -->
      <p>Real-time collaborative AR experience for shared controls.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Sync Kit Tic Tac Toe/">
        <img src="./Sync Kit Tic Tac Toe/README-ref/sample-list-tic-tac-toe-rounded-edges.gif" alt="tic-tac-toe" width="250px" />
      </a>
      <h3>Tic Tac Toe</h3>
      <!-- tags:Sync Kit Tic Tac Toe -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-sync-kit"><img src="https://img.shields.io/badge/Sync%20Kit-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview"><img src="https://img.shields.io/badge/Connected%20Lenses-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview"><img src="https://img.shields.io/badge/Networking-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/lens-cloud/lens-cloud-overview"><img src="https://img.shields.io/badge/Multiplayer-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Sync Kit Tic Tac Toe -->
      <p>Sample Connected Lens project using Sync Kit.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Sync Kit Laser Pointer/">
        <img src="./Sync Kit Laser Pointer/README-ref/sample-list-laser-pointer-rounded-edges.gif" alt="laser-pointer" width="250px" />
      </a>
      <h3>Laser Pointer</h3>
      <!-- tags:Sync Kit Laser Pointer -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/world-mesh-api"><img src="https://img.shields.io/badge/World%20Query%20%26%20Raycast-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-sync-kit"><img src="https://img.shields.io/badge/Sync%20Kit-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview"><img src="https://img.shields.io/badge/Connected%20Lenses-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/lens-cloud/lens-cloud-overview"><img src="https://img.shields.io/badge/Multiplayer-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Sync Kit Laser Pointer -->
      <p>Create laser pointers on a virtual object that are visible to all connected users.</p>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="./Sync Kit High Five/">
        <img src="./Sync Kit High Five/README-ref/sample-list-high-five-rounded-edges.gif" alt="high-five" width="250px" />
      </a>
      <h3>High Five</h3>
      <!-- tags:Sync Kit High Five -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-sync-kit"><img src="https://img.shields.io/badge/Sync%20Kit-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview"><img src="https://img.shields.io/badge/Connected%20Lenses-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview"><img src="https://img.shields.io/badge/Networking-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/lens-cloud/lens-cloud-overview"><img src="https://img.shields.io/badge/Multiplayer-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Sync Kit High Five -->
      <p>Real-time collaborative AR experience for high-five interactions.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Sync Kit Air Hockey/">
        <img src="./Sync Kit Air Hockey/README-ref/sample-list-air-hockey-rounded-edges.gif" alt="air-hockey" width="250px" />
      </a>
      <h3>Air Hockey</h3>
      <!-- tags:Sync Kit Air Hockey -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-sync-kit"><img src="https://img.shields.io/badge/Sync%20Kit-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview"><img src="https://img.shields.io/badge/Connected%20Lenses-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview"><img src="https://img.shields.io/badge/Networking-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/lens-cloud/lens-cloud-overview"><img src="https://img.shields.io/badge/Multiplayer-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Sync Kit Air Hockey -->
      <p>Sample Connected Lens project using Sync Kit.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Sync Kit Think Out Loud/">
        <img src="./Sync Kit Think Out Loud/README-ref/sample-list-think-out-loud-rounded-edges.gif" alt="think-out-loud" width="250px" />
      </a>
      <h3>Think Out Loud</h3>
      <!-- tags:Sync Kit Think Out Loud -->
      <p>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/gesture-module"><img src="https://img.shields.io/badge/Gesture%20%26%20Hands-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview"><img src="https://img.shields.io/badge/Spatial%20UI-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/lens-studio/features/lens-cloud/lens-cloud-overview"><img src="https://img.shields.io/badge/Snap%20Cloud-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-sync-kit"><img src="https://img.shields.io/badge/Sync%20Kit-Light%20Gray?color=D3D3D3" /></a>
        <a href="https://developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview"><img src="https://img.shields.io/badge/Connected%20Lenses-Light%20Gray?color=D3D3D3" /></a>
      </p>
      <!-- /tags:Sync Kit Think Out Loud -->
      <p>Social AR networking application with floating status panels and real-time connections.</p>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="./Sync Kit Basic Example/">
        <img src="./Sync Kit Basic Example/README-ref/sample-list-spectacles-sync-kit-rounded-edges.gif" alt="spectacles-sync-kit" width="250px" />
      </a>
      <h3>Sync Kit</h3>
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-sync-kit">
  <img src="https://img.shields.io/badge/Sync%20Kit-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview?">
  <img src="https://img.shields.io/badge/Connected%20Lenses-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview?">
  <img src="https://img.shields.io/badge/Networking-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/lens-studio/features/lens-cloud/lens-cloud-overview?">
  <img src="https://img.shields.io/badge/Multiplayer-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>Minimal example of Sync Kit transform synchronization across Connected Lenses.</p>
    </td>
    <td></td>
    <td></td>
  </tr>
</table>

## Snap Cloud

Cloud-powered experiences using Snap Cloud (powered by Supabase)

<table>
  <tr>
    <td align="center" valign="top" width="33%">
      <h3>Snap Cloud Examples (package)</h3>
      <p>Snap Cloud samples now live in the <b>SnapCloudExamples</b> package (Asset Library): auth and tables, realtime, storage, edge functions, media, a global leaderboard and a global counter (one action per user, shared total).</p>
    </td>
    <td width="33%"></td>
    <td width="33%"></td>
  </tr>
</table>

## Templates

Blank starting points for building new projects from scratch.

| Template | Path | Description |
| :--- | :--- | :--- |
| Base Template | `Base Template/` | Minimal empty project — start here for a clean slate. |
| Base Template With Examples | `Base Template With Examples/` | Base template pre-populated with example content to build on. |

## Additional Resources

- **[SPECS Developer Documentation](https://developers.specs.com/)** - Guides and API references
- **[Lens Studio](https://ar.snap.com/lens-studio)** - Download Lens Studio
- **[Community](https://www.reddit.com/r/Spectacles/)** - Connect with other developers and get support
- **[SPECS on GitHub](https://github.com/specs-devs)** - Samples, packages, core frameworks and icons

---

*Built with 👽 by the SPECS team*
