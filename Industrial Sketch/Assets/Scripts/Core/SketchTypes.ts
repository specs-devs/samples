/**
 * SPECS Inc. 2027
 * Serializable data model of an Industrial Sketch document.
 *
 * Everything that makes up a sketch is plain JSON-friendly data so it can be saved to persistent storage,
 * shared with collaborators and snapshotted for undo/redo without touching the scene graph.
 */
import {PrimitiveKind} from "../Geometry/Primitives"
import {Cage, CageKind} from "../Geometry/SubD"
import {Symmetry} from "../Geometry/Symmetry"
import {CrossSection} from "../Geometry/TubeBuilder"
import {P3} from "../Geometry/Vec"

export enum ItemKind {
  /** Swept cross-section along a hand-drawn curve. */
  Stroke = "stroke",
  /** Open surface swept by a hand-held segment. */
  Sweep = "sweep",
  /** Profile curve revolved around an axis. */
  Revolve = "revolve",
  /** Ruled surface between two curves. */
  Loft = "loft",
  /** Filled patch inside a closed curve. */
  Fill = "fill",
  /** Parametric primitive solid. */
  Primitive = "primitive",
  /** Subdivision surface with an editable cage. */
  SubD = "subd",
  /** Dimension line annotation. */
  Measure = "measure",
  /** Pinned text note for reviews. */
  Note = "note"
}

export enum MaterialPreset {
  Matte = "matte",
  Satin = "satin",
  Gloss = "gloss",
  Metal = "metal",
  Chrome = "chrome",
  Flat = "flat"
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  MaterialPreset.Matte,
  MaterialPreset.Satin,
  MaterialPreset.Gloss,
  MaterialPreset.Metal,
  MaterialPreset.Chrome,
  MaterialPreset.Flat
]

export function materialLabel(preset: MaterialPreset): string {
  return preset.charAt(0).toUpperCase() + preset.slice(1)
}

/** Rigid transform plus non-uniform scale, relative to the sketch root. */
export interface ItemTransform {
  position: P3
  /** Quaternion x, y, z, w. */
  rotation: [number, number, number, number]
  scale: P3
}

export function identityTransform(): ItemTransform {
  return {position: {x: 0, y: 0, z: 0}, rotation: [0, 0, 0, 1], scale: {x: 1, y: 1, z: 1}}
}

export interface SketchItem {
  id: string
  kind: ItemKind
  /** Linear RGB in [0, 1]. */
  color: [number, number, number]
  material: MaterialPreset
  layer: number
  /** Items with the same group id are selected and moved together. */
  group?: string
  transform: ItemTransform
  /** Symmetry baked into the item's geometry, in item-local space. */
  symmetry?: Symmetry

  // Curve-based items (local space).
  points?: P3[]
  widths?: number[]
  ups?: P3[]
  section?: CrossSection
  taper?: number
  /** Second curve of a loft. */
  points2?: P3[]
  /** Revolve axis (local space). */
  axisOrigin?: P3
  axisDir?: P3
  /** Revolve segment count. */
  segments?: number

  // Primitive items.
  primitive?: PrimitiveKind

  // SubD items.
  cage?: Cage
  cageKind?: CageKind
  level?: number

  // Note items.
  text?: string
}

/** Longest note text kept in files and network messages. */
export const NOTE_MAX_LENGTH = 200

/**
 * A saved view: where the viewer's head is relative to the sketch, which way it faces and the view scale.
 * Applying it moves the sketch so the viewer sees it exactly as when it was saved.
 */
export interface Viewpoint {
  /** Head position in sketch-root space. */
  position: P3
  /** Heading of the head in sketch-root space (radians about +Y, 0 = +Z). */
  yaw: number
  scale: number
}

/** Viewpoints come from storage and the network: reject values that would throw the sketch out of view. */
export function isValidViewpoint(value: unknown): value is Viewpoint {
  const v = value as Viewpoint
  const bounded = (n: number) => Math.abs(n) < 1e6
  return (
    !!v &&
    isP3(v.position) &&
    bounded(v.position.x) &&
    bounded(v.position.y) &&
    bounded(v.position.z) &&
    isNum(v.yaw) &&
    Math.abs(v.yaw) < 1e3 &&
    isNum(v.scale) &&
    v.scale > 1e-3 &&
    v.scale < 1e3
  )
}

export const SKETCH_FORMAT_VERSION = 1

