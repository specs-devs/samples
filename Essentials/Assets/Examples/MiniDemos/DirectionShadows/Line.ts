/**
 * Specs Inc. 2026
 * Line component for the Essentials Spectacles lens.
 */
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindUpdateEvent } from "SnapDecorators.lspkg/decorators"
import InteractorLineRenderer, {
  VisualStyle
} from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractorLineVisual/InteractorLineRenderer"
import {withAlpha, withoutAlpha} from "SpectaclesInteractionKit.lspkg/Utils/color"

@component
export class Line extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Line – visual line renderer between two scene objects</span><br/><span style="color: #94A3B8; font-size: 11px;">Renders a dynamic line between two points using InteractorLineRenderer, updated every frame.</span>')
  @ui.separator

  @input
  @hint("The SceneObject marking the start of the line")
  public startPointObject!: SceneObject

  @input
  @hint("The SceneObject marking the end of the line")
  public endPointObject!: SceneObject

  @input
  @hint("Material used to render the line")
  private lineMaterial!: Material

  @input("vec3", "{1, 1, 0}")
  @widget(new ColorWidget())
  @hint("Color at the start of the line")
  public _beginColor: vec3 = new vec3(1, 1, 0)

  @input("vec3", "{1, 1, 0}")
  @widget(new ColorWidget())
  @hint("Color at the end of the line")
  public _endColor: vec3 = new vec3(1, 1, 0)

  @input
  @hint("Thickness of the line in world units")
  private lineWidth: number = 0.5

  @input
  @hint("Length of the line in units")
  private lineLength: number = 160

  @input
  @widget(new ComboBoxWidget().addItem("Full", 0).addItem("Split", 1).addItem("FadedEnd", 2))
  @hint("Visual style of the line (Full, Split, or FadedEnd)")
  public lineStyle: number = 2

  @input
  @hint("Whether the line should stick to its endpoint objects")
  private shouldStick: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private _enabled = true
  private isShown = false
  private defaultScale = new vec3(1, 1, 1)
  private maxLength: number = 500
  private line!: InteractorLineRenderer
  private transform!: Transform
  private logger: Logger

  set isEnabled(isEnabled: boolean) {
    this._enabled = isEnabled
  }

  get isEnabled(): boolean {
    return this._enabled
  }

  set visualStyle(style: VisualStyle) {
    this.line.visualStyle = style
  }

  get visualStyle(): VisualStyle {
    return this.line.visualStyle
  }

  set beginColor(color: vec3) {
    this.line.startColor = withAlpha(color, 1)
  }

  get beginColor(): vec3 {
    return withoutAlpha(this.line.startColor)
  }

  set endColor(color: vec3) {
    this.line.endColor = withAlpha(color, 1)
  }

  get endColor(): vec3 {
    return withoutAlpha(this.line.endColor)
  }

  onAwake() {
    this.logger = new Logger("Line", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.transform = this.sceneObject.getTransform()
    this.defaultScale = this.transform.getWorldScale()

    this.line = new InteractorLineRenderer({
      material: this.lineMaterial,
      points: [
        this.startPointObject.getTransform().getLocalPosition(),
        this.endPointObject.getTransform().getLocalPosition()
      ],
      startColor: withAlpha(this._beginColor, 1),
      endColor: withAlpha(this._endColor, 1),
      startWidth: this.lineWidth,
      endWidth: this.lineWidth
    })

    this.line.getSceneObject().setParent(this.sceneObject)

    if (this.lineStyle !== undefined) {
      this.line.visualStyle = this.lineStyle
    }

    if (this.lineLength && this.lineLength > 0) {
      this.defaultScale = new vec3(1, this.lineLength / this.maxLength, 1)
    }
  }

  @bindUpdateEvent
  onUpdate() {
    if (!this.startPointObject || !this.endPointObject || !this.line) {
      return
    }

    try {
      this.line.points = [
        this.startPointObject.getTransform().getLocalPosition(),
        this.endPointObject.getTransform().getLocalPosition()
      ]
    } catch (e) {
      this.logger.error("Error updating line: " + e)
    }
  }

  onDestroy(): void {
    this.line.destroy()
    this.sceneObject.destroy()
  }
}
