/**
 * SPECS Inc. 2027
 * Keeps one scene object per sketch item in sync with the document, and answers picking queries.
 */
import {AppState} from "../Core/AppState"
import {buildItemMesh, distanceToItem} from "../Core/ItemGeometry"
import {applyItemTransform, rootToItem} from "../Core/LensMath"
import {ItemChange, SketchDocument} from "../Core/SketchDocument"
import {ItemKind, SketchItem} from "../Core/SketchTypes"
import {MeshData} from "../Geometry/MeshData"
import {Bounds3} from "../Geometry/Vec"
import {MaterialLibrary} from "./MaterialLibrary"
import {MeshDisplay, toRenderMeshes} from "./MeshFactory"

interface ItemView {
  item: SketchItem
  display: MeshDisplay
  mesh: MeshData
  bounds: Bounds3
  /** JSON of the geometry-relevant fields, to skip rebuilding when only the transform or color changed. */
  geometryKey: string
  highlighted: boolean
}

export interface PickResult {
  id: string
  distance: number
}

function geometryKeyOf(item: SketchItem): string {
  return JSON.stringify([
    item.kind,
    item.points,
    item.points2,
    item.widths,
    item.ups,
    item.section,
    item.taper,
    item.axisOrigin,
    item.axisDir,
    item.segments,
    item.primitive,
    item.cage,
    item.level,
    item.symmetry
  ])
}

export class ItemViews {
  private views = new Map<string, ItemView>()
  private readonly container: SceneObject
  private sharedMeshes = new Map<string, RenderMesh[]>()
  /** Items whose view is hidden while a tool shows a live replacement (e.g. during point editing). */
  private suppressed = new Set<string>()

  constructor(
    root: SceneObject,
    private readonly doc: SketchDocument,
    private readonly materials: MaterialLibrary,
    private readonly state: AppState
  ) {
    this.container = global.scene.createSceneObject("Items")
    this.container.setParent(root)
    doc.onItemChanged.add((change) => this.onChange(change))
    state.onChanged.add((key) => {
      if (key === "layers") {
        this.refreshVisibility()
      } else if (key === "selection") {
        this.refreshHighlights()
      }
    })
  }

  get root(): SceneObject {
    return this.container
  }

  getMesh(id: string): MeshData | null {
    return this.views.get(id)?.mesh ?? null
  }

  getBounds(id: string): Bounds3 | null {
    return this.views.get(id)?.bounds ?? null
  }

  getSceneObject(id: string): SceneObject | null {
    return this.views.get(id)?.display.sceneObject ?? null
  }

  /** Hides an item's view while a tool renders a live version of it. */
  setSuppressed(id: string, suppressed: boolean): void {
    if (suppressed) {
      this.suppressed.add(id)
    } else {
      this.suppressed.delete(id)
    }
    const view = this.views.get(id)
    if (view) {
      view.display.enabled = this.isVisible(view.item)
    }
  }

  isVisible(item: SketchItem): boolean {
    return this.state.isLayerVisible(item.layer) && !this.suppressed.has(item.id)
  }

  /**
   * Closest visible item to a point in sketch-root space, within `maxDistance` (root units).
   * `filter` can restrict the item kinds considered.
   */
  pick(rootPoint: vec3, maxDistance: number, filter?: (item: SketchItem) => boolean): PickResult | null {
    let best: PickResult | null = null
    this.views.forEach((view, id) => {
      if (!this.isVisible(view.item) || (filter && !filter(view.item))) {
        return
      }
      const local = rootToItem(view.item.transform, rootPoint)
      // Convert the root-space tolerance into local units (non-uniform scale: use the smallest axis).
      const s = view.item.transform.scale
      const unit = Math.max(1e-4, Math.min(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)))
      const d = distanceToItem(view.item, local, view.mesh, view.bounds, maxDistance / unit) * unit
      if (d <= maxDistance && (!best || d < best.distance)) {
        best = {id, distance: d}
      }
    })
    return best
  }

  private onChange(change: ItemChange): void {
    const existing = this.views.get(change.id)
    if (change.item === null) {
      if (existing) {
        existing.display.destroy()
        this.views.delete(change.id)
      }
      this.suppressed.delete(change.id)
      return
    }
    const item = change.item
    if (!existing) {
      const display = new MeshDisplay(this.container, item.kind + ":" + item.id)
      const view: ItemView = {
        item,
        display,
        mesh: new MeshData(),
        bounds: {min: {x: 0, y: 0, z: 0}, max: {x: 0, y: 0, z: 0}},
        geometryKey: "",
        highlighted: false
      }
      this.views.set(item.id, view)
      this.updateView(view, item)
    } else {
      this.updateView(existing, item)
    }
  }

  private updateView(view: ItemView, item: SketchItem): void {
    view.item = item
    const key = geometryKeyOf(item)
    if (key !== view.geometryKey) {
      view.geometryKey = key
      view.mesh = buildItemMesh(item)
      view.bounds = view.mesh.computeBounds()
      view.display.setMeshes(this.renderMeshesFor(item, view.mesh))
    }
    applyItemTransform(view.display.sceneObject.getTransform(), item.transform)
    view.highlighted = this.state.selection.indexOf(item.id) >= 0
    view.display.setMaterial(this.materials.get(item.color, item.material, view.highlighted))
    view.display.enabled = this.isVisible(item)
  }

  private renderMeshesFor(item: SketchItem, mesh: MeshData): RenderMesh[] {
    // Primitives without symmetry share one uploaded mesh per kind; all note pins share one too.
    const key =
      item.kind === ItemKind.Note
        ? "note"
        : item.kind === ItemKind.Primitive && !item.symmetry && item.primitive
          ? "primitive:" + item.primitive
          : null
    if (key) {
      let shared = this.sharedMeshes.get(key)
      if (!shared) {
        shared = toRenderMeshes(mesh)
        this.sharedMeshes.set(key, shared)
      }
      return shared
    }
    return toRenderMeshes(mesh)
  }

  private refreshVisibility(): void {
    this.views.forEach((view) => {
      view.display.enabled = this.isVisible(view.item)
    })
  }

  private refreshHighlights(): void {
    const selected = new Set(this.state.selection)
    this.views.forEach((view, id) => {
      const h = selected.has(id)
      if (h !== view.highlighted) {
        view.highlighted = h
        view.display.setMaterial(this.materials.get(view.item.color, view.item.material, h))
      }
    })
  }
}
