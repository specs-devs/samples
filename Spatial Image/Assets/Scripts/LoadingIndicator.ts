/**
 * Specs Inc. 2026
 * Loading Indicator component for the Spatial Image Gallery Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindUpdateEvent, bindEnableEvent } from "SnapDecorators.lspkg/decorators";

/**
 * This script fills a loading indicator to represent progress while a task is
 * completed.
 *
 * @version 1.0.0
 */
@component
export class LoadingIndicator extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Loading Indicator – animates a progress ring while spatializing</span><br/><span style="color: #94A3B8; font-size: 11px;">Attach to a mesh with a progress_value material parameter.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @input
  @hint("Rate at which the progress ring fills per second")
  private progressionSpeed: number = 0.3

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private material: Material
  private progress: number = 0

  /**
   * Allows custom start and stop functions to be added to the indicator.
   */
  public checkProgressing?: () => boolean

  onAwake(): void {
    this.logger = new Logger("LoadingIndicator", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
    this.material = this.sceneObject.getComponent("Component.RenderMeshVisual").mainMaterial
  }

  @bindEnableEvent
  private onEnable(): void {
    this.progress = 0
  }

  @bindUpdateEvent
  private onUpdate(): void {
    if (!this.checkProgressing || this.checkProgressing()) {
      this.progress += getDeltaTime() * this.progressionSpeed
    } else {
      this.progress = 0.05
    }
    this.material.mainPass.progress_value = Math.min(this.progress, 0.95)
  }

  /**
   * Resets the progression to 0.
   */
  public reset(): void {
    this.progress = 0
  }
}
