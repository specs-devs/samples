/**
 * Specs Inc. 2026
 * Spatial Image Frame component for the Spatial Image Gallery Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindStartEvent, bindEnableEvent } from "SnapDecorators.lspkg/decorators";

/**
 * Standalone spatial image frame — manages spatialization and focal point.
 *
 * @version 2.0.0
 */
@component
export class SpatialImageFrame extends BaseScriptComponent {
  @typename
  SpatialImage: keyof ComponentNameMap

  @ui.label('<span style="color: #60A5FA;">Spatial Image Frame – manages spatial image display</span><br/><span style="color: #94A3B8; font-size: 11px;">Standalone frame that spatializes images and tracks focal point from camera distance.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input("SpatialImage")
  @hint("The SpatialImage component used for spatialization")
  private spatializer

  @input
  @hint("The camera SceneObject used for focal point calculation")
  private camera: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @input
  @allowUndefined
  @hint("Optional default image texture to display on initialization")
  private imageTexture: Texture

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;

  onAwake(): void {
    this.logger = new Logger("SpatialImageFrame", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
  }

  @bindStartEvent
  private initializeFrame(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()");
    this.spatializer.sceneObject.enabled = false

    this.spatializer.frameOn = true
    this.spatializer.fadeBorder = true

    if (this.imageTexture) {
      this.setImage(this.imageTexture)
    }
  }

  @bindEnableEvent
  private onEnable(): void {
    this.setFocalPoint()
  }

  /**
   * Spatializes the passed texture.
   *
   * @param image - The image to be spatialized.
   */
  public setImage(image: Texture): void {
    this.spatializer.setImage(image)
  }

  private setFocalPoint() {
    const cameraPosition = this.camera.getTransform().getWorldPosition()
    const imagePos = this.spatializer.getTransform().getWorldPosition()
    const distance = cameraPosition.distance(imagePos)
    this.spatializer.setFrameOffset(-distance)
  }
}
