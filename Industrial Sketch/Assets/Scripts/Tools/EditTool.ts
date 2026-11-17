/**
 * SPECS Inc. 2027
 * Edit tool: reshape existing geometry.
 *  - Curve items (strokes, surfaces, measures): drag control points; neighbors follow with a soft falloff.
 *  - SubD items: drag cage vertices or faces; with Extrude on, dragging a face pulls out new geometry.
 */
import {ToolId} from "../Core/AppState"
import {arrayToQuat, itemToRoot} from "../Core/LensMath"
import {cloneItem, ItemKind, SketchItem} from "../Core/SketchTypes"
import {controlPointIndices, softDeform} from "../Geometry/Curve"
import {extrudeFace, faceCenter} from "../Geometry/SubD"
import {P3} from "../Geometry/Vec"
import {HandState} from "../Input/HandTracker"
import {GizmoColors} from "../Render/Gizmos"
import {drawItemBox, PICK_RADIUS_WORLD, Tool, ToolContext} from "./Tool"

const HANDLE_GRAB_WORLD = 2.2
const CONTROL_SPACING_WORLD = 4
const EXTRUDE_START_WORLD = 0.6

type HandleKind = "curve" | "curve2" | "vertex" | "face" | "axis"

interface Handle {
  kind: HandleKind
  /** Point index (curves), vertex index or face index. */
  index: number
  world: vec3
}

interface Drag {
  id: string
  handle: Handle
  original: SketchItem
  startRoot: vec3
  extruded: boolean
}

export class EditTool implements Tool {
  readonly id = ToolId.Edit
  private target: string | null = null
  private drag: Drag | null = null
  private hoverHandle: Handle | null = null

  hint(ctx: ToolContext): string {
    if (!this.target) {
      return "Pinch an object to edit its points"
    }
    const item = ctx.doc.get(this.target)
    if (item?.kind === ItemKind.SubD) {
      return ctx.state.extrude
        ? "Drag a pink face handle to extrude it, or a white vertex to move it"
        : "Drag white vertices or pink face handles to sculpt the cage"
    }
    if (item?.kind === ItemKind.Primitive) {
      return "Drag an axis handle to stretch the shape along that axis" + (ctx.state.snap ? " (snapped)" : "")
    }
    return "Drag a control point — falloff " + ctx.state.softRadius.toFixed(0) + " cm"
  }

  activate(ctx: ToolContext): void {
    const sel = ctx.state.selection
    this.target = sel.length > 0 ? sel[0] : null
  }

  deactivate(ctx: ToolContext): void {
    if (this.drag) {
      ctx.doc.endEdit("Edit")
      this.drag = null
    }
    this.target = null
    this.hoverHandle = null
  }

  update(ctx: ToolContext, hand: HandState, active: boolean): void {
    if (this.target && !ctx.doc.has(this.target)) {
      this.target = null
    }
    const handles = this.target ? this.handlesFor(ctx, this.target) : []
    if (!this.drag) {
      this.hoverHandle = hand.tracked ? nearestHandle(handles, hand.position, HANDLE_GRAB_WORLD) : null
    }
    this.drawFeedback(ctx, hand, handles)

    if (!active) {
      if (this.drag) {
        this.finishDrag(ctx)
      }
      return
    }
    if (hand.pinchDown) {
      if (this.target && this.hoverHandle) {
        const item = ctx.doc.get(this.target)!
        this.drag = {
          id: this.target,
          handle: this.hoverHandle,
          original: cloneItem(item),
          startRoot: ctx.rootPoint(hand),
          extruded: false
        }
        ctx.doc.beginEdit([this.target])
      } else {
        // Notes have no editable shape: move them with Grab.
        const hit = ctx.views.pick(
          ctx.rootPoint(hand),
          ctx.worldToSketchLength(PICK_RADIUS_WORLD),
          (i) => i.kind !== ItemKind.Note
        )
        this.target = hit ? hit.id : null
        ctx.state.selection = hit ? [hit.id] : []
      }
    } else if (this.drag && hand.pinching) {
      this.updateDrag(ctx, hand)
    } else if (this.drag && hand.pinchUp) {
      this.finishDrag(ctx)
    }
  }

