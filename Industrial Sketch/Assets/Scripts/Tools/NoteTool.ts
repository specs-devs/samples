/**
 * SPECS Inc. 2027
 * Notes: pins short review comments in the sketch. Pinch in space to pin the current note text, or pinch an
 * existing note to change its text. Notes are items, so Grab moves them, Erase removes them and they are shared
 * with collaborators like everything else.
 */
import {ToolId} from "../Core/AppState"
import {toP3} from "../Core/LensMath"
import {identityTransform, ItemKind, MaterialPreset, newItemId, SketchItem} from "../Core/SketchTypes"
import {HandState} from "../Input/HandTracker"
import {GizmoColors} from "../Render/Gizmos"
import {drawItemBox, PICK_RADIUS_WORLD, Tool, ToolContext} from "./Tool"

export class NoteTool implements Tool {
  readonly id = ToolId.Note
  private hovered: string | null = null

  hint(ctx: ToolContext): string {
    return 'Pinch to pin "' + ctx.state.noteText + '" · pinch a note to change its text'
  }

  activate(_ctx: ToolContext): void {}

  deactivate(_ctx: ToolContext): void {
    this.hovered = null
  }

  update(ctx: ToolContext, hand: HandState, active: boolean): void {
    if (!hand.tracked) {
      this.hovered = null
      return
    }
    ctx.gizmos.handle(hand.position, 0.3, GizmoColors.white)
    const point = ctx.rootPoint(hand)
    const hit = ctx.views.pick(point, ctx.worldToSketchLength(PICK_RADIUS_WORLD), (i) => i.kind === ItemKind.Note)
    this.hovered = hit ? hit.id : null
    if (this.hovered) {
      drawItemBox(ctx, this.hovered, GizmoColors.accent)
    }
    if (!active) {
      return
    }
    ctx.readout = this.hovered ? 'Change to "' + ctx.state.noteText + '"' : 'Pin "' + ctx.state.noteText + '"'
    if (!hand.pinchDown) {
      return
    }
    const text = ctx.state.noteText.trim()
    if (text.length === 0) {
      ctx.state.toast("Choose or type a note first (Options page)")
      return
    }
    if (this.hovered) {
      const existing = ctx.doc.get(this.hovered)
      if (existing && existing.text !== text) {
        ctx.doc.put("Edit note", {...existing, text})
      }
      return
    }
    const anchor = ctx.snap(point)
    // Pins are created at a constant size in the world, whatever the view scale.
    const s = 1 / Math.max(ctx.workspace.scale, 1e-3)
    const item: SketchItem = {
      id: newItemId(),
      kind: ItemKind.Note,
      color: [...ctx.state.color] as [number, number, number],
      material: MaterialPreset.Flat,
      layer: ctx.state.activeLayer,
      transform: identityTransform(),
      points: [{x: 0, y: 0, z: 0}],
      text
    }
    item.transform.position = toP3(anchor)
    item.transform.scale = {x: s, y: s, z: s}
    ctx.doc.put("Note", item)
  }
}
