/**
 * Specs Inc. 2026
 * Spatial Image Angle Validator component for the Spatial Image Gallery Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators";

/**
 * Tracks the users point of view and emits events on whether they are viewing
 * from a valid angle or not.
 *
 * @version 1.0.0
 */
@component
export class SpatialImageAngleValidator extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Spatial Image Angle Validator – monitors viewing angle validity</span><br/><span style="color: #94A3B8; font-size: 11px;">Emits callbacks when the user enters or exits the valid viewing zone.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("The SceneObject representing the spatial image being observed")
  private image: SceneObject

  @input
  @hint("The camera SceneObject used to determine the viewing angle")
  private camera: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @input
  @hint("Distance behind the image for the focal point used to compute the observation angle")
  public validZoneFocal: number = 2.0

  @input
  @hint("Angular range in degrees within which no depth flattening is applied")
  public validZoneAngle: number = 25

  @input
  @hint("Angle threshold in degrees that must be exceeded when transitioning between zones")
  private validZoneThreshold: number = 5

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private onValidityCallbacks: ((valid: boolean) => void)[] = []
  private lastAngle: number

  onAwake(): void {
    this.logger = new Logger("SpatialImageAngleValidator", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
  }

  @bindUpdateEvent
  private onUpdate(): void {
    const angle = this.calculateObservationAngle()
    if (this.lastAngle < this.validZoneAngle && angle > this.validZoneAngle) {
      this.onValidityCallbacks.forEach((callback) => callback(false))
    } else if (
      this.lastAngle > this.validZoneAngle - this.validZoneThreshold &&
      angle < this.validZoneAngle - this.validZoneThreshold
    ) {
      this.onValidityCallbacks.forEach((callback) => callback(true))
    }

    this.lastAngle = angle
  }

  private calculateObservationAngle() {
    const cameraPosition = this.camera.getTransform().getWorldPosition()
    const imageTransform = this.image.getTransform()
    const imagePos = imageTransform.getWorldPosition()
    const imageFocalDisplacement = imageTransform.getWorldRotation().multiplyVec3(new vec3(0, 0, this.validZoneFocal))
    const imageFocal = imagePos.sub(imageFocalDisplacement)
    const displacement = cameraPosition.sub(imageFocal)
    const displacementDirection = displacement.normalize()
    const angle = displacementDirection.dot(this.image.getTransform().getWorldRotation().multiplyVec3(vec3.forward()))

    return (1 - angle) * 90
  }

  /**
   * Sets the focal point of the valid zone.
   *
   * @remarks This allows the user to move their head around in front of the
   * image without it being considered an extreme angle.
   */
  public setValidZoneFocal(focal: number): void {
    this.validZoneFocal = focal
  }

  /**
   * Sets the angle, in degrees, at which the angle is considered valid.
   */
  public setValidZoneAngle(angle: number): void {
    this.validZoneAngle = angle
  }

  /**
   * Add a callback to onValidityCallbacks, to be called when the image is fully loaded.
   * @param callback - the callback to add
   */
  public addOnValidityCallback(callback: (entered: boolean) => void): void {
    this.onValidityCallbacks.push(callback)
  }

  /**
   * Remove a callback from the onValidityCallbacks.
   * @param callback - the callback to remove
   */
  public removeOnValidityCallback(callback: (entered: boolean) => void): void {
    this.onValidityCallbacks = this.onValidityCallbacks.filter((cb) => cb !== callback)
  }
}
