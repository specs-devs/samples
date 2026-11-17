/**
 * SPECS Inc. 2027
 * Commands that act on the current selection: duplicate, delete, mirror, group, recolor, align.
 */
import {AppState} from "../Core/AppState"
import {arrayToQuat, quatToArray} from "../Core/LensMath"
import {SketchDocument} from "../Core/SketchDocument"
import {cloneItem, newItemId, SketchItem} from "../Core/SketchTypes"
import {Symmetry, SymmetryMode} from "../Geometry/Symmetry"
import {P3} from "../Geometry/Vec"

export class SelectionActions {
  constructor(
    private readonly doc: SketchDocument,
    private readonly state: AppState
  ) {}

  private selected(): SketchItem[] {
    return this.state.selection.map((id) => this.doc.get(id)).filter((i): i is SketchItem => !!i)
  }

  private require(): SketchItem[] | null {
    const items = this.selected()
    if (items.length === 0) {
      this.state.toast("Select something first (Grab tool)")
      return null
    }
    return items
  }

  /** Copies the selection, offset by `offset` in sketch units along +X. Groups stay grouped (as new groups). */
  duplicate(offset: number = 3): void {
    const items = this.require()
    if (!items) return
    const changes = new Map<string, SketchItem | null>()
    const groupMap = new Map<string, string>()
    const ids: string[] = []
    for (const item of items) {
      const copy = cloneItem(item)
      copy.id = newItemId()
      if (item.group) {
        let g = groupMap.get(item.group)
        if (!g) {
          g = newItemId()
          groupMap.set(item.group, g)
        }
        copy.group = g
      }
      copy.transform.position = {
        x: item.transform.position.x + offset,
        y: item.transform.position.y,
        z: item.transform.position.z
      }
      changes.set(copy.id, copy)
      ids.push(copy.id)
    }
    this.doc.commit("Duplicate", changes)
    this.state.selection = ids
  }

  delete(): void {
    const items = this.require()
    if (!items) return
    this.doc.remove(
      "Delete",
      items.map((i) => i.id)
    )
    this.state.selection = []
  }

  /** Mirrored copy across the sketch's YZ plane (x = 0). */
  mirrorCopy(): void {
    const items = this.require()
    if (!items) return
    const changes = new Map<string, SketchItem | null>()
    const ids: string[] = []
    for (const item of items) {
      const copy = mirrorItemX(item)
      changes.set(copy.id, copy)
      ids.push(copy.id)
    }
    this.doc.commit("Mirror", changes)
    this.state.selection = ids
  }

  group(): void {
    const items = this.require()
    if (!items) return
    if (items.length < 2) {
      this.state.toast("Select two or more items to group")
      return
    }
    const g = newItemId()
    const changes = new Map<string, SketchItem | null>()
    for (const item of items) {
      const copy = cloneItem(item)
      copy.group = g
      changes.set(copy.id, copy)
    }
    this.doc.commit("Group", changes)
    this.state.toast("Grouped " + items.length + " items")
  }

  ungroup(): void {
    const items = this.require()
    if (!items) return
    const changes = new Map<string, SketchItem | null>()
    for (const item of items) {
      if (item.group) {
        const copy = cloneItem(item)
        delete copy.group
        changes.set(copy.id, copy)
      }
    }
    if (changes.size === 0) {
      this.state.toast("Nothing grouped")
      return
    }
    this.doc.commit("Ungroup", changes)
  }

  /** Applies the current color and material to the selection. */
  applyMaterial(): void {
    const items = this.require()
    if (!items) return
    const changes = new Map<string, SketchItem | null>()
    for (const item of items) {
      const copy = cloneItem(item)
      copy.color = [...this.state.color] as [number, number, number]
      copy.material = this.state.material
      changes.set(copy.id, copy)
    }
    this.doc.commit("Paint", changes)
  }

  /** Moves the selection to the active layer. */
  moveToActiveLayer(): void {
    const items = this.require()
    if (!items) return
    const changes = new Map<string, SketchItem | null>()
    for (const item of items) {
      const copy = cloneItem(item)
      copy.layer = this.state.activeLayer
      changes.set(copy.id, copy)
    }
    this.doc.commit("Move to layer", changes)
  }

  /** Resets rotation of the selection (keeps position and scale). */
  straighten(): void {
    const items = this.require()
    if (!items) return
    const changes = new Map<string, SketchItem | null>()
    for (const item of items) {
      const copy = cloneItem(item)
      copy.transform.rotation = [0, 0, 0, 1]
      changes.set(copy.id, copy)
    }
    this.doc.commit("Straighten", changes)
  }

  /** Centers the selection on the symmetry plane (x = 0). */
  centerOnAxis(): void {
    const items = this.require()
    if (!items) return
    let sum = 0
    for (const item of items) {
      sum += item.transform.position.x
    }
    const dx = -sum / items.length
    const changes = new Map<string, SketchItem | null>()
    for (const item of items) {
      const copy = cloneItem(item)
      copy.transform.position.x += dx
      changes.set(copy.id, copy)
    }
    this.doc.commit("Center", changes)
  }

  selectAll(): void {
    this.state.selection = this.doc
      .all()
      .filter((i) => this.state.isLayerVisible(i.layer))
      .map((i) => i.id)
  }

  clearSelection(): void {
    this.state.selection = []
  }
}

function reflectX(p: P3): P3 {
  return {x: -p.x, y: p.y, z: p.z}
}

/**
 * A copy of `item` mirrored across the root x = 0 plane. Curve geometry is reflected point by point, so the
 * result is an exact mirror; parametric items (primitives, SubD) mirror their transform and cage.
 */
export function mirrorItemX(item: SketchItem): SketchItem {
  const copy = cloneItem(item)
  copy.id = newItemId()
  delete copy.group
  // World = T + R * (S * local). Mirroring: x' = -x. Reflect the position, conjugate the rotation by the
  // reflection, and reflect the local geometry along X so the handedness is preserved.
  const q = arrayToQuat(item.transform.rotation)
  copy.transform.position = reflectX(item.transform.position)
  // M R M for M = diag(-1, 1, 1) in quaternion form: (w, x, -y, -z).
  copy.transform.rotation = quatToArray(new quat(q.w, q.x, -q.y, -q.z))
  const reflectLocal = (pts?: P3[]) => pts?.map(reflectX)
  copy.points = reflectLocal(item.points)
  copy.points2 = reflectLocal(item.points2)
  copy.ups = reflectLocal(item.ups)
  if (item.axisOrigin) copy.axisOrigin = reflectX(item.axisOrigin)
  if (item.axisDir) copy.axisDir = reflectX(item.axisDir)
  if (item.cage) {
    // Reflect vertices and reverse face winding so normals keep pointing outward.
    copy.cage = {
      vertices: item.cage.vertices.map(reflectX),
      faces: item.cage.faces.map((f) => f.slice().reverse())
    }
  }
  if (item.symmetry) {
    const s: Symmetry = item.symmetry
    copy.symmetry = {...s, origin: reflectX(s.origin), axis: s.mode === SymmetryMode.Mirror ? s.axis : reflectX(s.axis)}
  }
  for (const key of Object.keys(copy) as (keyof SketchItem)[]) {
    if (copy[key] === undefined) {
      delete copy[key]
    }
  }
  return copy
}
