/**
 * SPECS Inc. 2027
 * Spatial Image Swapper component for the Spatial Image Gallery Glasses lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindStartEvent } from "SnapDecorators.lspkg/decorators";

/**
 * Responsible to changing the active scene object between a flat version and
 * the spatialized version when the onLoaded event triggers.
 */
@component
export class SpatialImageSwapper extends BaseScriptComponent {
  @typename
  SpatialImage: keyof ComponentNameMap

  @ui.label('<span style="color: #60A5FA;">Spatial Image Swapper – controls flat/spatialized display state</span><br/><span style="color: #94A3B8; font-size: 11px;">Manages switching between flat image and spatialized 3D version.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input("SpatialImage")
  @hint("The SpatialImage component used for spatialization")
  private spatializer

  @input
  @hint("The flat Image mesh displayed before spatialization completes")
  private flatImage: Image

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @input
  @hint("If true, automatically swaps to the spatialized image once loading finishes")
  private autoSwapToSpatialized: boolean = false

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
    this.logger = new Logger("SpatialImageSwapper", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
  }

  /**
   * Sets the texture of the flat version of the image.
   *
   * @param image - The texture to be applied.
   */
  public setImage(image: Texture): void {
    if (this.flatImage) {
      this.flatImage.mainMaterial.mainPass.baseTex = image
      // Show the flat photo again while the next one spatializes (setSpatial hid it for the
      // previous photo). The spatializer stays enabled so it keeps loading.
      this.flatImage.sceneObject.enabled = true

      // Match the spatialized image: frameHeight tall (the Image quad is 1 unit), same aspect ratio.
      const aspectRatio = image.getWidth() / image.getHeight()
      const height = this.spatializer.frameHeight
      this.flatImage.sceneObject.getTransform().setLocalScale(new vec3(height * aspectRatio, height, 1))
    }

    if (this.spatializer.spatialImage) {
      this.spatializer.spatialImage.enabled = false
      this.spatializer.spatialImage = null
    }
  }

  /**
   * If true, the spatialized image will be displayed and the depth animated in.
   * If false, the flat image will be displayed.
   */
  public setSpatialized(spatialized: boolean): void {
    if (spatialized) {
      this.setSpatial()
    } else {
      this.setFlat()
    }
  }

  @bindStartEvent
  private initialize(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()");
    if (this.autoSwapToSpatialized) {
      this.spatializer.onLoaded.add((status: number) => {
        if (status === 1) {
          this.setSpatialized(true)
        } else {
          this.logger.warn("Image did not successfully spatialize.")
        }
      })
    }
  }

  private setFlat(): void {
    this.flatImage.sceneObject.enabled = true
    this.spatializer.sceneObject.enabled = false
  }

  private setSpatial(): void {
    this.flatImage.sceneObject.enabled = false
    this.spatializer.sceneObject.enabled = true
  }
}