  private handlesFor(ctx: ToolContext, id: string): Handle[] {
    const item = ctx.doc.get(id)
    if (!item || !ctx.views.isVisible(item)) {
      return []
    }
    const toWorld = (p: P3) => ctx.workspace.rootToWorld(itemToRoot(item.transform, p))
    const out: Handle[] = []
    const scale = Math.max(Math.abs(item.transform.scale.x), 1e-4)
    const spacing = ctx.worldToSketchLength(CONTROL_SPACING_WORLD) / scale
    const addCurve = (pts: P3[] | undefined, kind: HandleKind) => {
      if (!pts) return
      for (const i of controlPointIndices(pts, spacing)) {
        out.push({kind, index: i, world: toWorld(pts[i])})
      }
    }
    if (item.kind === ItemKind.SubD && item.cage) {
      item.cage.vertices.forEach((v, i) => out.push({kind: "vertex", index: i, world: toWorld(v)}))
      item.cage.faces.forEach((f, i) => out.push({kind: "face", index: i, world: toWorld(faceCenter(item.cage!, f))}))
    } else if (item.kind === ItemKind.Primitive) {
      // Face-center handles on the local ±X, ±Y, ±Z sides of the unit shape.
      for (let axis = 0; axis < 3; axis++) {
        for (const sign of [-1, 1]) {
          const p = {x: 0, y: 0, z: 0}
          if (axis === 0) p.x = sign * 0.5
          if (axis === 1) p.y = sign * 0.5
          if (axis === 2) p.z = sign * 0.5
          out.push({kind: "axis", index: axis * 2 + (sign > 0 ? 1 : 0), world: toWorld(p)})
        }
      }
    } else {
      addCurve(item.points, "curve")
      addCurve(item.points2, "curve2")
    }
    return out
  }

  private drawFeedback(ctx: ToolContext, hand: HandState, handles: Handle[]): void {
    if (this.target) {
      const item = ctx.doc.get(this.target)
      if (item && item.kind === ItemKind.SubD && item.cage) {
        // Cage wireframe.
        const toWorld = (p: P3) => ctx.workspace.rootToWorld(itemToRoot(item.transform, p))
        const drawn = new Set<string>()
        for (const f of item.cage.faces) {
          for (let k = 0; k < f.length; k++) {
            const a = f[k]
            const b = f[(k + 1) % f.length]
            const key = a < b ? a + "_" + b : b + "_" + a
            if (!drawn.has(key)) {
              drawn.add(key)
              ctx.gizmos.line(toWorld(item.cage.vertices[a]), toWorld(item.cage.vertices[b]), 0.08, GizmoColors.guide)
            }
          }
        }
      } else if (item && item.kind === ItemKind.Primitive) {
        drawItemBox(ctx, item.id, GizmoColors.hover)
        // Axis lines through the shape, colored per axis.
        const toWorld = (p: P3) => ctx.workspace.rootToWorld(itemToRoot(item.transform, p))
        const colors = [GizmoColors.axisX, GizmoColors.axisY, GizmoColors.axisZ]
        for (let axis = 0; axis < 3; axis++) {
          const a = {x: axis === 0 ? -0.5 : 0, y: axis === 1 ? -0.5 : 0, z: axis === 2 ? -0.5 : 0}
          const b = {x: -a.x, y: -a.y, z: -a.z}
          ctx.gizmos.line(toWorld(a), toWorld(b), 0.06, colors[axis])
        }
      }
    }
    const active = this.drag ? this.drag.handle : this.hoverHandle
    for (const h of handles) {
      const isActive = !!active && active.kind === h.kind && active.index === h.index
      const r = h.kind === "face" ? 0.45 : 0.38
      let color = h.kind === "face" ? GizmoColors.symmetry : GizmoColors.white
      if (h.kind === "axis") {
        color = [GizmoColors.axisX, GizmoColors.axisY, GizmoColors.axisZ][Math.floor(h.index / 2)]
      }
      ctx.gizmos.handle(h.world, isActive ? r * 1.5 : r, isActive ? GizmoColors.accent : color)
    }
    if (hand.tracked) {
      ctx.gizmos.handle(hand.position, 0.25, GizmoColors.white)
    }
  }

