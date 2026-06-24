/**
 * Specs Inc. 2026
 * Closed Polyline component for the SnapML Starter Spectacles lens.
 */
import InteractorLineRenderer from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractorLineVisual/InteractorLineRenderer"
import {withAlpha} from "SpectaclesInteractionKit.lspkg/Utils/color"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

/**
 * This class provides visual representation for a polyline that can be rendered as a continuous or split sequence of lines.
 */
@component
export class ClosedPolyline extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ClosedPolyline – bounding box polyline renderer</span><br/><span style="color: #94A3B8; font-size: 11px;">Draws a closed or segmented line through a set of scene object points.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Points & Material</span>')
  @input
  @hint("Scene objects whose positions define the polyline vertices")
  public points!: SceneObject[]

  @input
  @hint("Material used to render the line segments")
  private lineMaterial!: Material

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Appearance</span>')
  @input("vec3", "{1, 1, 0}")
  @widget(new ColorWidget())
  @hint("Color applied to the entire polyline")
  public _color: vec3 = new vec3(1, 1, 0)

  @input
  @hint("Width of each line segment in world units")
  private lineWidth: number = 0.5

  @input
  @widget(new ComboBoxWidget().addItem("Full", 0).addItem("Split", 1).addItem("FadedEnd", 2))
  @hint("Visual style preset for the line renderer")
  public lineStyle: number = 0

  @input
  @hint("Render as a single closed loop; when false, each pair of points is a separate segment")
  public continuousLine: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private _enabled = true
  private lines: InteractorLineRenderer[] = []
  private transform!: Transform

  set isEnabled(isEnabled: boolean) {
    this._enabled = isEnabled
    this.lines.forEach((line) => {
      line.getSceneObject().enabled = isEnabled
    })
  }

  get isEnabled(): boolean {
    return this._enabled
  }

  onAwake() {
    this.logger = new Logger("ClosedPolyline", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    if (!this.points || this.points.length < 2) {
      throw new Error("ClosedPolylineVisual requires at least 2 points")
    }

    this.transform = this.sceneObject.getTransform()
    this.createOrUpdateLines()
  }

  refreshLine(): void {
    if (!this.points || this.points.length < 2) {
      this.logger.warn("Cannot refresh line: Invalid state")
      return
    }

    this.createOrUpdateLines()
  }

  private createOrUpdateLines(): void {
    this.lines.forEach((line) => line.destroy())
    this.lines = []

    const positions = this.points.map((point) => point.getTransform().getLocalPosition())
    if (this.continuousLine) {
      positions.push(positions[0])
      const line = new InteractorLineRenderer({
        material: this.lineMaterial,
        points: positions,
        startColor: withAlpha(this._color, 1),
        endColor: withAlpha(this._color, 1),
        startWidth: this.lineWidth,
        endWidth: this.lineWidth
      })
      line.getSceneObject().setParent(this.sceneObject)
      line.visualStyle = this.lineStyle
      this.lines.push(line)
    } else {
      for (let i = 0; i < positions.length; i++) {
        const startIndex = i
        const endIndex = (i + 1) % positions.length
        const line = new InteractorLineRenderer({
          material: this.lineMaterial,
          points: [positions[startIndex], positions[endIndex]],
          startColor: withAlpha(this._color, 1),
          endColor: withAlpha(this._color, 1),
          startWidth: this.lineWidth,
          endWidth: this.lineWidth
        })
        line.getSceneObject().setParent(this.sceneObject)
        line.visualStyle = this.lineStyle
        this.lines.push(line)
      }
    }

    this.isEnabled = this._enabled
  }

  onDestroy(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onDestroy()")
    this.lines.forEach((line) => line.destroy())
    this.sceneObject.destroy()
  }

  getPoints(): SceneObject[] {
    return this.points || []
  }

  setColor(color: vec3): void {
    this._color = color
    this.lines.forEach((line) => {
      const colorWithAlpha = withAlpha(color, 1)
      line.startColor = colorWithAlpha
      line.endColor = colorWithAlpha
    })
  }

  setPoints(newPoints: SceneObject[]): void {
    if (newPoints.length < 2) {
      this.logger.error("At least 2 points are required")
      return
    }
    this.points = newPoints
    this.refreshLine()
  }
}
