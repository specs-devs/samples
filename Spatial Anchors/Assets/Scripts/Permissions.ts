@component
export class Permissions extends BaseScriptComponent {
  onAwake() {
    // ConnectedLensModule is ONLY needed for cloud storage.
    // For local-only persistence, loading it interferes with the
    // spatial persistence mapping system. The old working sample
    // does NOT load it.
    // require("LensStudio:ConnectedLensModule")
  }
}