export interface SketchFile {
  format: "industrial-sketch"
  version: number
  name: string
  savedAt: number
  items: SketchItem[]
  /** View scale when the sketch was saved (informational; opening a sketch frames it to fit). */
  viewScale?: number
  /** Saved viewpoints (null = empty slot). */
  viewpoints?: (Viewpoint | null)[]
}

let idCounter = 0

/** Unique-enough id for items created on this device (time + counter + random suffix). */
export function newItemId(): string {
  idCounter = (idCounter + 1) % 1679616
  return (
    Date.now().toString(36) +
    "-" +
    idCounter.toString(36) +
    "-" +
    Math.floor(Math.random() * 1679616)
      .toString(36)
      .padStart(4, "0")
  )
}

export function cloneItem(item: SketchItem): SketchItem {
  return JSON.parse(JSON.stringify(item)) as SketchItem
}

/**
 * Rounds coordinates to 0.001 sketch units (10 µm at life size) to keep saved files and network messages compact
 * while staying precise when sketching zoomed in (at 25× a 0.1 cm brush is 0.004 units wide).
 */
export function compactItem(item: SketchItem): SketchItem {
  const round = (v: number) => Math.round(v * 1000) / 1000
  const roundP = (p: P3): P3 => ({x: round(p.x), y: round(p.y), z: round(p.z)})
  const roundDir = (p: P3): P3 => ({
    x: Math.round(p.x * 1000) / 1000,
    y: Math.round(p.y * 1000) / 1000,
    z: Math.round(p.z * 1000) / 1000
  })
  const out = cloneItem(item)
  if (out.points) out.points = out.points.map(roundP)
  if (out.points2) out.points2 = out.points2.map(roundP)
  if (out.ups) out.ups = out.ups.map(roundDir)
  if (out.widths) out.widths = out.widths.map(round)
  if (out.cage)
    out.cage.vertices = out.cage.vertices.map((v) => ({
      x: Math.round(v.x * 10000) / 10000,
      y: Math.round(v.y * 10000) / 10000,
      z: Math.round(v.z * 10000) / 10000
    }))
  return out
}

/** Validates loosely-typed JSON (from storage or the network) before it reaches the document. */
function isNum(v: unknown): v is number {
  return typeof v === "number" && isFinite(v)
}

function isP3(p: unknown): boolean {
  const q = p as P3
  return !!q && isNum(q.x) && isNum(q.y) && isNum(q.z)
}

function isP3List(list: unknown, min: number): boolean {
  return Array.isArray(list) && list.length >= min && list.every(isP3)
}

export function isValidItem(value: unknown): value is SketchItem {
  if (!value || typeof value !== "object") {
    return false
  }
  const item = value as SketchItem
  if (typeof item.id !== "string" || typeof item.kind !== "string") {
    return false
  }
  const t = item.transform
  if (!t || !isP3(t.position) || !isP3(t.scale) || !Array.isArray(t.rotation) || t.rotation.length !== 4) {
    return false
  }
  if (!t.rotation.every(isNum)) {
    return false
  }
  if (!Array.isArray(item.color) || item.color.length !== 3 || !item.color.every(isNum)) {
    return false
  }
  if (item.widths !== undefined && (!Array.isArray(item.widths) || !item.widths.every(isNum))) {
    return false
  }
  if (item.ups !== undefined && !isP3List(item.ups, 0)) {
    return false
  }
  switch (item.kind) {
    case ItemKind.Stroke:
    case ItemKind.Sweep:
    case ItemKind.Fill:
    case ItemKind.Measure:
      return isP3List(item.points, 2)
    case ItemKind.Revolve:
      return isP3List(item.points, 2) && isP3(item.axisOrigin) && isP3(item.axisDir)
    case ItemKind.Loft:
      return isP3List(item.points, 2) && isP3List(item.points2, 2)
    case ItemKind.Primitive:
      return typeof item.primitive === "string"
    case ItemKind.Note:
      return isP3List(item.points, 1) && typeof item.text === "string" && item.text.length <= NOTE_MAX_LENGTH
    case ItemKind.SubD: {
      const cage = item.cage
      if (!cage || !isP3List(cage.vertices, 3) || !Array.isArray(cage.faces)) {
        return false
      }
      const n = cage.vertices.length
      return cage.faces.every(
        (f) => Array.isArray(f) && f.length >= 3 && f.every((i) => Number.isInteger(i) && i >= 0 && i < n)
      )
    }
    default:
      return false
  }
}
