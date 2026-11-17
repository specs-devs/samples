/**
 * SPECS Inc. 2027
 * Tool interface and the shared context every sketching tool receives.
 */
import {AppState, ToolId} from "../Core/AppState"
import {itemToRoot, toP3} from "../Core/LensMath"
import {SketchDocument} from "../Core/SketchDocument"
import {SketchItem} from "../Core/SketchTypes"
import {noSymmetry, Symmetry, symmetryCopies, SymmetryMode, symmetryPoint} from "../Geometry/Symmetry"
import {P3, snapToGrid} from "../Geometry/Vec"
import {HandState, HandTracker} from "../Input/HandTracker"
import {Gizmos} from "../Render/Gizmos"
import {ItemViews} from "../Render/ItemViews"
import {MaterialLibrary} from "../Render/MaterialLibrary"
import {Workspace} from "../Workspace/Workspace"

/** World-space pick tolerance (cm) — converted to sketch units with the current scale. */
export const PICK_RADIUS_WORLD = 2.5

export class ToolContext {
  time = 0
  dt = 0
  /** Text shown next to the dominant hand while a tool is active (e.g. a live dimension). */
  readout = ""

  constructor(
    readonly doc: SketchDocument,
    readonly state: AppState,
    readonly views: ItemViews,
    readonly workspace: Workspace,
    readonly gizmos: Gizmos,
    readonly materials: MaterialLibrary,
    readonly hands: HandTracker
  ) {}

  /** Converts a world-space length (cm) to sketch units at the current scale. */
  worldToSketchLength(cm: number): number {
    return cm / Math.max(this.workspace.scale, 1e-4)
  }

  /** Root-space pinch point of a hand. */
  rootPoint(hand: HandState): vec3 {
    return this.workspace.worldToRoot(hand.position)
  }

  /** Grid snapping in root space (only when snapping is on). */
  snap(p: vec3): vec3 {
    if (!this.state.snap) {
      return p
    }
    const s = snapToGrid(toP3(p), this.state.gridStep)
    return new vec3(s.x, s.y, s.z)
  }

  /** Current symmetry in sketch-root space. */
  rootSymmetry(): Symmetry {
    switch (this.state.symmetry) {
      case SymmetryMode.Mirror:
        return {mode: SymmetryMode.Mirror, origin: {x: 0, y: 0, z: 0}, axis: {x: 1, y: 0, z: 0}, count: 2}
      case SymmetryMode.Radial:
        return {
          mode: SymmetryMode.Radial,
          origin: {x: 0, y: 0, z: 0},
          axis: {x: 0, y: 1, z: 0},
          count: this.state.radialCount
        }
      default:
        return noSymmetry()
    }
  }

  /** Expresses a root-space symmetry relative to an item whose local origin sits at `center` (no rotation/scale). */
  localSymmetry(center: P3): Symmetry | undefined {
    const sym = this.rootSymmetry()
    if (sym.mode === SymmetryMode.Off) {
      return undefined
    }
    return {
      mode: sym.mode,
      origin: {x: sym.origin.x - center.x, y: sym.origin.y - center.y, z: sym.origin.z - center.z},
      axis: sym.axis,
      count: sym.count
    }
  }

  /** World positions of the symmetric copies of a root-space point (excluding the point itself). */
  ghostPoints(rootPoint: vec3): vec3[] {
    const sym = this.rootSymmetry()
    const out: vec3[] = []
    const n = symmetryCopies(sym)
    for (let k = 1; k < n; k++) {
      const q = symmetryPoint(sym, toP3(rootPoint), k)
      out.push(this.workspace.rootToWorld(new vec3(q.x, q.y, q.z)))
    }
    return out
  }

  /** Base fields for a new item using the current color, material and layer. */
  baseItem(): Pick<SketchItem, "color" | "material" | "layer"> {
    return {
      color: [...this.state.color] as [number, number, number],
      material: this.state.material,
      layer: this.state.activeLayer
    }
  }
}

export interface Tool {
  readonly id: ToolId
  /** One-line instruction shown in the HUD. */
  hint(ctx: ToolContext): string
  activate(ctx: ToolContext): void
  /** Must abandon any in-progress operation cleanly. */
  deactivate(ctx: ToolContext): void
  /**
   * Called every frame with the dominant hand. `active` is false when the hand is not available to the tool
   * (pinch started on UI, or both hands are navigating) — the tool should only draw hover feedback then.
   */
  update(ctx: ToolContext, hand: HandState, active: boolean): void
  /** True when the tool currently wants pinches of the non-dominant hand (e.g. two-hand scaling of a grab). */
  wantsSecondHand?(ctx: ToolContext): boolean
  /** Receives the non-dominant hand while {@link wantsSecondHand} holds or its pinch continues. */
  updateSecondHand?(ctx: ToolContext, hand: HandState): void
}

/** Draws the world-space bounding box of an item. */
export function drawItemBox(
  ctx: ToolContext,
  id: string,
  color: [number, number, number],
  thickness: number = 0.1
): void {
  const item = ctx.doc.get(id)
  const bounds = ctx.views.getBounds(id)
  if (!item || !bounds || !ctx.views.isVisible(item)) {
    return
  }
  const pad = ctx.worldToSketchLength(0.4)
  const s = item.transform.scale
  const padLocal = new vec3(
    pad / Math.max(Math.abs(s.x), 1e-4),
    pad / Math.max(Math.abs(s.y), 1e-4),
    pad / Math.max(Math.abs(s.z), 1e-4)
  )
  const min = new vec3(bounds.min.x, bounds.min.y, bounds.min.z).sub(padLocal)
  const max = new vec3(bounds.max.x, bounds.max.y, bounds.max.z).add(padLocal)
  ctx.gizmos.box(
    min,
    max,
    (p) => ctx.workspace.rootToWorld(itemToRoot(item.transform, {x: p.x, y: p.y, z: p.z})),
    thickness,
    color
  )
}
