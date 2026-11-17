/**
 * SPECS Inc. 2027
 * Helpers that turn root-space tool output into items whose local origin sits at their own center,
 * so grabbing, rotating and scaling them pivots naturally.
 */
import {identityTransform, SketchItem} from "../Core/SketchTypes"
import {centroid} from "../Geometry/Curve"
import {P3, sub} from "../Geometry/Vec"
import {ToolContext} from "./Tool"

/**
 * Moves an item built in root space (identity transform) so its local origin is the centroid of its curves.
 * Also re-expresses the current symmetry in the item's local space.
 */
export function centerCurveItem(ctx: ToolContext, item: SketchItem): SketchItem {
  const all: P3[] = [...(item.points ?? []), ...(item.points2 ?? [])]
  const c = all.length > 0 ? centroid(all) : {x: 0, y: 0, z: 0}
  const shift = (pts?: P3[]) => pts?.map((p) => sub(p, c))
  const out: SketchItem = {
    ...item,
    points: shift(item.points),
    points2: shift(item.points2),
    axisOrigin: item.axisOrigin ? sub(item.axisOrigin, c) : undefined,
    transform: identityTransform(),
    symmetry: ctx.localSymmetry(c)
  }
  out.transform.position = c
  // Strip undefined fields so saved files stay compact.
  for (const key of Object.keys(out) as (keyof SketchItem)[]) {
    if (out[key] === undefined) {
      delete out[key]
    }
  }
  return out
}
