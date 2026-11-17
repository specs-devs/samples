/**
 * SPECS Inc. 2027
 * Touch-to-apply tools: Paint (recolor what you sweep through, or pick a color with the eyedropper),
 * Erase (delete what you sweep through) and Measure (dimension lines).
 */
import {ToolId} from "../Core/AppState"
import {toP3} from "../Core/LensMath"
import {cloneItem, identityTransform, ItemKind, MaterialPreset, newItemId, SketchItem} from "../Core/SketchTypes"
import {HandState} from "../Input/HandTracker"
import {GizmoColors} from "../Render/Gizmos"
import {drawItemBox, PICK_RADIUS_WORLD, Tool, ToolContext} from "./Tool"

/** Shared "sweep through items while pinching" behaviour. */
abstract class SweepTool implements Tool {
  abstract readonly id: ToolId
  protected touched = new Set<string>()
  protected sweeping = false
  protected hover: string | null = null

  abstract hint(ctx: ToolContext): string
  protected abstract cursorColor(ctx: ToolContext): [number, number, number]
  /** Called once per newly touched item while sweeping. */
  protected abstract onTouch(ctx: ToolContext, id: string): void
  /** Called on release with all touched ids. */
  protected abstract onFinish(ctx: ToolContext, ids: string[]): void

  activate(_ctx: ToolContext): void {}

  deactivate(ctx: ToolContext): void {
    if (this.sweeping) {
      this.finish(ctx)
    }
    this.hover = null
  }

  update(ctx: ToolContext, hand: HandState, active: boolean): void {
    const radius = ctx.worldToSketchLength(PICK_RADIUS_WORLD)
    const hit = hand.tracked ? ctx.views.pick(ctx.rootPoint(hand), radius) : null
    this.hover = hit ? hit.id : null
    if (hand.tracked) {
      ctx.gizmos.handle(hand.position, PICK_RADIUS_WORLD * 0.35, this.cursorColor(ctx))
    }
    if (this.hover && !this.touched.has(this.hover)) {
      for (const id of ctx.doc.groupOf(this.hover)) {
        drawItemBox(ctx, id, this.cursorColor(ctx), 0.07)
      }
    }
    if (!active) {
      if (this.sweeping) {
        this.finish(ctx)
      }
      return
    }
    if (hand.pinchDown) {
      this.sweeping = true
      this.touched.clear()
    }
    if (this.sweeping && hand.pinching && this.hover) {
      for (const id of ctx.doc.groupOf(this.hover)) {
        if (!this.touched.has(id)) {
          this.touched.add(id)
          this.onTouch(ctx, id)
          if (!this.sweeping) {
            // The touch ended the gesture (eyedropper pick): don't apply it to the rest of the group.
            break
          }
        }
      }
    }
    if (this.sweeping && hand.pinchUp) {
      this.finish(ctx)
    }
  }

  private finish(ctx: ToolContext): void {
    this.sweeping = false
    const ids = Array.from(this.touched)
    this.touched.clear()
    this.onFinish(ctx, ids)
  }
}

export class EraseTool extends SweepTool {
  readonly id = ToolId.Erase

  hint(_ctx: ToolContext): string {
    return "Pinch and sweep through objects to erase them"
  }

  protected cursorColor(_ctx: ToolContext): [number, number, number] {
    return GizmoColors.warning
  }

  protected onTouch(ctx: ToolContext, id: string): void {
    ctx.views.setSuppressed(id, true)
  }

  protected onFinish(ctx: ToolContext, ids: string[]): void {
    for (const id of ids) {
      ctx.views.setSuppressed(id, false)
    }
    if (ids.length > 0) {
      ctx.doc.remove(ids.length === 1 ? "Erase" : "Erase " + ids.length, ids)
      ctx.state.selection = ctx.state.selection.filter((id) => ids.indexOf(id) < 0)
    }
  }
}

export class PaintTool extends SweepTool {
  readonly id = ToolId.Paint
  /** When on, the next pinch picks color and material from an item instead of painting. */
  eyedropper = false

  hint(_ctx: ToolContext): string {
    return this.eyedropper
      ? "Eyedropper: pinch an object to pick its color and finish"
      : "Pinch and sweep through objects to apply the current color and finish"
  }

  protected cursorColor(ctx: ToolContext): [number, number, number] {
    return this.eyedropper ? GizmoColors.white : ctx.state.color
  }

  protected onTouch(ctx: ToolContext, id: string): void {
    const item = ctx.doc.get(id)
    if (!item) {
      return
    }
    if (this.eyedropper) {
      ctx.state.color = [...item.color] as [number, number, number]
      ctx.state.material = item.material
      this.eyedropper = false
      this.touched.clear()
      this.sweeping = false
      ctx.state.toast("Picked color")
      return
    }
    if (!ctx.doc.isEditing) {
      ctx.doc.beginEdit([])
    }
    const next = cloneItem(item)
    next.color = [...ctx.state.color] as [number, number, number]
    next.material = ctx.state.material
    ctx.doc.preview(next)
  }

  protected onFinish(ctx: ToolContext, _ids: string[]): void {
    if (ctx.doc.isEditing) {
      ctx.doc.endEdit("Paint")
    }
  }
}

export class MeasureTool implements Tool {
  readonly id = ToolId.Measure
  private start: vec3 | null = null
  private end: vec3 | null = null

  hint(ctx: ToolContext): string {
    return "Pinch and drag to measure" + (ctx.state.snap ? " (snapped to grid)" : " — turn on Snap for exact points")
  }

  activate(_ctx: ToolContext): void {}

  deactivate(_ctx: ToolContext): void {
    this.start = null
  }

  update(ctx: ToolContext, hand: HandState, active: boolean): void {
    if (hand.tracked) {
      ctx.gizmos.handle(hand.position, 0.3, GizmoColors.white)
    }
    if (!active) {
      this.start = null
      return
    }
    if (hand.pinchDown) {
      this.start = ctx.snap(ctx.rootPoint(hand))
    }
    if (this.start && hand.pinching) {
      this.end = ctx.snap(ctx.rootPoint(hand))
      const a = ctx.workspace.rootToWorld(this.start)
      const b = ctx.workspace.rootToWorld(this.end)
      ctx.gizmos.line(a, b, 0.12, GizmoColors.accent)
      ctx.gizmos.handle(a, 0.35, GizmoColors.accent)
      ctx.gizmos.handle(b, 0.35, GizmoColors.accent)
      ctx.readout = formatLength(this.end.distance(this.start))
    }
    if (this.start && hand.pinchUp && this.end) {
      const length = this.end.distance(this.start)
      if (ctx.workspace.scale * length >= 0.5) {
        const mid = this.start.add(this.end).uniformScale(0.5)
        const item: SketchItem = {
          id: newItemId(),
          kind: ItemKind.Measure,
          color: [0.25, 0.85, 1],
          material: MaterialPreset.Flat,
          layer: ctx.state.activeLayer,
          transform: identityTransform(),
          points: [toP3(this.start.sub(mid)), toP3(this.end.sub(mid))]
        }
        item.transform.position = toP3(mid)
        ctx.doc.put("Measure", item)
      }
      this.start = null
      this.end = null
    }
  }
}

/** Formats a sketch-space length (cm at life size). */
export function formatLength(cm: number): string {
  if (cm >= 100) {
    return (cm / 100).toFixed(2) + " m"
  }
  if (cm >= 10) {
    return cm.toFixed(1) + " cm"
  }
  return (cm * 10).toFixed(0) + " mm"
}
