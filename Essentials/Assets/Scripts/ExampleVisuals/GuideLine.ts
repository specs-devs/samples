/**
 * SPECS Inc. 2027
 * Draws a visible bar between two scene objects, every frame, so an invisible guide
 * (a snap line, a ray) can be seen. Used by the Snapping example.
 */
@component
export class GuideLine extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GuideLine – a visible bar between two objects</span><br/><span style="color: #94A3B8; font-size: 11px;">Follows both ends every frame. Purely visual: it has no collider.</span>')
  @ui.separator

  @input
  @hint("One end of the bar")
  startObject: SceneObject

  @input
  @hint("The other end of the bar")
  endObject: SceneObject

  @input
  @hint("A unit (1 cm) box mesh, stretched between the ends")
  boxMesh: RenderMesh

  @input
  @hint("Material with a baseColor (an unlit one reads well in any lighting); it is cloned, so other objects keep their color")
  material: Material

  @input
  @widget(new ColorWidget())
  @hint("Bar color")
  color: vec4 = new vec4(0.2, 0.8, 1, 1)

  @input
  @hint("Bar thickness (cm)")
  thickness: number = 0.4

  private bar: SceneObject | null = null
  private barMaterial: Material | null = null

  onAwake(): void {
    if (!this.startObject || !this.endObject || !this.boxMesh || !this.material) {
      print("GuideLine: assign startObject, endObject, boxMesh and material")
      return
    }
    this.bar = global.scene.createSceneObject("GuideLineBar")
    this.bar.setParent(this.sceneObject)
    this.bar.layer = this.sceneObject.layer
    const visual = this.bar.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    visual.mesh = this.boxMesh
    this.barMaterial = this.material.clone()
    visual.mainMaterial = this.barMaterial
    this.setColor(this.color)
    this.createEvent("UpdateEvent").bind(() => this.updateBar())
  }

  /** Changes the bar color (e.g. to show a state). */
  setColor(color: vec4): void {
    if (this.barMaterial) {
      this.barMaterial.mainPass.baseColor = color
    }
  }

  private updateBar(): void {
    const a = this.startObject.getTransform().getWorldPosition()
    const b = this.endObject.getTransform().getWorldPosition()
    const delta = b.sub(a)
    const length = delta.length
    const transform = this.bar.getTransform()
    transform.setWorldPosition(a.add(delta.uniformScale(0.5)))
    if (length > 0.0001) {
      transform.setWorldRotation(quat.lookAt(delta.normalize(), Math.abs(delta.normalize().y) > 0.99 ? vec3.forward() : vec3.up()))
    }
    transform.setWorldScale(new vec3(this.thickness, this.thickness, Math.max(length, 0.0001)))
  }
}
