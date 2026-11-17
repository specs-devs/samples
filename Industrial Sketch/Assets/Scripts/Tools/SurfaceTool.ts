/**
 * SPECS Inc. 2027
 * Surface creation: sweep a surface with the hand, revolve a profile, loft between two curves or fill a loop.
 */
import {SurfaceMode, ToolId} from "../Core/AppState"
import {identityTransform, ItemKind, newItemId, SketchItem} from "../Core/SketchTypes"
import {isClosedLoop} from "../Geometry/Curve"
import {MeshData} from "../Geometry/MeshData"
import {buildFill, buildLoft, buildRevolve, buildSweep} from "../Geometry/SurfaceBuilder"
import {applySymmetry, symmetryCopies, SymmetryMode} from "../Geometry/Symmetry"
import {P3} from "../Geometry/Vec"
import {HandState} from "../Input/HandTracker"
import {GizmoColors} from "../Render/Gizmos"
import {DynamicMesh} from "../Render/MeshFactory"
import {CurveRecorder, previewSamples} from "./CurveRecorder"
import {centerCurveItem} from "./ItemFactory"
import {Tool, ToolContext} from "./Tool"

/** Swept surfaces are this many times wider than the brush. */
export const SWEEP_WIDTH_FACTOR = 8
const REVOLVE_SEGMENTS = 40

export class SurfaceTool implements Tool {
  readonly id = ToolId.Surface
  private recorder = new CurveRecorder()
  private preview: DynamicMesh | null = null
  /** First curve of a loft, in root space. */
  private loftFirst: P3[] | null = null

  hint(ctx: ToolContext): string {
    switch (ctx.state.surfaceMode) {
      case SurfaceMode.Sweep:
        return "Pinch and sweep your hand to lay down a surface (width follows your knuckles)"
      case SurfaceMode.Revolve:
        return ctx.state.symmetry === SymmetryMode.Off
          ? "Draw a profile starting on the axis — it is revolved around a vertical axis"
          : "Draw a profile — it is revolved around the symmetry axis"
      case SurfaceMode.Loft:
        return this.loftFirst ? "Draw the second curve to loft between them" : "Draw the first curve of the loft"
      case SurfaceMode.Fill:
        return "Draw a closed loop to fill it with a surface"
    }
  }

  activate(ctx: ToolContext): void {
    if (!this.preview) {
      this.preview = new DynamicMesh(
        ctx.workspace.root,
        "Surface Preview",
        ctx.materials.get(ctx.state.color, ctx.state.material)
      )
      ctx.state.onChanged.add((key) => {
        if (key === "surfaceMode") {
          this.loftFirst = null
          this.recorder.cancel()
          this.preview?.clear()
        }
      })
    }
  }

  deactivate(_ctx: ToolContext): void {
    this.recorder.cancel()
    this.preview?.clear()
    this.loftFirst = null
  }

  update(ctx: ToolContext, hand: HandState, active: boolean): void {
    if (hand.tracked) {
      ctx.gizmos.handle(hand.position, 0.35, ctx.state.color)
      if (ctx.state.surfaceMode === SurfaceMode.Sweep) {
        // Show the sweep segment across the hand.
        const half = (ctx.state.width * SWEEP_WIDTH_FACTOR) / 2
        ctx.gizmos.line(
          hand.position.sub(hand.lateral.uniformScale(half)),
          hand.position.add(hand.lateral.uniformScale(half)),
          0.15,
          GizmoColors.accent
        )
      }
    }
    if (this.loftFirst) {
      ctx.gizmos.polyline(
        this.loftFirst.map((p) => ctx.workspace.rootToWorld(new vec3(p.x, p.y, p.z))),
        0.2,
        GizmoColors.accent
      )
    }
    this.drawAxis(ctx, hand)
    if (!active) {
      if (this.recorder.recording) {
        this.finish(ctx)
      }
      return
    }
    if (hand.pinchDown) {
      this.recorder.begin(ctx, hand)
    } else if (hand.pinching && this.recorder.recording) {
      this.recorder.add(ctx, hand)
    } else if (hand.pinchUp && this.recorder.recording) {
      this.finish(ctx)
      return
    }
    if (this.recorder.recording) {
      this.recorder.drawGuides(ctx)
      const sym = ctx.rootSymmetry()
      const live = previewSamples(this.recorder.livePoints, this.recorder.liveUps, 50, symmetryCopies(sym))
      const mesh = this.buildPreview(ctx, live.points, live.ups)
      if (mesh && this.preview) {
        this.preview.setMaterial(ctx.materials.get(ctx.state.color, ctx.state.material))
        this.preview.update(applySymmetry(mesh, sym))
      } else {
        this.preview?.clear()
      }
    }
  }

