/**
 * SPECS Inc. 2027
 * Grab tool: pinch an item to move and rotate it with the hand, add the other hand to scale it.
 * Tap (pinch without moving) adds or removes items from the selection; tap empty space to clear it.
 */
import {ToolId} from "../Core/AppState"
import {arrayToQuat, quatToArray, snapRotation, toVec3} from "../Core/LensMath"
import {cloneItem, ItemTransform, SketchItem} from "../Core/SketchTypes"
import {HandState} from "../Input/HandTracker"
import {GizmoColors} from "../Render/Gizmos"
import {drawItemBox, PICK_RADIUS_WORLD, Tool, ToolContext} from "./Tool"

const TAP_MAX_MOVE_WORLD = 1.2
const ROTATION_SMOOTHING = 0.35
const ANGLE_SNAP_DEG = 15
const MAX_SELECTION_BOXES = 40

interface Grab {
  hitId: string | null
  wasSelected: boolean
  ids: string[]
  startTime: number
  handPos0: vec3
  handRot0: quat
  smoothedRot: quat
  start: Map<string, ItemTransform>
  moved: boolean
  /** Accumulated scale from finished two-hand gestures. */
  scale: number
  twoHand: {dist0: number; scaleAtStart: number} | null
}

export class GrabTool implements Tool {
  readonly id = ToolId.Select
  private grab: Grab | null = null
  private hover: string | null = null

  hint(ctx: ToolContext): string {
    if (this.grab && this.grab.twoHand) {
      return "Move your hands apart or together to scale"
    }
    if (this.grab && this.grab.ids.length > 0) {
      return "Move and turn your hand — pinch with the other hand to scale"
    }
    const n = ctx.state.selection.length
    return n > 0
      ? n + " selected — tap items to add or remove, tap empty space to clear"
      : "Pinch an object to grab it, tap to select it"
  }

  activate(_ctx: ToolContext): void {}

  deactivate(ctx: ToolContext): void {
    if (this.grab) {
      this.release(ctx)
    }
    this.hover = null
  }

  wantsSecondHand(_ctx: ToolContext): boolean {
    return !!this.grab && this.grab.ids.length > 0
  }

  updateSecondHand(ctx: ToolContext, hand: HandState): void {
    const g = this.grab
    if (!g) {
      return
    }
    const dominant = ctx.hands.dominant
    if (hand.pinching && !g.twoHand) {
      const d = ctx.rootPoint(hand).distance(ctx.rootPoint(dominant))
      g.twoHand = {dist0: Math.max(d, 1e-3), scaleAtStart: g.scale}
    } else if (!hand.pinching && g.twoHand) {
      g.twoHand = null
    }
    if (g.twoHand) {
      const d = ctx.rootPoint(hand).distance(ctx.rootPoint(dominant))
      g.scale = Math.max(0.02, Math.min(50, g.twoHand.scaleAtStart * (d / g.twoHand.dist0)))
      ctx.readout = "×" + g.scale.toFixed(2)
      g.moved = true
      ctx.gizmos.line(hand.position, dominant.position, 0.1, GizmoColors.accent)
    }
  }

  update(ctx: ToolContext, hand: HandState, active: boolean): void {
    const pickRadius = ctx.worldToSketchLength(PICK_RADIUS_WORLD)
    if (!this.grab) {
      const hit = hand.tracked ? ctx.views.pick(ctx.rootPoint(hand), pickRadius) : null
      this.hover = hit ? hit.id : null
    }

    // Feedback: selection boxes and hover box.
    // Outline at most MAX_SELECTION_BOXES items so a "select all" on a big sketch stays cheap.
    const selection = ctx.state.selection
    for (let i = 0; i < Math.min(selection.length, MAX_SELECTION_BOXES); i++) {
      drawItemBox(ctx, selection[i], GizmoColors.accent)
    }
    if (this.hover && ctx.state.selection.indexOf(this.hover) < 0) {
      for (const id of ctx.doc.groupOf(this.hover)) {
        drawItemBox(ctx, id, GizmoColors.hover, 0.07)
      }
    }
    if (hand.tracked) {
      ctx.gizmos.handle(hand.position, 0.3, this.hover ? GizmoColors.accent : GizmoColors.white)
    }

    if (!active) {
      if (this.grab) {
        this.release(ctx)
      }
      return
    }
    if (hand.pinchDown) {
      this.begin(ctx, hand)
    } else if (this.grab && hand.pinching) {
      this.drag(ctx, hand)
    } else if (this.grab && hand.pinchUp) {
      this.release(ctx)
    }
  }

