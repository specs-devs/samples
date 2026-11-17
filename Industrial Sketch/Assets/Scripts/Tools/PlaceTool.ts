/**
 * SPECS Inc. 2027
 * Drag-to-size placement of primitive shapes and SubD cages: pinch sets the center, the drag sets the size.
 */
import {ToolId} from "../Core/AppState"
import {quatToArray} from "../Core/LensMath"
import {ItemKind, newItemId, SketchItem} from "../Core/SketchTypes"
import {MeshData} from "../Geometry/MeshData"
import {buildPrimitive, PrimitiveKind, primitiveLabel} from "../Geometry/Primitives"
import {buildSubDMesh, CageKind, cageLabel, cloneCage, createCage} from "../Geometry/SubD"
import {symmetryCopies, symmetryDirection, symmetryPoint} from "../Geometry/Symmetry"
import {HandState} from "../Input/HandTracker"
import {GizmoColors} from "../Render/Gizmos"
import {MeshDisplay} from "../Render/MeshFactory"
import {Tool, ToolContext} from "./Tool"

/** Shapes that keep equal proportions on all axes. */
const UNIFORM: string[] = [PrimitiveKind.Sphere, PrimitiveKind.Torus, CageKind.Sphere]
/** Shapes that are round in X/Z and sized separately in Y. */
const ROUND: string[] = [
  PrimitiveKind.Cylinder,
  PrimitiveKind.Cone,
  PrimitiveKind.Capsule,
  PrimitiveKind.Pyramid,
  CageKind.Cylinder
]
const FLAT: string[] = [PrimitiveKind.Plane, CageKind.Plane]

export class PlaceTool implements Tool {
  private previews: MeshDisplay[] = []
  private previewKey = ""
  private center: vec3 | null = null
  private size: vec3 = vec3.one()

  constructor(readonly id: ToolId.Primitive | ToolId.SubD) {}

  private get isSubD(): boolean {
    return this.id === ToolId.SubD
  }

  private kind(ctx: ToolContext): string {
    return this.isSubD ? ctx.state.cage : ctx.state.primitive
  }

  hint(ctx: ToolContext): string {
    const name = this.isSubD ? cageLabel(ctx.state.cage) : primitiveLabel(ctx.state.primitive)
    return (
      "Pinch to set the center of a " +
      name.toLowerCase() +
      ", drag out to size it" +
      (ctx.state.snap ? " (snapped)" : "") +
      " — reshape with Edit"
    )
  }

  activate(_ctx: ToolContext): void {}

  deactivate(_ctx: ToolContext): void {
    this.center = null
    this.hidePreviews()
  }

  update(ctx: ToolContext, hand: HandState, active: boolean): void {
    if (hand.tracked && !this.center) {
      ctx.gizmos.handle(hand.position, 0.35, ctx.state.color)
    }
    if (!active) {
      if (this.center) {
        this.commit(ctx)
      }
      return
    }
    if (hand.pinchDown) {
      this.center = ctx.snap(ctx.rootPoint(hand))
      this.size = vec3.one().uniformScale(ctx.worldToSketchLength(1))
    }
    if (this.center && hand.pinching) {
      const p = ctx.snap(ctx.rootPoint(hand))
      this.size = this.sizeFrom(ctx, p.sub(this.center))
      this.showPreview(ctx)
      ctx.readout = formatSize(this.size, this.kind(ctx))
    }
    if (this.center && hand.pinchUp) {
      this.commit(ctx)
    }
  }

  /**
   * Shapes are dragged out uniformly (the drag distance sets the size) — precise proportions are then set
   * with the Edit tool's axis handles. Hand-tracked depth is too noisy to size three axes in one gesture.
   */
  private sizeFrom(ctx: ToolContext, d: vec3): vec3 {
    const kind = this.kind(ctx)
    const s = Math.max(ctx.worldToSketchLength(0.5), d.length * 2)
    if (FLAT.indexOf(kind) >= 0) {
      // Flat shapes have no thickness; keep Y at 1 so normals stay well-defined.
      return new vec3(s, 1, s)
    }
    return new vec3(s, s, s)
  }

  private baseMesh(ctx: ToolContext): MeshData {
    return this.isSubD ? buildSubDMesh(createCage(ctx.state.cage), 2) : buildPrimitive(ctx.state.primitive)
  }

