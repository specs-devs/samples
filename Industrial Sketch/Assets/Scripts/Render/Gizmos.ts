/**
 * SPECS Inc. 2027
 * Immediate-mode gizmo drawing (lines, handles, boxes) for guides, selection outlines and tool previews.
 *
 * Tools call the draw methods every frame between {@link Gizmos.begin} and {@link Gizmos.end}; geometry is
 * batched per color into one dynamic mesh, so a frame with nothing to draw costs nothing.
 */
import {MeshData} from "../Geometry/MeshData"
import {buildSphere} from "../Geometry/Primitives"
import {MaterialLibrary} from "./MaterialLibrary"
import {DynamicMesh} from "./MeshFactory"

export type GizmoColor = [number, number, number]

export const GizmoColors = {
  accent: [0.25, 0.85, 1] as GizmoColor,
  hover: [0.55, 0.62, 0.7] as GizmoColor,
  warning: [1, 0.45, 0.25] as GizmoColor,
  guide: [0.32, 0.36, 0.42] as GizmoColor,
  white: [0.92, 0.94, 0.96] as GizmoColor,
  symmetry: [0.85, 0.35, 1] as GizmoColor,
  axisX: [0.95, 0.3, 0.3] as GizmoColor,
  axisY: [0.35, 0.9, 0.35] as GizmoColor,
  axisZ: [0.3, 0.55, 1] as GizmoColor
}

interface Batch {
  mesh: MeshData
  display: DynamicMesh
  used: boolean
}

const UNIT_SPHERE = buildSphere(10, 6)

export class Gizmos {
  private batches = new Map<string, Batch>()
  private readonly root: SceneObject
  private frameOpen = false

  constructor(private readonly materials: MaterialLibrary) {
    this.root = global.scene.createSceneObject("Gizmos")
  }

  begin(): void {
    this.frameOpen = true
    this.batches.forEach((b) => {
      b.mesh = new MeshData()
      b.used = false
    })
  }

  end(): void {
    this.frameOpen = false
    this.batches.forEach((b) => {
      if (b.used && b.mesh.triangleCount > 0) {
        b.display.update(b.mesh)
      } else {
        b.display.clear()
      }
    })
  }

  /** World-space line segment drawn as a thin square bar. */
  line(a: vec3, b: vec3, thickness: number, color: GizmoColor): void {
    const dir = b.sub(a)
    const len = dir.length
    if (len < 1e-5) {
      return
    }
    const t = dir.uniformScale(1 / len)
    const ref = Math.abs(t.y) < 0.95 ? vec3.up() : vec3.right()
    const n = t
      .cross(ref)
      .normalize()
      .uniformScale(thickness / 2)
    const m = t
      .cross(n)
      .normalize()
      .uniformScale(thickness / 2)
    const mesh = this.batch(color).mesh
    const corners = [n.add(m), n.sub(m), n.uniformScale(-1).sub(m), n.uniformScale(-1).add(m)]
    const base = mesh.vertexCount
    for (const c of corners) {
      const nn = c.normalize()
      mesh.addVertex({x: a.x + c.x, y: a.y + c.y, z: a.z + c.z}, {x: nn.x, y: nn.y, z: nn.z})
      mesh.addVertex({x: b.x + c.x, y: b.y + c.y, z: b.z + c.z}, {x: nn.x, y: nn.y, z: nn.z})
    }
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4
      const a0 = base + i * 2
      const b0 = base + i * 2 + 1
      const a1 = base + j * 2
      const b1 = base + j * 2 + 1
      // Both windings so the bar is visible from any side regardless of culling.
      mesh.addQuad(a0, b0, b1, a1)
      mesh.addQuad(a0, a1, b1, b0)
    }
  }

  /** Polyline through world-space points. */
  polyline(points: vec3[], thickness: number, color: GizmoColor, closed: boolean = false): void {
    for (let i = 1; i < points.length; i++) {
      this.line(points[i - 1], points[i], thickness, color)
    }
    if (closed && points.length > 2) {
      this.line(points[points.length - 1], points[0], thickness, color)
    }
  }

  /** Small sphere handle. */
  handle(center: vec3, radius: number, color: GizmoColor): void {
    const mesh = this.batch(color).mesh
    const base = mesh.vertexCount
    for (let i = 0; i < UNIT_SPHERE.vertexCount; i++) {
      const p = UNIT_SPHERE.getPosition(i)
      mesh.addVertex(
        {x: center.x + p.x * radius * 2, y: center.y + p.y * radius * 2, z: center.z + p.z * radius * 2},
        {x: UNIT_SPHERE.normals[i * 3], y: UNIT_SPHERE.normals[i * 3 + 1], z: UNIT_SPHERE.normals[i * 3 + 2]}
      )
    }
    for (const idx of UNIT_SPHERE.indices) {
      mesh.indices.push(base + idx)
    }
  }

  /** Wire box for local bounds `min..max` mapped through `toWorld`. */
  box(min: vec3, max: vec3, toWorld: (p: vec3) => vec3, thickness: number, color: GizmoColor): void {
    const c = [
      new vec3(min.x, min.y, min.z),
      new vec3(max.x, min.y, min.z),
      new vec3(max.x, max.y, min.z),
      new vec3(min.x, max.y, min.z),
      new vec3(min.x, min.y, max.z),
      new vec3(max.x, min.y, max.z),
      new vec3(max.x, max.y, max.z),
      new vec3(min.x, max.y, max.z)
    ].map(toWorld)
    const edges = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7]
    ]
    for (const [a, b] of edges) {
      this.line(c[a], c[b], thickness, color)
    }
  }

  /** Ring of `segments` around `center` in the plane spanned by unit vectors u, v. */
  circle(
    center: vec3,
    u: vec3,
    v: vec3,
    radius: number,
    thickness: number,
    color: GizmoColor,
    segments: number = 32
  ): void {
    const pts: vec3[] = []
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2
      pts.push(center.add(u.uniformScale(Math.cos(a) * radius)).add(v.uniformScale(Math.sin(a) * radius)))
    }
    this.polyline(pts, thickness, color, true)
  }

  private batch(color: GizmoColor): Batch {
    const key = color.join(",")
    let b = this.batches.get(key)
    if (!b) {
      const display = new DynamicMesh(this.root, "Gizmo " + key, this.materials.unlit(color))
      b = {mesh: new MeshData(), display, used: false}
      this.batches.set(key, b)
    }
    if (!this.frameOpen) {
      print("Industrial Sketch: gizmo drawn outside begin/end")
    }
    b.used = true
    return b
  }
}
