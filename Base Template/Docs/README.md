# Base Template

## What it is
Base Template is a minimal, intentionally empty sample project for Specs. It gives you a clean starting point that
already has Interaction Kit (SIK) and UI Kit installed and a scene set up for Specs, so you can add your own objects
and scripts without any boilerplate. It is for anyone starting a new Specs Lens from scratch.

## What it does
- Opens to an empty world: there is no example content, no UI and no gameplay.
- The scene contains a `Camera Object` with device tracking, a `Lighting` rig (directional and ambient light with an
  environment map), and the `InteractionKit` setup with hand visuals, hand / mouse / mobile interactors and
  interactor cursors.
- Because the Interaction Kit (SIK) is already in the scene, any SIK or UI Kit component you add (for example an
  `Interactable` or a UI Kit button) works immediately with hands in Specs and with the mouse in the Lens Studio
  Preview.

## Highlights
- Ready-to-use Interaction Kit (SIK) and UI Kit packages, plus Icons and Motion.
- Preconfigured device camera texture and render target in `Render/`.
- Environment lighting from a bundled HDR map (`Render/Echopark.hdr`).
- No sample scripts to remove before you start.

## Core scripts
This template ships no scripts of its own; everything interactive comes from the bundled packages. The project
assets a developer looks at first are:

| Script | What it does |
|---|---|
| `Scene.scene` | The only scene: camera, lighting and the Interaction Kit (SIK) setup. |
| `Render/Render Target.renderTarget` | Render target used by the scene camera. |
| `Render/Device Camera Texture.deviceCameraTexture` | Device camera texture available for your own content. |

## Extra info
- **Requires:** Icons, InteractionKit, Motion, UIKit. Works in the Lens Studio Preview and on Specs. Clone with
  Git LFS; a ZIP download will not work.
- **Get started:** open `BaseTemplate.esproj` and add your content to `Assets/Scene.scene`.
- **More docs:** [../README.md](../README.md).
