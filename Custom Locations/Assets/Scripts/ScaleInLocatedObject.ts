/**
 * Glasses Inc. 2026
 * Scale In Located Object component for the CustomLocations package.
 * Animates a piece of content in and out through scaling when its location is activated.
 */
import {LocatedObject} from "./LocatedObject"
import {Logger} from "./Logger"

@component
export class ScaleInLocatedObject extends BaseScriptComponent implements LocatedObject {
  @ui.label(
    '<span style="color: #60A5FA;">ScaleInLocatedObject – Scale-in animation for located objects</span><br/><span style="color: #94A3B8; font-size: 11px;">Scales a scene object in and out when the location is activated or deactivated.</span>'
  )
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Scene Objects</span>')
  @input
  @allowUndefined
  @hint("Content to show. Enabled the first time it is activated; defaults to this SceneObject")
  contentSceneObject: SceneObject

  @ui.label('<span style="color: #60A5FA;">Animation</span>')
  @input
  @hint("Fraction of the target scale applied per frame while animating (0.05 = ~20 frames)")
  animationStep: number = 0.05

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  private logger: Logger
  private content: SceneObject
  private targetScaleIn: number = 1
  private animationSpeed: number = 0

  onAwake(): void {
    this.logger = new Logger("ScaleInLocatedObject", this.enableLogging)
    this.content = this.contentSceneObject ?? this.getSceneObject()

    const t = this.content.getTransform()
    this.targetScaleIn = t.getLocalScale().x
    t.setLocalScale(vec3.zero())

    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private onUpdate(): void {
    if (this.animationSpeed === 0) return

    const t = this.content.getTransform()
    let currScale = t.getLocalScale().x + this.animationSpeed

    if (currScale <= 0) {
      currScale = 0
      this.animationSpeed = 0
    } else if (currScale >= this.targetScaleIn) {
      currScale = this.targetScaleIn
      this.animationSpeed = 0
    }

    t.setLocalScale(new vec3(currScale, currScale, currScale))
  }

  public activate(): void {
    if (!this.content.enabled) {
      this.content.enabled = true
    }
    this.animationSpeed = this.targetScaleIn * Math.abs(this.animationStep)
    this.logger.debug(`activate ${this.content.name}`)
  }

  public deactivate(): void {
    this.animationSpeed = -this.targetScaleIn * Math.abs(this.animationStep)
    this.logger.debug(`deactivate ${this.content.name}`)
  }

  public localize(): void {}
}
