/**
 * SPECS Inc. 2027
 * Records a hand-drawn curve in sketch-root space: One Euro filtering, spacing, planar lock, snapped
 * straight lines, and final smoothing/resampling.
 */
import {toP3} from "../Core/LensMath"
import {OneEuroFilter3, polylineLength, resampleByCount, resampleBySpacing, smoothPolyline} from "../Geometry/Curve"
import {normalize, P3} from "../Geometry/Vec"
import {HandState} from "../Input/HandTracker"
import {GizmoColors} from "../Render/Gizmos"
import {ToolContext} from "./Tool"

export interface RecordedCurve {
  points: P3[]
  /** Hand lateral axis per point (root space, unit). */
  ups: P3[]
  /** Length in sketch units. */
  length: number
}

interface Plane {
  origin: vec3
  normal: vec3
}

export class CurveRecorder {
  private filter = new OneEuroFilter3(1.0, 0.015, 1.0)
  private rawPoints: P3[] = []
  private rawUps: P3[] = []
  private plane: Plane | null = null
  private start: vec3 | null = null
  private straight = false
  recording = false

  /** Starts recording. Captures the drawing plane (planar mode) from the non-dominant palm. */
  begin(ctx: ToolContext, hand: HandState): void {
    this.filter.reset()
    this.rawPoints = []
    this.rawUps = []
    this.recording = true
    this.straight = ctx.state.snap
    const p = ctx.snap(ctx.rootPoint(hand))
    this.start = p
    this.plane = null
    if (ctx.state.planar) {
      const other = ctx.hands.nonDominant
      let normal: vec3
      if (other.tracked && !other.simulated) {
        normal = ctx.workspace.worldDirToRoot(other.palmNormal)
      } else {
        // No reference hand: draw on the plane facing the user.
        normal = ctx.workspace.worldDirToRoot(ctx.workspace.rootToWorld(vec3.zero()).sub(hand.position).normalize())
      }
      this.plane = {origin: p, normal: normal.normalize()}
    }
    this.add(ctx, hand)
  }

  /** Adds the current hand sample (call every frame while pinching). */
  add(ctx: ToolContext, hand: HandState): void {
    if (!this.recording) {
      return
    }
    let p = ctx.rootPoint(hand)
    if (this.plane) {
      const d = p.sub(this.plane.origin).dot(this.plane.normal)
      p = p.sub(this.plane.normal.uniformScale(d))
    }
    const up = toP3(ctx.workspace.worldDirToRoot(hand.lateral))
    if (this.straight && this.start) {
      // Snapped straight line from the snapped start to the snapped current point.
      const end = ctx.snap(p)
      this.rawPoints = [toP3(this.start), toP3(end)]
      this.rawUps = [up, up]
      return
    }
    const filtered = this.filter.filter(toP3(p), ctx.time)
    const spacing = ctx.worldToSketchLength(0.25)
    const last = this.rawPoints[this.rawPoints.length - 1]
    if (!last || dist(last, filtered) >= spacing) {
      this.rawPoints.push(filtered)
      this.rawUps.push(up)
    }
  }

  /** Current (unsmoothed) points for live preview. */
  get livePoints(): P3[] {
    if (this.straight) {
      return densify(this.rawPoints, 8)
    }
    return this.rawPoints
  }

  get liveUps(): P3[] {
    if (this.straight && this.rawUps.length > 0) {
      return densify(this.rawPoints, 8).map(() => this.rawUps[0])
    }
    return this.rawUps
  }

