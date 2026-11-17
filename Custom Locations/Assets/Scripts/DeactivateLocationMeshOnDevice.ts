/**
 * Glasses Inc. 2026
 * Deactivate Location Mesh On Device component for the CustomLocations package.
 *
 * Attach to the SceneObject that holds the CustomLocationGroupComponent. The scan meshes of the
 * child Located At objects stay visible in Lens Studio (so content can be placed against them) and
 * are hidden on device.
 */
import {Logger} from "./Logger"

@component
export class DeactivateLocationMeshOnDevice extends BaseScriptComponent {
  @ui.label(
    '<span style="color: #60A5FA;">DeactivateLocationMeshOnDevice – Hides location meshes on device</span><br/><span style="color: #94A3B8; font-size: 11px;">Attach to a Custom Location Group to hide scan meshes on device while keeping them visible in Lens Studio.</span>'
  )
  @ui.separator
  @input
  @hint("Also hide the scan meshes in Lens Studio Preview")
  hideInEditor: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  private logger: Logger
  private meshVisuals: RenderMeshVisual[] = []

  onAwake(): void {
    this.logger = new Logger("DeactivateLocationMeshOnDevice", this.enableLogging)
    this.createEvent("OnStartEvent").bind(() => this.onStart())
  }

  private onStart(): void {
    this.collectLocationMeshes()
    const hide = this.hideInEditor || !global.deviceInfoSystem.isEditor()
    if (hide) {
      this.setMeshesVisible(false)
    }
  }

  /** RenderMeshVisuals found on the child Located At objects. */
  get locationMeshVisuals(): RenderMeshVisual[] {
    return this.meshVisuals
  }

  /** Show or hide every collected scan mesh (used by the example panel). */
  setMeshesVisible(visible: boolean): void {
    for (const visual of this.meshVisuals) {
      if (!isNull(visual)) visual.enabled = visible
    }
    this.logger.debug(`${visible ? "Showing" : "Hiding"} ${this.meshVisuals.length} location mesh(es)`)
  }

  private collectLocationMeshes(): void {
    this.meshVisuals = []
    for (const child of this.getSceneObject().children) {
      const locatedAt = child.getComponent("LocatedAtComponent") as LocatedAtComponent | null
      if (!locatedAt) continue
      const visual = child.getComponent("Component.RenderMeshVisual") as RenderMeshVisual | null
      if (visual) this.meshVisuals.push(visual)
    }
  }
}
