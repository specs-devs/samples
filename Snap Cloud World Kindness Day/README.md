# World Kindness Day

[![SIK](https://img.shields.io/badge/SIK-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/overview?) [![Cloud](https://img.shields.io/badge/Cloud-Light%20Gray?color=D3D3D3)](https://cloud.snap.com) [![ASR](https://img.shields.io/badge/ASR-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/apis/asr-module) [![Gesture Module](https://img.shields.io/badge/Gesture%20Module-Light%20Gray?color=D3D3D3)](https://developers.snap.com/spectacles/about-spectacles-features/apis/gesture-module?)

<img src="./README-ref/sample-list-world-kindness-day-rounded-edges.gif" alt="World Kindness Day Lens" width="500" />

## Overview

This sample demonstrates how a Spectacles Lens can send structured data to a cloud database and display real-time updates both inside the experience and in an external web application. Users choose a balloon and speak a kindness pledge; the Lens writes the record to Supabase via Snap Cloud and the global pledge counter updates instantly. The companion web app visualizes all pledges in real time. Learn more about [Snap Cloud](https://developers.snap.com/spectacles/about-spectacles-features/snap-cloud/overview).

> **NOTE:**
> This project will only work for the Spectacles platform. You must set the simulation mode on Lens Studio Preview to `Spectacles (2024)`.
> This project also requires you to create your own Snap Cloud / Supabase project. Without a backend configured, the Lens will not function. Please follow the [WKD - Supabase Setup Guide](https://developers.snap.com/spectacles/about-spectacles-features/snap-cloud/WKD/Snapcloud-setup.md) before continuing.

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

### Set Up Your Snap Cloud Project

You will need a [Snap Cloud project](https://developers.snap.com/spectacles/about-spectacles-features/snap-cloud/getting-started) containing the same tables and RPC functions used in this Lens.

Please follow the [WKD - Supabase Setup Guide](https://developers.snap.com/spectacles/about-spectacles-features/snap-cloud/WKD/Snapcloud-setup.md), which walks you through:

- Creating your Supabase project.
- Adding the required tables (`kindness_pledges`, `kindness_totals`).
- Creating the RPC functions (`pledge_and_total_once`, `get_kindness_total_all`, etc.).
- Setting the correct permissions.
- (Optional) Adding test data to verify your setup.

You must complete the Supabase setup before the Lens can successfully read or write any data.

### Add Supabase Plugin Into Your Lens Project

1. Install `Supabase Plugin` and `SupabaseClient` package from the Asset Library.
2. Log in using your Snapchat account.
3. In the Supabase panel (Window -> Supabase), create a new project or link an existing one.
4. Click `Import Credentials`, this generates a Supabase Project asset in your Lens.
5. Drag this asset into the `KindnessCounter` script's Supabase Project input field.

All required objects and scripts are already set up in this project, but you should double-check that the correct inputs are assigned:

- Balloon prefabs: Make sure the balloon prefab array is populated in the `KindnessCounter` script inputs.
- Start and End Screen roots: Confirm `Start Root` and `End Root` are assigned to the correct scene object groups.
- UI Text component: Ensure the `Total Text` is linked to its corresponding Text component in the scene.

## Key Script

[KindnessCounter.ts](./Assets/Scripts/KindnessCounter.ts) - Manages all Supabase interactions: authenticates the user, checks pledge history, submits pledges via RPC, retrieves the global total, and controls screen transitions and balloon spawning.

[BalloonManager.ts](./Assets/Scripts/BalloonManager.ts) - Handles balloon interaction logic using Interactable components; detects pinch gestures, hides unselected balloons, triggers the pledge flow, and plays the lift animation on pledge completion.

[PledgeReadInOrder.ts](./Assets/Scripts/PledgeReadInOrder.ts) - Coordinates the ASR voice interaction; activates the on-device speech recognition module and listens for the pledge phrase word by word, triggering the balloon animation when all words are matched.

## Testing the Lens

### In Lens Studio Editor

1. Open the Preview panel in Lens Studio.
2. Set Device Type Override to `Spectacles (2024)`.
3. Make sure your `SupabaseProject` credentials are imported and correctly assigned in the `KindnessCounter` script.
4. Use the Preview panel to test the flow:
   - Balloon interactions.
   - Voice pledge phrase.
   - Transitions between start and end screens.

### In Spectacles Device

1. Build and deploy the project to your Spectacles device.
2. Follow the [Spectacles guide](https://developers.snap.com/spectacles/get-started/start-building/preview-panel) for device testing.
3. Pinch a balloon to begin.
4. Speak your pledge ("I promise to be kind today").
5. Watch your balloon float up.
6. The Lens will send your pledge to Supabase and display the updated global total on the end screen.

## Support

If you have any questions or need assistance, please don't hesitate to reach out. Our community is here to help, and you can connect with us and ask for support [here](https://www.reddit.com/r/Spectacles/). We look forward to hearing from you and are excited to assist you on your journey!

## Contributing

Feel free to provide improvements or suggestions or directly contributing via merge request. By sharing insights, you help everyone else build better Lenses.

---

*Built with <3 by the Spectacles team*

---
 
