/**
 * Specs Inc. 2026
 * Spatial Image Depth Animator component for the Spatial Image Gallery Spectacles lens.
 */
import {easingFunctions} from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {SpatialImageAngleValidator} from "./SpatialImageAngleValidator"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger";
import { bindStartEvent, bindUpdateEvent, bindEnableEvent } from "SnapDecorators.lspkg/decorators";

/**
 * Controls the depth scale of the spatial image to reflect the entry of new
 * images as well as ensure it's viewed only from correct angles.
 *
 * @version 1.0.0
 */
@component
export class SpatialImageDepthAnimator extends BaseScriptComponent {
  @typename
  SpatialImage: keyof ComponentNameMap

  @ui.label('<span style="color: #60A5FA;">Spatial Image Depth Animator – animates depth scale of spatialized images</span><br/><span style="color: #94A3B8; font-size: 11px;">Adjusts depth when viewing angle becomes invalid or a new image is loaded.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input("SpatialImage")
  @hint("The SpatialImage component whose depth scale is being animated")
  private spatializer: any

  @input
  @hint("The angle validator that determines when depth flattening should occur")
  private angleValidator: SpatialImageAngleValidator

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @input
  @hint("Speed at which the depth value transitions between flattened and full depth")
  public animateSpeed: number = 0.5

  @input
  @hint("Minimum depth scale applied to the image when flattening is active")
  private minDepth: number = 0.05

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private shouldFlatten: boolean = false
  private baseDepthScale: number = 0
  private depthFlattenFollower: number = 0

  onAwake(): void {
    this.logger = new Logger("SpatialImageDepthAnimator", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
  }

  @bindStartEvent
  private initialize(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()");
    this.baseDepthScale = this.spatializer.depthScale
    this.angleValidator.addOnValidityCallback((valid: boolean) => {
      this.handleAngleValidityChanged(valid)
    })
  }

  @bindUpdateEvent
  private update(): void {
    this.setMaxDepthScale(this.baseDepthScale)
  }

  @bindEnableEvent
  private onEnable(): void {
    this.depthFlattenFollower = 0
  }

  /**
   * Sets the maximum depth scale for the image.
   */
  public setBaseDepthScale(depth: number): void {
    this.baseDepthScale = depth
  }

  private setMaxDepthScale(maxDepthScale: number) {
    if (!this.spatializer.material) {
      return
    }

    const flatten = this.shouldFlatten ? 0 : 1

    const distance = flatten - this.depthFlattenFollower

    if (Math.abs(distance) > 0.01) {
      this.depthFlattenFollower = this.depthFlattenFollower + Math.sign(distance) * getDeltaTime() * this.animateSpeed
    }

    const easedAngle = easingFunctions["ease-in-out-sine"](this.depthFlattenFollower)
    this.spatializer.material.mainPass.depthScale = Math.max(easedAngle * maxDepthScale, this.minDepth)
  }

  private handleAngleValidityChanged(isValid: boolean): void {
    this.shouldFlatten = !isValid
  }
}