  /** Draws the planar-mode drawing plane. */
  drawGuides(ctx: ToolContext): void {
    if (!this.plane || !this.recording) {
      return
    }
    const n = this.plane.normal
    const u = Math.abs(n.y) < 0.9 ? n.cross(vec3.up()).normalize() : n.cross(vec3.right()).normalize()
    const v = n.cross(u).normalize()
    const r = ctx.worldToSketchLength(12)
    const o = this.plane.origin
    const corners = [
      o.add(u.uniformScale(r)).add(v.uniformScale(r)),
      o.add(u.uniformScale(-r)).add(v.uniformScale(r)),
      o.add(u.uniformScale(-r)).add(v.uniformScale(-r)),
      o.add(u.uniformScale(r)).add(v.uniformScale(-r))
    ].map((c) => ctx.workspace.rootToWorld(c))
    ctx.gizmos.polyline(corners, 0.15, GizmoColors.guide, true)
  }

  /**
   * Ends recording and returns the smoothed curve, or null when it is too short.
   * `spacingWorld` sets the output point spacing in world cm.
   */
  finish(ctx: ToolContext, spacingWorld: number = 0.5): RecordedCurve | null {
    this.recording = false
    const pts = this.livePoints
    const ups = this.liveUps
    if (pts.length < 2) {
      return null
    }
    const length = polylineLength(pts)
    if (length < ctx.worldToSketchLength(0.6)) {
      return null
    }
    let points = pts
    if (!this.straight) {
      const strength = ctx.state.smoothing
      points = smoothPolyline(pts, 0.5, Math.round(strength * 8))
    }
    // Resample points and carry the up vectors along by nearest index.
    const res = resampleBySpacing(points, ctx.worldToSketchLength(spacingWorld))
    const outUps: P3[] = res.points.map((_p, i) => {
      const j = Math.min(ups.length - 1, Math.round((i / Math.max(1, res.points.length - 1)) * (ups.length - 1)))
      return normalize(ups[j])
    })
    return {points: res.points, ups: smoothUps(outUps), length}
  }

  cancel(): void {
    this.recording = false
    this.rawPoints = []
    this.rawUps = []
  }
}

function dist(a: P3, b: P3): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/** Inserts `steps` points per segment so straight lines still sweep cleanly. */
function densify(points: P3[], steps: number): P3[] {
  if (points.length !== 2) {
    return points
  }
  const [a, b] = points
  const out: P3[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    out.push({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t})
  }
  return out
}

/** Light smoothing of orientation hints so ribbons don't flutter with hand-tracking noise. */
function smoothUps(ups: P3[]): P3[] {
  if (ups.length < 3) {
    return ups
  }
  const out = ups.map((u) => ({...u}))
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < out.length - 1; i++) {
      const a = out[i - 1]
      const b = out[i]
      const c = out[i + 1]
      // Align signs before averaging.
      const sa = a.x * b.x + a.y * b.y + a.z * b.z < 0 ? -1 : 1
      const sc = c.x * b.x + c.y * b.y + c.z * b.z < 0 ? -1 : 1
      out[i] = normalize({
        x: b.x * 2 + a.x * sa + c.x * sc,
        y: b.y * 2 + a.y * sa + c.y * sc,
        z: b.z * 2 + a.z * sa + c.z * sc
      })
    }
  }
  return out
}

/** Vertex budget of a live preview (one 16-bit mesh chunk, with headroom). */
const PREVIEW_VERTEX_BUDGET = 60000

/**
 * Decimates live-preview input so `points × vertsPerPoint × copies` stays within one mesh chunk.
 * The committed item always uses the full-resolution curve.
 */
export function previewSamples(
  points: P3[],
  ups: P3[],
  vertsPerPoint: number,
  copies: number
): {points: P3[]; ups: P3[]} {
  const max = Math.max(8, Math.floor(PREVIEW_VERTEX_BUDGET / Math.max(1, vertsPerPoint * copies)))
  if (points.length <= max) {
    return {points, ups}
  }
  const res = resampleByCount(points, max)
  const outUps = res.points.map(
    (_p, i) => ups[Math.min(ups.length - 1, Math.round((i / (max - 1)) * (ups.length - 1)))]
  )
  return {points: res.points, ups: ups.length > 0 ? outUps : []}
}