  private showPreview(ctx: ToolContext): void {
    if (!this.center) {
      return
    }
    const sym = ctx.rootSymmetry()
    const copies = symmetryCopies(sym)
    const key = this.id + ":" + this.kind(ctx)
    if (key !== this.previewKey) {
      this.hidePreviews()
      this.previews.forEach((p) => p.destroy())
      this.previews = []
      this.previewKey = key
    }
    while (this.previews.length < copies) {
      const d = new MeshDisplay(ctx.workspace.root, "Place Preview")
      d.setMesh(this.baseMesh(ctx))
      this.previews.push(d)
    }
    const mat = ctx.materials.get(ctx.state.color, ctx.state.material, true)
    for (let k = 0; k < this.previews.length; k++) {
      const d = this.previews[k]
      d.enabled = k < copies
      if (k >= copies) {
        continue
      }
      d.setMaterial(mat)
      const pose = this.copyPose(ctx, this.center, k)
      const t = d.sceneObject.getTransform()
      t.setLocalPosition(pose.position)
      t.setLocalRotation(pose.rotation)
      t.setLocalScale(this.size)
    }
    // Outline of the base copy for a crisp read of the bounds.
    const half = this.size.uniformScale(0.5)
    const c = this.center
    ctx.gizmos.box(c.sub(half), c.add(half), (p) => ctx.workspace.rootToWorld(p), 0.08, GizmoColors.accent)
  }

  /** Position/rotation of symmetry copy `k` (rotation follows radial copies). */
  private copyPose(ctx: ToolContext, c: vec3, k: number): {position: vec3; rotation: quat} {
    const sym = ctx.rootSymmetry()
    const p = symmetryPoint(sym, {x: c.x, y: c.y, z: c.z}, k)
    // Rotation: map the local axes through the symmetry and rebuild an orthonormal basis.
    const fwd = symmetryDirection(sym, {x: 0, y: 0, z: 1}, k)
    const up = symmetryDirection(sym, {x: 0, y: 1, z: 0}, k)
    return {
      position: new vec3(p.x, p.y, p.z),
      rotation: quat.lookAt(new vec3(fwd.x, fwd.y, fwd.z), new vec3(up.x, up.y, up.z))
    }
  }

  private commit(ctx: ToolContext): void {
    const center = this.center
    this.center = null
    this.hidePreviews()
    if (!center) {
      return
    }
    const sym = ctx.rootSymmetry()
    const copies = symmetryCopies(sym)
    const changes = new Map<string, SketchItem | null>()
    const group = copies > 1 ? newItemId() : undefined
    for (let k = 0; k < copies; k++) {
      const pose = this.copyPose(ctx, center, k)
      const item: SketchItem = {
        id: newItemId(),
        kind: this.isSubD ? ItemKind.SubD : ItemKind.Primitive,
        ...ctx.baseItem(),
        transform: {
          position: {x: pose.position.x, y: pose.position.y, z: pose.position.z},
          rotation: quatToArray(pose.rotation),
          scale: {x: this.size.x, y: this.size.y, z: this.size.z}
        }
      }
      if (group) {
        item.group = group
      }
      if (this.isSubD) {
        item.cage = cloneCage(createCage(ctx.state.cage))
        item.cageKind = ctx.state.cage
        item.level = 2
      } else {
        item.primitive = ctx.state.primitive
      }
      changes.set(item.id, item)
    }
    ctx.doc.commit(this.isSubD ? "SubD" : primitiveLabel(ctx.state.primitive), changes)
  }

  private hidePreviews(): void {
    for (const p of this.previews) {
      p.enabled = false
    }
  }
}

function formatSize(size: vec3, kind: string): string {
  const f = (v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1))
  if (UNIFORM.indexOf(kind) >= 0) {
    return "Ø " + f(size.x) + " cm"
  }
  if (ROUND.indexOf(kind) >= 0) {
    return "Ø " + f(size.x) + " × " + f(size.y) + " cm"
  }
  if (FLAT.indexOf(kind) >= 0) {
    return f(size.x) + " × " + f(size.z) + " cm"
  }
  return f(size.x) + " × " + f(size.y) + " × " + f(size.z) + " cm"
}
