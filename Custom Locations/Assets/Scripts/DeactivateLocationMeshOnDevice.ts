/**
 * Specs Inc. 2026
 * Deactivate Location Mesh On Device component for the Custom Locations Spectacles lens.
 */
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"

/**
 * Attach to an instance of {@link CustomLocationGroup} to disable location
 * meshes when on device but leaving them on in Lens Studio.
 */
@component
export class DeactivateLocationMeshOnDevice extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">DeactivateLocationMeshOnDevice – Hides location meshes on device</span><br/><span style="color: #94A3B8; font-size: 11px;">Attach to a CustomLocationGroup to hide scan meshes on device while keeping them visible in Lens Studio.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private onAwake(): void {
    this.logger = new Logger("DeactivateLocationMeshOnDevice", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  private onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    if (global.deviceInfoSystem.isEditor()) {
      return
    }
    this.deactivateChildMeshes()
  }

  private deactivateChildMeshes(): void {
    const locatedAtChildren = this.sceneObject.children.map((element) => element.getComponent("LocatedAtComponent"))
    const withMeshVisualAttached = locatedAtChildren.map((element) =>
      element?.sceneObject.getComponent("RenderMeshVisual")
    )
    withMeshVisualAttached.forEach((element) => {
      element.enabled = false
    })
  }
}
