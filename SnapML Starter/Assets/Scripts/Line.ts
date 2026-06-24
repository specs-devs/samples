/**
 * Specs Inc. 2026
 * Line component for the SnapML Starter Spectacles lens.
 */
import InteractorLineRenderer, {
  VisualStyle
} from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractorLineVisual/InteractorLineRenderer"
import {withAlpha, withoutAlpha} from "SpectaclesInteractionKit.lspkg/Utils/color"

/**
 * This class provides visual representation for interactor lines. It allows customization of the line's material, colors, width, length, and visual style. The class integrates with the InteractionManager and WorldCameraFinderProvider to manage interactions and camera positioning.
 */
@component
export class Line extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Line – interactor ray visual</span><br/><span style="color: #94A3B8; font-size: 11px;">Renders a customizable line between two scene objects.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">End Points</span>')
  @input
  @hint("Scene object marking the start of the line")
  public startPointObject!: SceneObject

  @input
  @hint("Scene object marking the end of the line")
  public endPointObject!: SceneObject

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Appearance</span>')
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
  @hint("Width of the line in world units")
  private lineWidth: number = 0.5

  @input
  @hint("Maximum rendered length of the line")
  private lineLength: number = 160

  @input
  @widget(new ComboBoxWidget().addItem("Full", 0).addItem("Split", 1).addItem("FadedEnd", 2))
  @hint("Visual style preset for the line renderer")
  public lineStyle: number = 2

  @input
  @hint("Keep the line locked to its configured length")
  private shouldStick: boolean = true

  private _enabled = true
  private isShown = false
  private defaultScale = new vec3(1, 1, 1)
  private maxLength: number = 500
  private line!: InteractorLineRenderer
  private transform!: Transform

  /**
   * Sets whether the visual can be shown, so developers can show/hide the ray in certain parts of their lens.
   */
  set isEnabled(isEnabled: boolean) {
    this._enabled = isEnabled
  }

  /**
   * Gets whether the visual is active (can be shown if hand is in frame and we're in far field targeting mode).
   */
  get isEnabled(): boolean {
    return this._enabled
  }

  /**
   * Sets how the visuals for the line drawer should be shown.
   */
  set visualStyle(style: VisualStyle) {
    this.line.visualStyle = style
  }

  /**
   * Gets the current visual style.
   */
  get visualStyle(): VisualStyle {
    return this.line.visualStyle
  }

  /**
   * Sets the color of the visual from the start.
   */
  set beginColor(color: vec3) {
    this.line.startColor = withAlpha(color, 1)
  }

  /**
   * Gets the color of the visual from the start.
   */
  get beginColor(): vec3 {
    return withoutAlpha(this.line.startColor)
  }

  /**
   * Sets the color of the visual from the end.
   */
  set endColor(color: vec3) {
    this.line.endColor = withAlpha(color, 1)
  }

  /**
   * Gets the color of the visual from the end.
   */
  get endColor(): vec3 {
    return withoutAlpha(this.line.endColor)
  }

  onAwake() {
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

  private rotationFromOrthogonal(right: vec3, up: vec3, fwd: vec3): quat {
    const vec3to4 = (v3: vec3) => new vec4(v3.x, v3.y, v3.z, 0)
    const rotationMatrix = new mat4()
    rotationMatrix.column0 = vec3to4(right)
    rotationMatrix.column1 = vec3to4(up)
    rotationMatrix.column2 = vec3to4(fwd)
    return quat.fromEulerVec(rotationMatrix.extractEulerAngles())
  }

  onDestroy(): void {
    this.line.destroy()
    this.sceneObject.destroy()
  }
}