  private updateDrag(ctx: ToolContext, hand: HandState): void {
    const d = this.drag!
    const rootDelta = ctx.rootPoint(hand).sub(d.startRoot)
    const t = d.original.transform
    const localRot = arrayToQuat(t.rotation).invert().multiplyVec3(rootDelta)
    const delta: P3 = {
      x: localRot.x / (t.scale.x || 1),
      y: localRot.y / (t.scale.y || 1),
      z: localRot.z / (t.scale.z || 1)
    }
    const next = cloneItem(d.original)
    const scale = Math.max(Math.abs(t.scale.x), 1e-4)
    const radius = ctx.worldToSketchLength(ctx.state.softRadius) / scale
    switch (d.handle.kind) {
      case "curve":
        next.points = softDeform(d.original.points!, d.handle.index, delta, radius)
        break
      case "curve2":
        next.points2 = softDeform(d.original.points2!, d.handle.index, delta, radius)
        break
      case "vertex":
        next.cage!.vertices[d.handle.index] = add(d.original.cage!.vertices[d.handle.index], delta)
        break
      case "axis": {
        // Stretch along one local axis, keeping the opposite face in place.
        const axis = Math.floor(d.handle.index / 2)
        const sign = d.handle.index % 2 === 1 ? 1 : -1
        const key = axis === 0 ? "x" : axis === 1 ? "y" : "z"
        const original = d.original.transform.scale[key]
        // Local delta is in unit-shape space: convert to a size change in sketch units.
        let size = Math.max(ctx.worldToSketchLength(0.3), original + sign * delta[key] * original)
        if (ctx.state.snap) {
          size = Math.max(ctx.state.gridStep, Math.round(size / ctx.state.gridStep) * ctx.state.gridStep)
        }
        const change = size - original
        next.transform.scale = {...d.original.transform.scale, [key]: size}
        const shift = {x: 0, y: 0, z: 0}
        shift[key] = (sign * change) / 2
        const worldShift = arrayToQuat(t.rotation).multiplyVec3(new vec3(shift.x, shift.y, shift.z))
        next.transform.position = {
          x: t.position.x + worldShift.x,
          y: t.position.y + worldShift.y,
          z: t.position.z + worldShift.z
        }
        ctx.readout = size.toFixed(1) + " cm"
        ctx.doc.preview(next)
        return
      }
      case "face": {
        let cage = d.original.cage!
        let face = d.handle.index
        const moved = ctx.workspace.rootToWorld(ctx.rootPoint(hand)).distance(ctx.workspace.rootToWorld(d.startRoot))
        if (ctx.state.extrude && moved > EXTRUDE_START_WORLD) {
          const ex = extrudeFace(cage, face, 0)
          cage = ex.cage
          face = ex.face
          d.extruded = true
        }
        const verts = cage.vertices.map((v) => ({...v}))
        for (const i of cage.faces[face]) {
          verts[i] = add(cage.vertices[i], delta)
        }
        next.cage = {vertices: verts, faces: cage.faces.map((f) => f.slice())}
        break
      }
    }
    ctx.doc.preview(next)
    ctx.readout = rootDelta.length.toFixed(1) + " cm"
  }

  private finishDrag(ctx: ToolContext): void {
    const d = this.drag
    this.drag = null
    if (d) {
      ctx.doc.endEdit(d.extruded ? "Extrude" : "Edit points")
    }
  }
}

function add(a: P3, b: P3): P3 {
  return {x: a.x + b.x, y: a.y + b.y, z: a.z + b.z}
}

function nearestHandle(handles: Handle[], world: vec3, maxDistance: number): Handle | null {
  let best: Handle | null = null
  let bestD = maxDistance
  for (const h of handles) {
    const d = h.world.distance(world)
    if (d < bestD) {
      bestD = d
      best = h
    }
  }
  return best
}