  private revolveAxis(ctx: ToolContext, points: P3[]): {origin: P3; dir: P3} {
    if (ctx.state.symmetry !== SymmetryMode.Off || points.length === 0) {
      return {origin: {x: 0, y: 0, z: 0}, dir: {x: 0, y: 1, z: 0}}
    }
    return {origin: {x: points[0].x, y: 0, z: points[0].z}, dir: {x: 0, y: 1, z: 0}}
  }

  private drawAxis(ctx: ToolContext, hand: HandState): void {
    if (ctx.state.surfaceMode !== SurfaceMode.Revolve) {
      return
    }
    const pts = this.recorder.recording ? this.recorder.livePoints : []
    let origin: P3
    if (pts.length > 0 || ctx.state.symmetry !== SymmetryMode.Off) {
      origin = this.revolveAxis(ctx, pts).origin
    } else if (hand.tracked) {
      const p = ctx.rootPoint(hand)
      origin = {x: p.x, y: 0, z: p.z}
    } else {
      return
    }
    const h = ctx.worldToSketchLength(30)
    const a = ctx.workspace.rootToWorld(new vec3(origin.x, -h * 0.2, origin.z))
    const b = ctx.workspace.rootToWorld(new vec3(origin.x, h, origin.z))
    ctx.gizmos.line(a, b, 0.12, GizmoColors.symmetry)
  }

  private buildPreview(ctx: ToolContext, points: P3[], ups: P3[]): MeshData | null {
    if (points.length < 2) {
      return null
    }
    switch (ctx.state.surfaceMode) {
      case SurfaceMode.Sweep:
        return buildSweep(points, ups, [ctx.worldToSketchLength(ctx.state.width * SWEEP_WIDTH_FACTOR)])
      case SurfaceMode.Revolve: {
        const axis = this.revolveAxis(ctx, points)
        return buildRevolve(points, axis.origin, axis.dir, 24)
      }
      case SurfaceMode.Loft:
        return this.loftFirst ? buildLoft(this.loftFirst, points, 32, 4) : null
      case SurfaceMode.Fill:
        return isClosedLoop(points, ctx.worldToSketchLength(4)) ? buildFill(points, 64) : null
    }
  }

  private finish(ctx: ToolContext): void {
    this.preview?.clear()
    const curve = this.recorder.finish(ctx, 0.6)
    if (!curve) {
      return
    }
    const base = {id: newItemId(), ...ctx.baseItem(), transform: identityTransform()}
    let item: SketchItem | null = null
    switch (ctx.state.surfaceMode) {
      case SurfaceMode.Sweep:
        item = {
          ...base,
          kind: ItemKind.Sweep,
          points: curve.points,
          ups: curve.ups,
          widths: [ctx.worldToSketchLength(ctx.state.width * SWEEP_WIDTH_FACTOR)]
        }
        break
      case SurfaceMode.Revolve: {
        const axis = this.revolveAxis(ctx, curve.points)
        item = {
          ...base,
          kind: ItemKind.Revolve,
          points: curve.points,
          axisOrigin: axis.origin,
          axisDir: axis.dir,
          segments: REVOLVE_SEGMENTS
        }
        // A revolve around the symmetry axis is already symmetric; skip baking extra copies.
        const centered = centerCurveItem(ctx, item)
        delete centered.symmetry
        ctx.doc.put("Revolve", centered)
        return
      }
      case SurfaceMode.Loft:
        if (!this.loftFirst) {
          this.loftFirst = curve.points
          ctx.state.toast("First curve set — draw the second")
          return
        }
        item = {...base, kind: ItemKind.Loft, points: this.loftFirst, points2: curve.points}
        this.loftFirst = null
        break
      case SurfaceMode.Fill:
        if (!isClosedLoop(curve.points, ctx.worldToSketchLength(4))) {
          ctx.state.toast("Close the loop to fill it")
          return
        }
        item = {...base, kind: ItemKind.Fill, points: curve.points}
        break
    }
    if (item) {
      ctx.doc.put(labelFor(item.kind), centerCurveItem(ctx, item))
    }
  }
}

function labelFor(kind: ItemKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}
