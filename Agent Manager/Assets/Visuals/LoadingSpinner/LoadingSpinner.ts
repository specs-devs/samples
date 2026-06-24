const __material = requireAsset("./LoadingSpinner.mat") as Material
const __mesh = requireAsset("./LoadingSpinner.mesh") as RenderMesh

const SPIN_SPEED = 5
const FADE_IN_TIME = 0.3
const FADE_OUT_TIME = 0.2
const ARC_SPREAD_TIME = 0.8

/**
 * LoadingSpinner is the standard indeterminate progress bar used everywhere.
 * To use it, add this component to an empty SceneObject. It will create the
 * RenderMeshVisual automatically. In local space, the bounding box of the mesh
 * goes from -0.5 to 0.5 and faces the Z-axis. It can be resized by setting a
 * scale on the Transform or by adding a ScreenTransform to the SceneObject.
 */
@component
export class LoadingSpinner extends BaseScriptComponent {
  @input("int") renderOrder = 0

  private readonly meshVisual =
    this.sceneObject.getComponent("RenderMeshVisual") ??
    this.sceneObject.createComponent("RenderMeshVisual")

  private arcSpread = 0
  private reveal = false
  private updateEvent: SceneEvent

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.onEnable())
    this.createEvent("OnEnableEvent").bind(() => this.onEnable())
    this.updateEvent = this.createEvent("UpdateEvent")
    this.updateEvent.bind(() => this.onUpdate())
    this.updateEvent.enabled = false

    // build visual
    this.meshVisual.mesh ??= __mesh
    this.meshVisual.mainMaterial ??= __material
    this.meshVisual.renderOrder = this.renderOrder

    // prevent first-frame glitch
    this.meshVisual.enabled = false

    // initial state
    const pass = this.meshVisual.mainPassOverrides
    pass["opacity"] = this.meshVisual.mainPass["opacity"] as number
    pass["arcCenter"] = this.meshVisual.mainPass["arcCenter"] as vec2
    pass["arcSpread"] = this.meshVisual.mainPass["arcSpread"] as number
    this.arcSpread = pass["arcSpread"] as number
  }

  onEnable() {
    this.reveal = true
    this.updateEvent.enabled = true
    const pass = this.meshVisual.mainPassOverrides
    pass["opacity"] = 0
    pass["arcCenter"] = vec2.zero()
    pass["arcSpread"] = 0
  }

  conceal() {
    this.reveal = false
  }

  onUpdate() {
    const dt = Math.min(getDeltaTime(), 1 / 30)

    const pass = this.meshVisual.mainPassOverrides

    let arcCenter = pass["arcCenter"] as vec2
    arcCenter.x += SPIN_SPEED * -dt
    arcCenter.y += SPIN_SPEED * dt
    pass["arcCenter"] = arcCenter

    pass["arcSpread"] = this.moveTowards(
      pass["arcSpread"] as number,
      this.reveal ? this.arcSpread : 0,
      this.arcSpread / (this.reveal ? ARC_SPREAD_TIME : FADE_OUT_TIME * 3) * dt
    )

    const opacity = pass["opacity"] = this.moveTowards(
      pass["opacity"],
      this.reveal ? 1 : 0,
      1 / (this.reveal ? FADE_IN_TIME : FADE_OUT_TIME) * dt
    )

    this.meshVisual.enabled = opacity > 0

    if (opacity <= 0 && !this.reveal) {
      this.updateEvent.enabled = false
    }
  }

  private moveTowards(current: number, target: number, dist: number): number {
    // apply a delta to a value, but don't overshoot the target
    const delta = target - current
    if (dist >= Math.abs(delta)) {
      return target
    } else {
      const travel = dist * Math.sign(delta)
      return current + travel
    }
  }
}
