/**
 * Specs Inc. 2026
 * Scale In Located Object component for the Custom Locations Spectacles lens.
 */
import { LocatedObject } from "./LocatedObject"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"

/**
 * Animates appearing and disappearing through scaling.
 */
@component
export class ScaleInLocatedObject extends BaseScriptComponent implements LocatedObject {
  @ui.label('<span style="color: #60A5FA;">ScaleInLocatedObject – Scale-in animation for located objects</span><br/><span style="color: #94A3B8; font-size: 11px;">Scales a scene object in and out when the location is activated or deactivated.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Scene Objects</span>')
  @input
  @allowUndefined
  @hint("Will be enabled the first time it is activated")
  contentSceneObject: SceneObject

  @ui.label('<span style="color: #60A5FA;">Animation</span>')
  @input
  @hint("Speed delta per frame applied to the scale animation; modified at runtime by activate and deactivate")
  private animationSpeed: number = 0.0

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private targetScaleIn: number = 0.0

  onAwake(): void {
    this.logger = new Logger("ScaleInLocatedObject", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    const t = this.contentSceneObject.getTransform()
    this.targetScaleIn = t.getLocalScale().x
    t.setLocalScale(new vec3(0, 0, 0))
  }

  @bindUpdateEvent
  private onUpdate(): void {
    if (this.animationSpeed !== 0.0) {
      const t = this.contentSceneObject.getTransform()
      let currScale = t.getLocalScale().x + this.animationSpeed

      if (currScale < 0) {
        currScale = 0
        this.animationSpeed = 0
      } else if (currScale > this.targetScaleIn) {
        currScale = this.targetScaleIn
        this.animationSpeed = 0
      }

      t.setLocalScale(new vec3(currScale, currScale, currScale))
    }
  }

  public activate(): void {
    if (this.contentSceneObject) {
      if (!this.contentSceneObject.enabled) {
        this.contentSceneObject.enabled = true
      }
    }

    this.animationSpeed = this.targetScaleIn * 0.05
  }

  public deactivate(): void {
    this.animationSpeed = this.targetScaleIn * -0.05
  }

  public localize(): void {}
}