  private begin(ctx: ToolContext, hand: HandState): void {
    const hitId = this.hover
    const selection = ctx.state.selection
    const wasSelected = !!hitId && selection.indexOf(hitId) >= 0
    let ids: string[] = []
    if (hitId) {
      ids = wasSelected ? selection.slice() : ctx.doc.groupOf(hitId)
    }
    const start = new Map<string, ItemTransform>()
    for (const id of ids) {
      const item = ctx.doc.get(id)
      if (item) {
        start.set(id, cloneItem(item).transform)
      }
    }
    const rot = ctx.workspace.worldRotToRoot(hand.rotation)
    this.grab = {
      hitId,
      wasSelected,
      ids,
      startTime: ctx.time,
      handPos0: ctx.rootPoint(hand),
      handRot0: rot,
      smoothedRot: rot,
      start,
      moved: false,
      scale: 1,
      twoHand: null
    }
    if (ids.length > 0) {
      ctx.doc.beginEdit(ids)
    }
  }

  private drag(ctx: ToolContext, hand: HandState): void {
    const g = this.grab!
    if (g.ids.length === 0) {
      return
    }
    const pos = ctx.rootPoint(hand)
    const target = ctx.workspace.worldRotToRoot(hand.rotation)
    g.smoothedRot = quat.slerp(g.smoothedRot, target, ROTATION_SMOOTHING)
    const travel = ctx.workspace.rootToWorld(pos).distance(ctx.workspace.rootToWorld(g.handPos0))
    if (travel > TAP_MAX_MOVE_WORLD) {
      g.moved = true
    }
    if (!g.moved) {
      return
    }
    const delta = g.smoothedRot.multiply(g.handRot0.invert())
    for (const id of g.ids) {
      const t0 = g.start.get(id)
      const item = ctx.doc.get(id)
      if (!t0 || !item) {
        continue
      }
      const offset = toVec3(t0.position).sub(g.handPos0).uniformScale(g.scale)
      let position = pos.add(delta.multiplyVec3(offset))
      let rotation = delta.multiply(arrayToQuat(t0.rotation))
      if (ctx.state.snap) {
        position = ctx.snap(position)
        rotation = snapRotation(rotation, ANGLE_SNAP_DEG)
      }
      const next: SketchItem = cloneItem(item)
      next.transform = {
        position: {x: position.x, y: position.y, z: position.z},
        rotation: quatToArray(rotation),
        scale: {x: t0.scale.x * g.scale, y: t0.scale.y * g.scale, z: t0.scale.z * g.scale}
      }
      ctx.doc.preview(next)
    }
  }

  private release(ctx: ToolContext): void {
    const g = this.grab
    this.grab = null
    if (!g) {
      return
    }
    if (g.ids.length > 0) {
      ctx.doc.endEdit(g.scale !== 1 ? "Scale" : "Move", !g.moved)
    }
    if (!g.moved) {
      // Tap (pinch without moving): toggle selection membership.
      if (!g.hitId) {
        ctx.state.selection = []
      } else {
        const group = ctx.doc.groupOf(g.hitId)
        const current = ctx.state.selection
        if (g.wasSelected) {
          ctx.state.selection = current.filter((id) => group.indexOf(id) < 0)
        } else {
          ctx.state.selection = current.concat(group.filter((id) => current.indexOf(id) < 0))
        }
      }
    } else if (g.moved && g.hitId && !g.wasSelected) {
      ctx.state.selection = g.ids
    }
  }
}
