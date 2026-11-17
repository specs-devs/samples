/**
 * SPECS Inc. 2027
 * Freehand 3D strokes: pinch and move to sweep the selected cross-section along the hand's path.
 */
import {ToolId} from "../Core/AppState"
import {ItemKind, SketchItem, identityTransform, newItemId} from "../Core/SketchTypes"
import {applySymmetry, symmetryCopies} from "../Geometry/Symmetry"
import {CrossSection, buildTube, crossSectionLabel} from "../Geometry/TubeBuilder"
import {HandState} from "../Input/HandTracker"
import {GizmoColors} from "../Render/Gizmos"
import {DynamicMesh} from "../Render/MeshFactory"
import {CurveRecorder, previewSamples} from "./CurveRecorder"
import {centerCurveItem} from "./ItemFactory"
import {Tool, ToolContext} from "./Tool"

export class StrokeTool implements Tool {
  readonly id = ToolId.Stroke
  private recorder = new CurveRecorder()
  private preview: DynamicMesh | null = null

  hint(ctx: ToolContext): string {
    const s = ctx.state
    const mode = s.snap ? "straight lines (snap on)" : s.planar ? "on the palm plane" : "freehand"
    return "Pinch and move to draw " + crossSectionLabel(s.section).toLowerCase() + " strokes, " + mode
  }

  activate(ctx: ToolContext): void {
    if (!this.preview) {
      this.preview = new DynamicMesh(
        ctx.workspace.root,
        "Stroke Preview",
        ctx.materials.get(ctx.state.color, ctx.state.material)
      )
    }
  }

  deactivate(_ctx: ToolContext): void {
    this.recorder.cancel()
    this.preview?.clear()
  }

  update(ctx: ToolContext, hand: HandState, active: boolean): void {
    const width = ctx.worldToSketchLength(ctx.state.width)
    if (hand.tracked) {
      // Brush cursor with symmetric ghosts.
      const r = Math.max(ctx.state.width / 2, 0.25)
      ctx.gizmos.handle(hand.position, r, ctx.state.color)
      for (const g of ctx.ghostPoints(ctx.rootPoint(hand))) {
        ctx.gizmos.handle(g, r, GizmoColors.symmetry)
      }
    }
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
      const live = previewSamples(this.recorder.livePoints, this.recorder.liveUps, 14, symmetryCopies(sym))
      if (live.points.length >= 2 && this.preview) {
        const mesh = buildTube(live.points, {
          section: ctx.state.section,
          widths: [width],
          ups: ctx.state.section === CrossSection.Ribbon ? live.ups : undefined,
          taper: ctx.state.taper ? 0.15 : 0
        })
        this.preview.setMaterial(ctx.materials.get(ctx.state.color, ctx.state.material))
        this.preview.update(applySymmetry(mesh, sym))
      }
    }
  }

  private finish(ctx: ToolContext): void {
    this.preview?.clear()
    const curve = this.recorder.finish(ctx)
    if (!curve) {
      return
    }
    const width = ctx.worldToSketchLength(ctx.state.width)
    const item: SketchItem = {
      id: newItemId(),
      kind: ItemKind.Stroke,
      ...ctx.baseItem(),
      transform: identityTransform(),
      points: curve.points,
      widths: [Math.round(width * 1000) / 1000],
      section: ctx.state.section,
      taper: ctx.state.taper ? 0.15 : 0
    }
    if (ctx.state.section === CrossSection.Ribbon) {
      item.ups = curve.ups
    }
    ctx.doc.put("Stroke", centerCurveItem(ctx, item))
  }
}
