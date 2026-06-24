# Specs Samples

A comprehensive collection of templates and examples for building Lens experiences on Specs.

> [!IMPORTANT]
> **This `main` branch targets SPECS 27 with Lens Studio 5.22.0+ and will NOT work with Spectacles (2024).**
> For Spectacles (2024) development, switch to the [`5.15.4` branch](https://github.com/specs-devs/samples/tree/5.15.4) or download the [`5.15.4` release](https://github.com/specs-devs/samples/releases/tag/5.15.4) zip.

## What you'll find here

This repository contains multiple template projects showcasing different features and capabilities available when building for Specs. Each template is a complete, working example that you can use as a starting point for your own projects.

## Prerequisites

### Git LFS Required

**This repository requires Git LFS (Large File Storage) to be installed and configured.** The templates contain large assets including 3D models, textures, images, and media files that are tracked using Git LFS.

#### Installing Git LFS

**macOS (using Homebrew):**
```bash
brew install git-lfs
```

**Windows:**
Download and install from [git-lfs.github.com](https://git-lfs.github.com/)

**Linux:**
```bash
# Debian/Ubuntu
sudo apt-get install git-lfs

# Fedora/Red Hat
sudo dnf install git-lfs
```

#### Setting Up Git LFS

After installing Git LFS, you need to set it up:

```bash
git lfs install
```

#### Cloning This Repository

When cloning this repository, Git LFS will automatically download the large files:

```bash
git clone <repository-url>
cd samples
```

If you've already cloned the repository without Git LFS installed, you can fetch the LFS files:

```bash
git lfs install
git lfs pull
```

#### Verifying Git LFS

To verify that Git LFS is working correctly:

```bash
git lfs ls-files
```

This will show you all files tracked by Git LFS.

## AI

AI-powered experiences and integrations

<table>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="./AI Playground/">
        <img src="./AI Playground/README-ref/sample-list-ai-playground-rounded-edges.gif" alt="ai-playground" width="250px" />
      </a>
      <h3>AI Playground</h3>
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/overview">
  <img src="https://img.shields.io/badge/Remote%20Service%20Gateway-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list">
  <img src="https://img.shields.io/badge/Text%20To%20Speech-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list">
  <img src="https://img.shields.io/badge/Speech%20To%20Text-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/camera-module?">
  <img src="https://img.shields.io/badge/Camera%20Access-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatability-list">
  <img src="https://img.shields.io/badge/AI%20Vision-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list">
  <img src="https://img.shields.io/badge/LLM-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list">
  <img src="https://img.shields.io/badge/Vision-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/lens-studio/features/audio/playing-audio?">
  <img src="https://img.shields.io/badge/Audio-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>Sample project for AI in using Specs Remote Service Gateway.</p>
    </td>
<td align="center" valign="top" width="33%">
      <a href="./Crop/">
        <img src="./Crop/README-ref/sample-list-crop-rounded-edges.gif" alt="crop" width="250px" />
      </a>
      <h3>Crop</h3>
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/overview">
  <img src="https://img.shields.io/badge/Remote%20Service%20Gateway-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/experimental-apis?">
  <img src="https://img.shields.io/badge/Experimental%20API-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list">
  <img src="https://img.shields.io/badge/Text%20To%20Speech-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list">
  <img src="https://img.shields.io/badge/Speech%20To%20Text-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/camera-module?">
  <img src="https://img.shields.io/badge/Camera%20Access-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatability-list">
  <img src="https://img.shields.io/badge/AI%20Vision-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list">
  <img src="https://img.shields.io/badge/LLM-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list">
  <img src="https://img.shields.io/badge/Vision-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/fetch?">
  <img src="https://img.shields.io/badge/Fetch-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/web-view?">
  <img src="https://img.shields.io/badge/Web%20View-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/gesture-module?">
  <img src="https://img.shields.io/badge/Gesture%20Module-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>Sample project showing how to "crop" the environment using hand gesture.</p>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="./Depth Cache/">
        <img src="./Depth Cache/README-ref/sample-list-depth-cache-rounded-edges.gif" alt="depth-cache" width="250px" />
      </a>
      <h3>Depth Cache</h3>
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/overview">
  <img src="https://img.shields.io/badge/Remote%20Service%20Gateway-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/asr-module">
  <img src="https://img.shields.io/badge/ASR-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/AI-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/lens-studio/features/ar-tracking/world/world-mesh-and-depth-texture">
  <img src="https://img.shields.io/badge/Depth-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/AR%20Tracking-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/Object%20Tracking-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>Cache depth frames for pixel-to-3D projection with cloud-based vision models.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./AI Music Gen/">
        <img src="./AI Music Gen/README-ref/sample-list-ai-music-gen-rounded-edges.gif" alt="ai-music-gen" width="250px" />
      </a>
      <h3>AI Music Gen</h3>
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/overview">
  <img src="https://img.shields.io/badge/Remote%20Service%20Gateway-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list">
  <img src="https://img.shields.io/badge/Speech%20To%20Text-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list">
  <img src="https://img.shields.io/badge/Lyria-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/snap3d">
  <img src="https://img.shields.io/badge/Snap3D-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list">
  <img src="https://img.shields.io/badge/Gemini-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/lens-studio/features/audio/playing-audio?">
  <img src="https://img.shields.io/badge/Audio-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-ui-kit">
  <img src="https://img.shields.io/badge/UIKit-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>Generate AI music using Google's Lyria model. Combine genres, vibes, and instruments to create custom music tracks with 3D visualizations.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Agent Manager/">
        <img src="./Agent Manager/README-ref/agent-multitask.gif" alt="agent-manager" width="250px" />
      </a>
      <h3>Agent Manager</h3>
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/overview">
  <img src="https://img.shields.io/badge/Remote%20Service%20Gateway-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list">
  <img src="https://img.shields.io/badge/LLM-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list">
  <img src="https://img.shields.io/badge/Text%20To%20Speech-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatibility-list">
  <img src="https://img.shields.io/badge/Speech%20To%20Text-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>Multi-agent assistant hub for Specs—run and manage multiple AI agents with text and voice input.</p>
    </td>
  </tr>
</table>


## Getting Started

Essential projects to get you started with Specs development

<table>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="./Fetch/">
        <img src="./Fetch/README-ref/sample-list-fetch-rounded-edges.gif" alt="fetch" width="250px" />
      </a>
      <h3>Fetch</h3>
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/experimental-apis?">
  <img src="https://img.shields.io/badge/Experimental%20API-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/fetch?">
  <img src="https://img.shields.io/badge/Fetch-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/web-view?">
  <img src="https://img.shields.io/badge/Web%20View-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>Sample project using the Specs Fetch API.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Essentials/">
        <img src="./Essentials/README-ref/sample-list-essentials-rounded-edges.gif" alt="essentials" width="250px" />
      </a>
      <h3>Essentials</h3>
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/lens-studio/features/physics/physics-overview?">
  <img src="https://img.shields.io/badge/Physics-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/gesture-module?">
  <img src="https://img.shields.io/badge/Gesture%20Module-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/lens-studio/api/lens-scripting/modules/Packages_LSTween_LSTween.html?">
  <img src="https://img.shields.io/badge/Animation-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.RayCastHit.html">
  <img src="https://img.shields.io/badge/Raycast-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>Collection of foundational concepts for creating lenses in Lens Studio.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Spatial Image/">
        <img src="./Spatial Image/README-ref/sample-list-spatial-image-rounded-edges.gif" alt="spatial-image" width="250px" />
      </a>
      <h3>Spatial Image</h3>
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/spatial-image?">
  <img src="https://img.shields.io/badge/Spatial%20Image-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>Convert your 2D images to 3D.</p>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="./Throw Lab/">
        <img src="./Throw Lab/README-ref/sample-list-throw-lab-rounded-edges.gif" alt="throw-lab" width="250px" />
      </a>
      <h3>Throw Lab</h3>
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/lens-studio/features/physics/physics-overview?">
  <img src="https://img.shields.io/badge/Physics-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/gesture-module?">
  <img src="https://img.shields.io/badge/Gesture%20Module-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>Sample project demonstrating realistic throwing mechanics in AR.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Voice Playback/">
        <img src="./Voice Playback/README-ref/sample-list-voice-playback-rounded-edges.gif" alt="voice-playback" width="250px" />
      </a>
      <h3>Voice Playback</h3>
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/lens-studio/features/audio/playing-audio?">
  <img src="https://img.shields.io/badge/Audio-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>Sample project for recording and playing back audio on Specs.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Path Pioneer/">
        <img src="./Path Pioneer/README-ref/sample-list-path-pioneer-rounded-edges.gif" alt="path-pioneer" width="250px" />
      </a>
      <h3>Path Pioneer</h3>
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/lens-studio/api/lens-scripting/classes/Built-In.RayCastHit.html">
  <img src="https://img.shields.io/badge/Raycast-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/lens-studio/features/graphics/materials/overview">
  <img src="https://img.shields.io/badge/Graphics%20Material%20Particles-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>Sample project for path creation and path walking experience.</p>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="./Specs Mobile Kit/">
        <img src="./Specs Mobile Kit/README-ref/sample-list-mobile-kit-rounded-edges.gif" alt="spectacles-mobile-kit" width="250px" />
      </a>
      <h3>Specs Mobile Kit</h3>
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-mobile-kit/getting-started">
  <img src="https://img.shields.io/badge/Mobile%20Kit-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>SDK for seamless communication between mobile applications and Lenses running on Specs via BLE.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./DJ Specs/">
        <img src="./DJ Specs/README-ref/sample-list-dj-specs-rounded-edges.gif" alt="dj-specs" width="250px" />
      </a>
      <h3>DJ Specs</h3>
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/lens-studio/features/audio/playing-audio?">
  <img src="https://img.shields.io/badge/Audio-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/hand-tracking">
  <img src="https://img.shields.io/badge/Hand%20Tracking-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/lens-studio/features/physics/physics-overview?">
  <img src="https://img.shields.io/badge/Physics-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>Interactive DJ turntable experience with realistic vinyl physics and multi-track audio mixing.</p>
    </td>
    <td></td>
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
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/custom-locations">
  <img src="https://img.shields.io/badge/Location%20AR-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>Map real life areas and create AR experiences around those locations.</p>
    </td>
    <td align="center" valign="top" width="33%">
      <a href="./Navigation Kit/">
        <img src="./Navigation Kit/README-ref/sample-list-navigation-kit-rounded-edges.gif" alt="navigation-kit" width="250px" />
      </a>
      <h3>Navigation Kit</h3>
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/lens-studio/features/location-ar/custom-landmarker?">
  <img src="https://img.shields.io/badge/Location%20AR-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/compatability-list?">
  <img src="https://img.shields.io/badge/Outdoor%20Navigation-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/lens-studio/features/location-ar/map-component?">
  <img src="https://img.shields.io/badge/Map%20Component-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/lens-studio/features/remote-apis/snap-places-api?">
  <img src="https://img.shields.io/badge/Places-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>An example project for indoors or outdoors navigation.</p>
    </td>
    <td></td>
  </tr>
</table>

## Connected Lenses

Multi-user collaborative experiences

<table>
  <tr>
    <td align="center" valign="top" width="33%">
      <a href="./Sync Kit Basic Example/">
        <img src="./Sync Kit Basic Example/README-ref/sample-list-spectacles-sync-kit-rounded-edges.gif" alt="spectacles-sync-kit" width="250px" />
      </a>
      <h3>Specs Sync Kit</h3>
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
      <p>Minimal example of Specs Sync Kit transform synchronization across Connected Lenses.</p>
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
      <a href="./Snap Cloud World Kindness Day/">
        <img src="./Snap Cloud World Kindness Day/README-ref/sample-list-world-kindness-day-rounded-edges.gif" alt="snap-cloud-world-kindness-day" width="250px" />
      </a>
      <h3>Snap Cloud World Kindness Day</h3>
      <p>
<a href="https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?">
  <img src="https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://cloud.snap.com">
  <img src="https://img.shields.io/badge/Cloud-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/asr-module">
  <img src="https://img.shields.io/badge/ASR-Light%20Gray?color=D3D3D3" />
</a>
<a href="https://developers.snap.com/spectacles/about-spectacles-features/apis/gesture-module?">
  <img src="https://img.shields.io/badge/Gesture%20Module-Light%20Gray?color=D3D3D3" />
</a>
      </p>
      <p>Demonstrating Snap Cloud integration with real-time database updates and a companion web app.</p>
    </td>
    <td></td>
    <td></td>
  </tr>
</table>

## Templates

Blank starting points for building new projects from scratch.

| Template | Path | Description |
| :--- | :--- | :--- |
| Specs Base Template | `Specs Base Template/` | Minimal empty project — start here for a clean slate. |
| Specs Base Template With Examples | `Specs Base Template With Examples/` | Base template pre-populated with example content to build on. |

## Additional Resources

- **[Specs Developer Documentation](https://developers.snap.com/spectacles)** - Complete guides and API references
- **[Design Guidelines](https://developers.snap.com/spectacles/best-practices/design-for-spectacles/introduction-to-spatial-design)** - Best practices for Specs design
- **[Lens Studio](https://ar.snap.com/lens-studio)** - Download the latest version of Lens Studio
- **[Community Forum](https://www.reddit.com/r/Spectacles/)** - Connect with other developers and get support

## Getting Started

1. **Install Git LFS** (see [Prerequisites](#prerequisites) section above)
2. **Clone this repository** with Git LFS enabled
3. **Open any project folder** in Lens Studio
4. **Explore the templates** and start building!

> ⚠️ **Important:** Make sure Git LFS is installed before cloning, otherwise large assets won't download correctly.

## Contributing

We welcome contributions on existing project! Feel free to submit pull requests or open issues.

---*Maintained with 👽 by the SPECS Team*


